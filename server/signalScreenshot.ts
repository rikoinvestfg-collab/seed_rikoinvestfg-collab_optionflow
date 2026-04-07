/**
 * signalScreenshot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a styled PNG card (like the Flow Intel UI card) for a given
 * FlowIntelSignal and returns the PNG buffer.
 *
 * Uses Playwright's Chromium (already available in the sandbox) to render
 * a self-contained HTML page and take a screenshot.
 */

// Use dynamic require to avoid esbuild bundling playwright internals
// (playwright is available as a global package in this environment)
import type { FlowIntelSignal } from "./discordSender";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("playwright") as typeof import("playwright");

// ── Color helpers ─────────────────────────────────────────────────────────────
function setupColor(setup: string): { bg: string; border: string; text: string } {
  if (setup === "Long")  return { bg: "#052e16", border: "#00C9A7", text: "#00C9A7" };
  if (setup === "Short") return { bg: "#2d0a0a", border: "#FF4444", text: "#FF4444" };
  return { bg: "#1c1c1e", border: "#555", text: "#999" };
}

function confidenceColor(conf: string): string {
  if (conf === "Alta")  return "#00C9A7";
  if (conf === "Media") return "#FFAA00";
  return "#888";
}

function semaphoreInfo(conf: string[]):
  { label: string; color: string; bg: string } {
  const checks = conf.filter(c => !c.startsWith("⚠") && !c.startsWith("⚪")).length;
  if (checks >= 4)  return { label: "🎯 SNIPER",  color: "#00C9A7", bg: "rgba(0,201,167,0.12)" };
  if (checks >= 2)  return { label: "⚙️ SETUP",   color: "#FFAA00", bg: "rgba(255,170,0,0.12)" };
  return                     { label: "⚠️ DÉBIL",  color: "#888",    bg: "rgba(136,136,136,0.12)" };
}

// ── HTML card builder ─────────────────────────────────────────────────────────
function buildHtml(sig: FlowIntelSignal & { contractRec?: string; technicals?: any }): string {
  const col   = setupColor(sig.setup);
  const cConf = confidenceColor(sig.confidence);
  const sema  = semaphoreInfo(sig.confirmations);
  const isLong  = sig.setup === "Long";
  const isShort = sig.setup === "Short";

  const setupLabel = isLong  ? "LONG ▲" : isShort ? "SHORT ▼" : "NO TRADE";
  const biasIcon   = sig.bias.includes("Alcista") ? "▲" : sig.bias.includes("Bajista") ? "▼" : "●";
  const biasColor  = sig.bias.includes("Alcista") ? "#00C9A7" : sig.bias.includes("Bajista") ? "#FF4444" : "#999";

  // Technicals strip
  const t = sig.technicals;
  const techStrip = t ? `
    <div class="tech-strip">
      <span class="tech-item"><span class="tlabel">VWAP</span> <span class="tval ${t.vwapDistPct >= 0 ? 'tup' : 'tdown'}">$${t.vwap} (${t.vwapDistPct >= 0 ? '+' : ''}${t.vwapDistPct}%)</span></span>
      <span class="tech-sep">|</span>
      <span class="tech-item"><span class="tlabel">BB</span> <span class="tval">${t.bbLower} – ${t.bbUpper}</span></span>
      <span class="tech-sep">|</span>
      <span class="tech-item"><span class="tlabel">EMA9</span> <span class="tval">${t.ema9}</span></span>
      <span class="tech-sep">|</span>
      <span class="tech-item"><span class="tlabel">EMA21</span> <span class="tval">${t.ema21}</span></span>
      <span class="tech-sep">|</span>
      <span class="tech-item"><span class="tlabel">RANGO DÍA</span> <span class="tval">${t.dayRangePct}%</span></span>
      ${t.overExtended ? '<span class="tech-warn">⚠ SOBREEXT.</span>' : ''}
    </div>` : "";

  const confirmationLines = sig.confirmations.slice(0, 5).map(c => {
    const icon = c.startsWith("⚠") ? "⚠️" : c.startsWith("⚪") ? "⚪" : "●";
    const clean = c.replace(/^[⚠️⚪✅●\s]+/, "");
    const color = c.startsWith("⚠") ? "#FFAA00" : c.startsWith("⚪") ? "#555" : "#00C9A7";
    return `<div class="conf-line"><span style="color:${color};margin-right:6px">${icon}</span><span>${clean}</span></div>`;
  }).join("");

  const time = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }) + " ET";

  const sessionBadge = sig.session === "MERCADO" ? "🟢 MERCADO"
    : sig.session === "PRE-MARKET" ? "🟡 PRE-MARKET"
    : sig.session === "POST-MARKET" ? "🔵 POST-MARKET"
    : "⚫ CERRADO";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d0d0f;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    color: #e2e8f0;
    padding: 0;
    width: 680px;
  }
  .card {
    background: #111115;
    border: 1px solid ${col.border};
    border-radius: 12px;
    overflow: hidden;
    margin: 0;
  }
  /* Header */
  .header {
    background: linear-gradient(135deg, #16161a 0%, #1a1a20 100%);
    border-bottom: 1px solid #222;
    padding: 14px 16px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ticker-icon {
    width: 38px; height: 38px;
    background: ${col.bg};
    border: 1.5px solid ${col.border};
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: ${col.text};
  }
  .header-main { flex: 1; }
  .ticker-row { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
  .ticker-name { font-size: 20px; font-weight: 700; color: #f8fafc; letter-spacing: 0.5px; }
  .setup-badge {
    background: ${col.bg};
    border: 1px solid ${col.border};
    color: ${col.text};
    font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 4px;
  }
  .conf-badge {
    background: rgba(0,0,0,0.4);
    border: 1px solid ${cConf};
    color: ${cConf};
    font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 4px;
    display: flex; align-items: center; gap: 4px;
  }
  .fire-icon {
    background: linear-gradient(135deg, #ff6b00, #ffd600);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .sema-badge {
    background: ${sema.bg};
    border: 1px solid ${sema.color}44;
    color: ${sema.color};
    font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 4px;
  }
  .session-badge {
    font-size: 9px; color: #666;
    background: #1a1a20; border: 1px solid #2a2a35;
    padding: 2px 6px; border-radius: 4px;
  }
  /* Tech strip */
  .tech-strip {
    background: #0d0d10;
    border-bottom: 1px solid #1c1c24;
    padding: 7px 16px;
    display: flex; align-items: center; gap: 8px;
    font-size: 10px; flex-wrap: wrap;
  }
  .tech-item { display: flex; gap: 4px; }
  .tlabel { color: #555; text-transform: uppercase; }
  .tval { color: #aaa; }
  .tup { color: #00C9A7; } .tdown { color: #FF4444; }
  .tech-sep { color: #2a2a35; }
  .tech-warn { color: #FFAA00; font-size: 9px; font-weight: 700; margin-left: 4px; }
  /* Body */
  .body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  /* Entry trigger */
  .entry-section { background: #0d0d10; border: 1px solid #1e2a26; border-radius: 8px; padding: 11px 14px; }
  .section-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1.2px;
    color: #444; text-transform: uppercase; margin-bottom: 6px;
    display: flex; align-items: center; gap: 6px;
  }
  .section-label .dot { width: 5px; height: 5px; border-radius: 50%; background: #00C9A7; }
  .entry-text { font-size: 12px; color: #fff; font-weight: 500; line-height: 1.5; }
  /* SL / TP row */
  .sltp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sl-box {
    background: rgba(255,68,68,0.08);
    border: 1px solid rgba(255,68,68,0.3);
    border-radius: 8px; padding: 10px 12px;
  }
  .tp-box {
    background: rgba(0,201,167,0.08);
    border: 1px solid rgba(0,201,167,0.3);
    border-radius: 8px; padding: 10px 12px;
  }
  .sltp-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; }
  .sl-box .sltp-label { color: #FF6666; }
  .tp-box .sltp-label { color: #00C9A7; }
  .sltp-value { font-size: 14px; font-weight: 700; }
  .sl-box .sltp-value { color: #FFBBBB; }
  .tp-box .sltp-value { color: #8EFFD6; }
  /* Contract */
  .contract-box {
    background: rgba(255,154,0,0.06);
    border: 1px solid rgba(255,154,0,0.25);
    border-radius: 8px; padding: 10px 14px;
  }
  .contract-label { font-size: 9px; font-weight: 700; color: #FF9A00; letter-spacing: 1px; margin-bottom: 4px; }
  .contract-value { font-size: 13px; font-weight: 700; color: #FFD580; }
  /* Confirmations */
  .conf-section {}
  .conf-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .conf-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #444; }
  .conf-count { font-size: 9px; color: #555; }
  .conf-line {
    display: flex; align-items: flex-start; gap: 4px;
    font-size: 11px; color: #bbb; margin-bottom: 5px; line-height: 1.4;
  }
  /* Bottom row */
  .bottom-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .bottom-cell {
    background: #0d0d10; border: 1px solid #1c1c24; border-radius: 8px; padding: 9px 11px;
  }
  .bc-label { font-size: 8px; font-weight: 700; letter-spacing: 1px; color: #444; text-transform: uppercase; margin-bottom: 5px; display: flex; align-items: center; gap: 5px; }
  .bc-icon { font-size: 9px; }
  .bc-value { font-size: 11px; color: #ccc; line-height: 1.4; }
  .bc-sub { font-size: 9px; color: #555; margin-top: 2px; }
  /* GEX levels */
  .gex-row { display: flex; flex-direction: column; gap: 3px; }
  .gex-item { display: flex; justify-content: space-between; font-size: 10px; }
  .gex-key { color: #555; } .gex-val { color: #ccc; font-weight: 600; }
  .gex-val.call { color: #00C9A7; } .gex-val.put { color: #FF4444; }
  /* Bias */
  .bias-val { font-size: 13px; font-weight: 700; }
  /* Footer */
  .footer {
    background: #0a0a0e;
    border-top: 1px solid #1a1a22;
    padding: 8px 16px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-brand { font-size: 10px; color: #333; font-weight: 600; letter-spacing: 0.5px; }
  .footer-brand span { color: #00C9A7; }
  .footer-time { font-size: 9px; color: #2a2a35; }
</style>
</head>
<body>
<div class="card">

  <!-- Header -->
  <div class="header">
    <div class="ticker-icon">${sig.symbol.substring(0,4)}</div>
    <div class="header-main">
      <div class="ticker-row">
        <span class="ticker-name">${sig.symbol}</span>
        <span class="setup-badge">${setupLabel}</span>
        <span class="conf-badge">
          <span class="fire-icon">🔥</span>${sig.confidence}
        </span>
        <span class="sema-badge">${sema.label}</span>
      </div>
      <div class="ticker-row">
        <span class="session-badge">${sessionBadge}</span>
        <span style="font-size:9px;color:#333">${time}</span>
      </div>
    </div>
  </div>

  <!-- Technicals strip -->
  ${techStrip}

  <!-- Body -->
  <div class="body">

    <!-- Entry trigger -->
    ${(isLong || isShort) ? `
    <div class="entry-section">
      <div class="section-label"><span class="dot"></span>TRIGGER DE ENTRADA</div>
      <div class="entry-text">${sig.entry}</div>
    </div>

    <!-- SL / TP -->
    <div class="sltp-row">
      <div class="sl-box">
        <div class="sltp-label">● STOP LOSS</div>
        <div class="sltp-value">${sig.stopLoss}</div>
      </div>
      <div class="tp-box">
        <div class="sltp-label">● TAKE PROFIT</div>
        <div class="sltp-value">${sig.takeProfit}</div>
      </div>
    </div>

    ${sig.contractRec ? `
    <div class="contract-box">
      <div class="contract-label">🎯 CONTRATO 0DTE RECOMENDADO</div>
      <div class="contract-value">${sig.contractRec}</div>
    </div>` : ""}
    ` : `
    <div class="entry-section">
      <div class="section-label"><span style="color:#888">⊘</span>&nbsp;ANÁLISIS</div>
      <div class="entry-text" style="color:#888">${sig.entry}</div>
    </div>
    `}

    <!-- Confirmations -->
    <div class="conf-section">
      <div class="conf-header">
        <span class="conf-label">✅ CONFIRMACIONES</span>
        <span class="conf-count">(${sig.confirmations.filter(c=>!c.startsWith("⚠")&&!c.startsWith("⚪")).length}/${sig.confirmations.length})</span>
      </div>
      ${confirmationLines}
    </div>

    <!-- Bottom grid: Market Mode / Bias / GEX levels -->
    <div class="bottom-grid">
      <div class="bottom-cell">
        <div class="bc-label"><span class="bc-icon">〜</span> MARKET MODE</div>
        <div class="bc-value">${sig.marketMode.replace(" — ", "\n").split("\n")[0]}</div>
        <div class="bc-sub">${sig.marketMode.replace(" — ", "\n").split("\n")[1] || ""}</div>
      </div>
      <div class="bottom-cell">
        <div class="bc-label"><span class="bc-icon">↗</span> BIAS</div>
        <div class="bias-val" style="color:${biasColor}">${biasIcon} ${sig.bias}</div>
      </div>
      <div class="bottom-cell">
        <div class="bc-label"><span class="bc-icon">◎</span> NIVELES GEX</div>
        <div class="gex-row">
          <div class="gex-item"><span class="gex-key">Gamma Flip</span><span class="gex-val">${sig.keyLevels.gammaFlip}</span></div>
          <div class="gex-item"><span class="gex-key">Call Wall</span><span class="gex-val call">${sig.keyLevels.callWall}</span></div>
          <div class="gex-item"><span class="gex-key">Max Pain</span><span class="gex-val">${sig.keyLevels.maxPain}</span></div>
          <div class="gex-item"><span class="gex-key">Put Wall</span><span class="gex-val put">${sig.keyLevels.putWall}</span></div>
        </div>
      </div>
    </div>

    <!-- Flow / Dark Pool summaries -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="bottom-cell">
        <div class="bc-label"><span class="bc-icon">〜</span> FLUJO INSTITUCIONAL</div>
        <div class="bc-value" style="font-size:10px;line-height:1.5">${sig.flowSummary}</div>
      </div>
      <div class="bottom-cell">
        <div class="bc-label"><span class="bc-icon">≋</span> LIQUIDEZ / DARK POOL</div>
        <div class="bc-value" style="font-size:10px;line-height:1.5">${sig.liquiditySummary}</div>
      </div>
    </div>

  </div><!-- /body -->

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand"><span>Option</span>Flow • Flow Intelligence</div>
    <div class="footer-time">${time} • No es asesoría financiera</div>
  </div>

</div>
</body>
</html>`;
}

// ── Screenshot generator ──────────────────────────────────────────────────────
let _browser: any = null;

async function getBrowser() {
  if (_browser) {
    try { await _browser.version(); return _browser; } catch { _browser = null; }
  }
  _browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  return _browser;
}

export async function generateSignalImage(
  sig: FlowIntelSignal & { contractRec?: string; technicals?: any }
): Promise<Buffer> {
  const browser = await getBrowser();
  const page    = await browser.newPage();
  try {
    await page.setViewportSize({ width: 680, height: 1200 });
    const html = buildHtml(sig);
    await page.setContent(html, { waitUntil: "networkidle" });
    // Fit height to card content
    const card = await page.$(".card");
    const box  = card ? await card.boundingBox() : null;
    if (box) await page.setViewportSize({ width: 680, height: Math.ceil(box.height) + 2 });
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    return screenshot as Buffer;
  } finally {
    await page.close();
  }
}
