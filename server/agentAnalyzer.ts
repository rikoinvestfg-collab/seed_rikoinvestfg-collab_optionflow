/**
 * agentAnalyzer.ts
 * AI-powered trading signal agent.
 * - Monitors all 22 tickers every 30 seconds
 * - Analyzes flow, news, macro, key levels
 * - Sends signals to Discord + updates GitHub CSV
 * - Only fires when signal changes (avoids spam)
 */

import https from "https";
import { sendSignal, sendMacroAlert, sendNewsAlert, sendDarkPoolDivergence, getNYSession, SignalType, DiscordSignal, DarkPoolDivergenceSignal } from "./discordSender";
import { pushLevelsWithSignal } from "./githubPusher";
import { getDarkPoolPrints, getTickerExposures, type DarkPoolPrint, type TickerExposure } from "./institutionalFetcher";

const TICKERS = [
  "TSLA","MSFT","NVDA","AAPL","AMD","NFLX","GOOG","AMZN","PLTR","AVGO",
  "MU","META","ORCL","SPX","QQQ","DIA","IWM","SPY","SOXL","USO","SLV","GLD"
];

const MONITOR_INTERVAL_MS = 30_000; // 30 seconds

// Track last signal per ticker to avoid spam
const lastSignal: Record<string, { signal: SignalType; score: number; ts: number }> = {};
// Track last dark pool divergence per ticker (avoid spam)
const lastDPDivergence: Record<string, number> = {};
// Track last macro events sent
const sentMacroEvents = new Set<string>();
// Track last news sent
const sentNewsIds     = new Set<number>();

let storageRef: any = null;

// ── Entry point ───────────────────────────────────────────────────────────────
export function initAgent(storage: any) {
  storageRef = storage;
  console.log("[agent] Starting AI signal agent — monitoring every 30s");

  // Run immediately then every 30s
  runAnalysisCycle().catch(console.error);
  setInterval(() => runAnalysisCycle().catch(console.error), MONITOR_INTERVAL_MS);
}

// ── Main cycle ────────────────────────────────────────────────────────────────
async function runAnalysisCycle() {
  const session = getNYSession();
  // Run during all sessions except fully closed overnight
  if (session === "CERRADO") return;

  const [allFlows, allNews, allMacro, allTickers] = await Promise.all([
    safeGet(() => storageRef.getAllOptionsFlow()),
    safeGet(() => storageRef.getAllNews()),
    safeGet(() => storageRef.getAllMacroEvents()),
    safeGet(() => storageRef.getAllTickers()),
  ]);

  // ── Check macro events (send once when actual arrives) ──────────────────
  await checkMacroEvents(allMacro);

  // ── Check breaking news (bullish/bearish, not yet sent) ─────────────────
  await checkBreakingNews(allNews);

  // ── Check Dark Pool vs Price divergence (contrarian signal) ──────────
  await checkDarkPoolDivergence(allTickers, session);

  // ── Analyze each ticker ──────────────────────────────────────────────────
  for (const ticker of TICKERS) {
    try {
      await analyzeTicker(ticker, allFlows, allNews, allMacro, allTickers, session);
    } catch (err) {
      console.error(`[agent] Error analyzing ${ticker}:`, err);
    }
  }
}

// ── Analyze a single ticker ───────────────────────────────────────────────────
async function analyzeTicker(
  ticker:     string,
  allFlows:   any[],
  allNews:    any[],
  allMacro:   any[],
  allTickers: any[],
  session:    string
) {
  // Get ticker price
  const tickerData = allTickers.find((t: any) => t.symbol === ticker);
  const price      = tickerData?.price ? parseFloat(tickerData.price) : 0;
  if (!price) return;

  // Get flows for this ticker (last 2 hours)
  const cutoff     = Date.now() - 2 * 3600_000;
  const tickerFlows = allFlows.filter((f: any) =>
    f.symbol === ticker && new Date(f.timestamp).getTime() > cutoff
  );

  // Get relevant news (last 4 hours)
  const newsCutoff  = Date.now() - 4 * 3600_000;
  const tickerNews  = allNews.filter((n: any) =>
    n.relatedTicker === ticker && new Date(n.timestamp).getTime() > newsCutoff
  ).slice(0, 5);

  // Get today's macro events
  const today      = new Date().toISOString().split("T")[0];
  const macroToday = allMacro.filter((m: any) => m.date === today && m.stars === 3);

  // Derive key levels from flows
  const levels     = deriveLevels(ticker, tickerFlows);

  // Score the setup (0-4 bull, 0-4 bear)
  const { bullScore, bearScore, triggers } = scoreSetup(price, levels, tickerFlows, tickerNews);

  // Determine signal
  const signal: SignalType = bullScore >= 3 ? "ALCISTA" : bearScore >= 3 ? "BAJISTA" : "NEUTRAL";
  const score  = Math.max(bullScore, bearScore);
  const confidence = calculateConfidence(bullScore, bearScore, tickerFlows.length, tickerNews.length);

  // Only send if signal changed OR score improved significantly
  const prev = lastSignal[ticker];
  const shouldSend = !prev ||
    prev.signal !== signal ||
    (score > prev.score && score >= 3) ||
    (Date.now() - prev.ts > 15 * 60_000 && score >= 3); // resend every 15min if still active

  if (!shouldSend) return;

  // Build flow summary
  const flowSummary = buildFlowSummary(tickerFlows);

  // Build news headlines
  const topNews = tickerNews.slice(0, 3).map((n: any) => n.title.substring(0, 80));

  // Get macro description
  const macroEvent = macroToday.length > 0
    ? macroToday.map((m: any) => `${m.event} ${m.actual ? `→ ${m.actual}` : "(pendiente)"}`).join(" | ")
    : "";

  // Generate AI reason
  const aiReason = await generateAIReason({
    ticker, signal, score, confidence, price, levels,
    flowSummary, topNews, macroEvent, triggers, session
  });

  const discordSig: DiscordSignal = {
    ticker, signal, confidence, score, price,
    gammaFlip: levels.gammaFlip,
    maxPain:   levels.maxPain,
    callWall:  levels.callWall,
    putWall:   levels.putWall,
    flowSummary, topNews, macroEvent, aiReason,
    isCritical: score === 4 || triggers.includes("GF_CROSS"),
    session,
  };

  await sendSignal(discordSig);

  // Update GitHub CSV with signal
  await pushLevelsWithSignal(ticker, {
    ...levels,
    signal,
    confidence,
  });

  // Save state
  lastSignal[ticker] = { signal, score, ts: Date.now() };
  console.log(`[agent] ${ticker}: ${signal} (${score}/4, ${confidence}%) → Discord ✓`);
}

// ── Score setup ───────────────────────────────────────────────────────────────
function scoreSetup(price: number, levels: any, flows: any[], news: any[]) {
  const triggers: string[] = [];
  let bullScore = 0, bearScore = 0;

  const pct = 0.003; // 0.3% proximity threshold

  const aboveGF = price > levels.gammaFlip;
  const nearGF  = Math.abs(price - levels.gammaFlip) / levels.gammaFlip <= pct;
  const nearPW  = levels.putWall  && Math.abs(price - levels.putWall)  / levels.putWall  <= pct;
  const nearCW  = levels.callWall && Math.abs(price - levels.callWall) / levels.callWall <= pct;

  // Gamma Flip position
  if (aboveGF)  { bullScore++; triggers.push("ABOVE_GF"); }
  else          { bearScore++; triggers.push("BELOW_GF"); }

  // Near Gamma Flip (momentum point)
  if (nearGF && aboveGF)  { bullScore++; triggers.push("GF_SUPPORT"); }
  if (nearGF && !aboveGF) { bearScore++; triggers.push("GF_RESIST");  }

  // Max Pain position
  if (levels.maxPain) {
    if (price > levels.maxPain) { bullScore++; triggers.push("ABOVE_MP"); }
    else                        { bearScore++; triggers.push("BELOW_MP"); }
  }

  // Near Put Wall (bullish — dealers hedge = support)
  if (nearPW && aboveGF) { bullScore++; triggers.push("PW_SUPPORT"); }
  // Near Call Wall (bearish — dealers hedge = resistance)
  if (nearCW && !aboveGF) { bearScore++; triggers.push("CW_RESIST"); }

  // Flow bias
  const callNotional = flows.filter(f => (f.callPut || f.type || "").toString().toUpperCase().includes("CALL"))
    .reduce((s: number, f: any) => s + parseNotional(f.notional || f.volume || "0"), 0);
  const putNotional  = flows.filter(f => (f.callPut || f.type || "").toString().toUpperCase().includes("PUT"))
    .reduce((s: number, f: any) => s + parseNotional(f.notional || f.volume || "0"), 0);

  if (callNotional > putNotional * 1.5) { bullScore++; triggers.push("CALL_FLOW"); }
  if (putNotional  > callNotional * 1.5) { bearScore++; triggers.push("PUT_FLOW");  }

  // News sentiment
  const bullNews = news.filter(n => n.sentiment === "bullish").length;
  const bearNews = news.filter(n => n.sentiment === "bearish").length;
  if (bullNews > bearNews) { bullScore++; triggers.push("BULL_NEWS"); }
  if (bearNews > bullNews) { bearScore++; triggers.push("BEAR_NEWS"); }

  // Cap at 4
  bullScore = Math.min(bullScore, 4);
  bearScore = Math.min(bearScore, 4);

  return { bullScore, bearScore, triggers };
}

// ── Generate AI explanation via OpenAI ────────────────────────────────────────
async function generateAIReason(ctx: {
  ticker: string; signal: SignalType; score: number; confidence: number;
  price: number; levels: any; flowSummary: string; topNews: string[];
  macroEvent: string; triggers: string[]; session: string;
}): Promise<string> {
  const prompt = `Eres un analista experto en opciones 0DTE. Analiza esta situación y da una explicación concisa en español (máximo 3 oraciones) de por qué la señal es ${ctx.signal} para ${ctx.ticker}:

Precio: ${ctx.price} | Gamma Flip: ${ctx.levels.gammaFlip} | Max Pain: ${ctx.levels.maxPain}
Call Wall: ${ctx.levels.callWall} | Put Wall: ${ctx.levels.putWall}
Score: ${ctx.score}/4 | Confianza: ${ctx.confidence}%
Sesión: ${ctx.session}
Flujos: ${ctx.flowSummary || "Sin flujos significativos"}
Noticias: ${ctx.topNews.join(" | ") || "Ninguna"}
Macro: ${ctx.macroEvent || "Sin eventos"}
Triggers activos: ${ctx.triggers.join(", ")}

Responde solo con la explicación, sin introducción.`;

  try {
    const body = JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.3,
    });

    const _baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const _urlObj = new URL(_baseUrl.replace(/\/+$/, "") + "/chat/completions");
    const response = await new Promise<string>((resolve, reject) => {
      const options = {
        hostname: _urlObj.hostname,
        port:     _urlObj.port || 443,
        path:     _urlObj.pathname,
        method:   "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY || ""}`,
          "Content-Length": Buffer.byteLength(body),
        },
      };
      let data = "";
      const req = https.request(options, (res) => {
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    const parsed = JSON.parse(response);
    return parsed.choices?.[0]?.message?.content?.trim() || buildFallbackReason(ctx);
  } catch {
    return buildFallbackReason(ctx);
  }
}

// Fallback reason when AI is unavailable
function buildFallbackReason(ctx: any): string {
  const lines: string[] = [];
  if (ctx.triggers.includes("ABOVE_GF"))  lines.push(`${ctx.ticker} cotiza SOBRE el Gamma Flip (${ctx.levels.gammaFlip}), zona donde los dealers son compradores de dips.`);
  if (ctx.triggers.includes("BELOW_GF"))  lines.push(`${ctx.ticker} cotiza BAJO el Gamma Flip (${ctx.levels.gammaFlip}), zona donde los dealers amplifican la caída.`);
  if (ctx.triggers.includes("CALL_FLOW")) lines.push(`Flujo institucional dominante en CALLS — presión compradora detectada.`);
  if (ctx.triggers.includes("PUT_FLOW"))  lines.push(`Flujo institucional dominante en PUTS — presión vendedora detectada.`);
  if (ctx.triggers.includes("BULL_NEWS")) lines.push(`Sentimiento de noticias recientes es positivo para ${ctx.ticker}.`);
  if (ctx.triggers.includes("BEAR_NEWS")) lines.push(`Sentimiento de noticias recientes es negativo para ${ctx.ticker}.`);
  if (ctx.macroEvent) lines.push(`Evento macro relevante hoy: ${ctx.macroEvent}.`);
  return lines.slice(0, 3).join(" ") || `Señal ${ctx.signal} basada en confluencia de niveles de opciones.`;
}

// ── Check macro events ────────────────────────────────────────────────────────
async function checkMacroEvents(macroEvents: any[]) {
  const today = new Date().toISOString().split("T")[0];
  const highImpact = macroEvents.filter(m =>
    m.date === today && m.stars === 3 && m.actual && m.actual.trim() !== "" && !sentMacroEvents.has(m.id?.toString())
  );

  for (const ev of highImpact) {
    const impact   = getMacroImpact(ev.event, ev.actual, ev.forecast);
    const analysis = getMacroAnalysis(ev.event, ev.actual, ev.forecast);
    await sendMacroAlert({
      name:     ev.event,
      actual:   ev.actual,
      forecast: ev.forecast,
      previous: ev.previous,
      impact,
      analysis,
    });
    sentMacroEvents.add(ev.id?.toString());
  }
}

function getMacroImpact(event: string, actual: string, forecast: string): string {
  const ev = event.toLowerCase();
  const act = parseFloat(actual?.replace(/[^0-9.-]/g, "") || "0");
  const est = parseFloat(forecast?.replace(/[^0-9.-]/g, "") || "0");
  const beat = act > est;
  if (ev.includes("nfp") || ev.includes("non-farm"))
    return beat ? "📈 NFP por encima — positivo para mercado, presión sobre Fed" : "📉 NFP débil — posible recorte de tasas, dollar bearish";
  if (ev.includes("cpi"))
    return beat ? "🔥 CPI caliente — bearish para acciones, hawkish Fed" : "✅ CPI suave — bullish para acciones, dovish Fed";
  if (ev.includes("fomc") || ev.includes("rate decision"))
    return "⚡ Decisión de tasas — máxima volatilidad esperada en todos los activos";
  if (ev.includes("gdp"))
    return beat ? "📈 GDP fuerte — bullish para acciones y dollar" : "📉 GDP débil — riesgo de recesión, bearish";
  if (ev.includes("pmi") || ev.includes("ism"))
    return act >= 50 ? "📈 PMI en expansión (>50) — bullish para mercado" : "📉 PMI en contracción (<50) — bearish";
  return `Dato ${beat ? "por encima" : "por debajo"} de estimados — monitorear reacción del mercado`;
}

function getMacroAnalysis(event: string, actual: string, forecast: string): string {
  const ev  = event.toLowerCase();
  const act = parseFloat(actual?.replace(/[^0-9.-]/g, "") || "0");
  const est = parseFloat(forecast?.replace(/[^0-9.-]/g, "") || "0");
  const diff = ((act - est) / Math.abs(est || 1) * 100).toFixed(1);
  return `Actual: ${actual} vs Estimado: ${forecast} (${act > est ? "+" : ""}${diff}%). ${
    ev.includes("nfp") ? "Revisar SPX/SPY en los primeros 15 min post-dato para confirmar dirección." :
    ev.includes("cpi") ? "Atención a yields y sector tech (QQQ) como primer indicador de reacción." :
    ev.includes("fomc") ? "Evitar posiciones sin stop hasta que Powell termine su conferencia." :
    "Esperar primer rechazo o breakout de nivel clave antes de entrar."
  }`;
}

// ── Check breaking news ───────────────────────────────────────────────────────
async function checkBreakingNews(allNews: any[]) {
  const cutoff    = Date.now() - 30 * 60_000; // last 30 min
  const breaking  = allNews.filter((n: any) =>
    (n.sentiment === "bullish" || n.sentiment === "bearish") &&
    new Date(n.timestamp).getTime() > cutoff &&
    !sentNewsIds.has(n.id) &&
    n.relatedTicker &&
    TICKERS.includes(n.relatedTicker)
  );

  for (const news of breaking.slice(0, 3)) {
    await sendNewsAlert({
      title:     news.title,
      summary:   news.summary || "",
      ticker:    news.relatedTicker,
      sentiment: news.sentiment,
      url:       news.url,
    });
    sentNewsIds.add(news.id);
    // Cleanup old IDs
    if (sentNewsIds.size > 500) {
      const arr = [...sentNewsIds];
      arr.slice(0, 100).forEach(id => sentNewsIds.delete(id));
    }
  }
}

// ── Dark Pool vs Price Divergence ────────────────────────────────────────────────
async function checkDarkPoolDivergence(allTickers: any[], session: string) {
  const darkPoolPrints = getDarkPoolPrints();
  const exposures = getTickerExposures();
  if (darkPoolPrints.length === 0 || exposures.length === 0) return;

  for (const ticker of TICKERS) {
    try {
      const tickerData = allTickers.find((t: any) => t.symbol === ticker);
      if (!tickerData) continue;

      const price = parseFloat(tickerData.price) || 0;
      const changePct = parseFloat(tickerData.changePercent) || 0;

      // Condition 1: Price must be dropping significantly (> -1%)
      if (changePct >= -1) continue;

      // Get dark pool prints for this ticker
      const dpPrints = darkPoolPrints.filter((dp: DarkPoolPrint) => dp.symbol === ticker);
      if (dpPrints.length < 3) continue; // Need minimum prints to be meaningful

      // Condition 2: Majority of DP prints above VWAP (bullish accumulation)
      const bullishPrints = dpPrints.filter((dp: DarkPoolPrint) => dp.aboveVwap);
      const bullPct = (bullishPrints.length / dpPrints.length) * 100;
      if (bullPct < 60) continue; // Need 60%+ above VWAP

      // Condition 3: Large blocks must be predominantly buys above VWAP
      const blockBuys = bullishPrints.filter((dp: DarkPoolPrint) => dp.blockSize);
      const blockSells = dpPrints.filter((dp: DarkPoolPrint) => !dp.aboveVwap && dp.blockSize);
      if (blockBuys.length < 2) continue; // Need at least 2 large block buys

      // Anti-spam: only send once per ticker every 30 minutes
      const lastSent = lastDPDivergence[ticker] || 0;
      if (Date.now() - lastSent < 30 * 60_000) continue;

      // Calculate totals
      const totalNotional = dpPrints.reduce((s: number, dp: DarkPoolPrint) => s + dp.notional, 0);
      const exposure = exposures.find((e: TickerExposure) => e.symbol === ticker);
      const netDelta = exposure?.darkPoolNetDelta || 0;

      // Build top prints description
      const topPrints = [...blockBuys]
        .sort((a, b) => b.notional - a.notional)
        .slice(0, 3)
        .map((dp: DarkPoolPrint) => `${dp.size.toLocaleString()} shares @ $${dp.price} (${fmtMoney(dp.notional)}) [${dp.exchange}] ABOVE VWAP`)
        .join("\n");

      // Generate AI reason
      const aiReason = await generateDPDivergenceReason({
        ticker, price, changePct, bullPct, blockBuys: blockBuys.length,
        totalNotional, netDelta, session,
      });

      const sig: DarkPoolDivergenceSignal = {
        ticker,
        price,
        changePercent:     changePct,
        darkPoolBullPct:   bullPct,
        darkPoolBlocksBuy: blockBuys.length,
        darkPoolBlocksSell: blockSells.length,
        totalDPNotional:   fmtMoney(totalNotional),
        netDelta:          fmtMoney(netDelta),
        topPrints,
        aiReason,
        session,
      };

      await sendDarkPoolDivergence(sig);
      lastDPDivergence[ticker] = Date.now();
      console.log(`[agent] ${ticker}: DARK POOL DIVERGENCE detected (price ${changePct.toFixed(2)}% but ${bullPct.toFixed(0)}% DP above VWAP) -> Discord`);
    } catch (err) {
      console.error(`[agent] Error checking DP divergence for ${ticker}:`, err);
    }
  }
}

async function generateDPDivergenceReason(ctx: {
  ticker: string; price: number; changePct: number; bullPct: number;
  blockBuys: number; totalNotional: number; netDelta: number; session: string;
}): Promise<string> {
  const prompt = `Eres un analista experto en dark pools y flujo institucional. Explica en espa\u00F1ol (m\u00E1ximo 3 oraciones) por qu\u00E9 esta divergencia es una se\u00F1al de acumulaci\u00F3n institucional:

${ctx.ticker}: Precio cae ${ctx.changePct.toFixed(2)}% a $${ctx.price}
Pero ${ctx.bullPct.toFixed(0)}% de los prints en Dark Pool est\u00E1n ABOVE VWAP
${ctx.blockBuys} blocks grandes de compra detectados
Notional total en DP: ${fmtMoney(ctx.totalNotional)}
Net Delta DP: ${fmtMoney(ctx.netDelta)}
Sesi\u00F3n: ${ctx.session}

Explica qu\u00E9 significa esta divergencia para un trader de opciones 0DTE y c\u00F3mo podr\u00EDa aprovecharse. Responde solo con la explicaci\u00F3n.`;

  try {
    const body = JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 180,
      temperature: 0.3,
    });

    const _baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const _urlObj = new URL(_baseUrl.replace(/\/+$/, "") + "/chat/completions");
    const response = await new Promise<string>((resolve, reject) => {
      const options = {
        hostname: _urlObj.hostname,
        port:     _urlObj.port || 443,
        path:     _urlObj.pathname,
        method:   "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY || ""}`,
          "Content-Length": Buffer.byteLength(body),
        },
      };
      let data = "";
      const req = https.request(options, (res) => {
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    const parsed = JSON.parse(response);
    return parsed.choices?.[0]?.message?.content?.trim() ||
      `${ctx.ticker} muestra divergencia: precio cae ${ctx.changePct.toFixed(2)}% pero ${ctx.bullPct.toFixed(0)}% del volumen en dark pools se ejecuta ABOVE VWAP con ${ctx.blockBuys} blocks grandes. Las instituciones est\u00E1n acumulando agresivamente en el dip.`;
  } catch {
    return `${ctx.ticker} muestra divergencia: precio cae ${ctx.changePct.toFixed(2)}% pero ${ctx.bullPct.toFixed(0)}% del volumen en dark pools se ejecuta ABOVE VWAP con ${ctx.blockBuys} blocks grandes. Las instituciones est\u00E1n acumulando agresivamente en el dip.`;
  }
}

function fmtMoney(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : val > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeGet<T>(fn: () => T): Promise<T> {
  try { return Promise.resolve(fn()); }
  catch { return Promise.resolve([] as unknown as T); }
}

function parseNotional(val: any): number {
  if (!val) return 0;
  const s = String(val).replace(/[$,]/g, "").toUpperCase();
  if (s.endsWith("M")) return parseFloat(s) * 1_000_000;
  if (s.endsWith("K")) return parseFloat(s) * 1_000;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function buildFlowSummary(flows: any[]): string {
  if (flows.length === 0) return "";
  // Sort by notional descending
  const sorted = [...flows].sort((a, b) => parseNotional(b.notional || b.volume) - parseNotional(a.notional || a.volume));
  const top    = sorted.slice(0, 3);
  return top.map(f => {
    const vol = f.volume;
    let parsed: any = {};
    try { parsed = typeof vol === "string" ? JSON.parse(vol) : vol; } catch {}
    const dir  = parsed.direction || (f.sentiment === "bullish" ? "BUY" : "SELL");
    const not  = parsed.notional  || f.premium || "";
    const ct   = parsed.contracts || "";
    return `${f.symbol} ${parsed.callPut || ""} ${f.strike} | ${dir} ${ct ? ct + " contratos" : ""} ${not ? "| " + not : ""}`.trim();
  }).join("\n");
}

function calculateConfidence(bull: number, bear: number, flowCount: number, newsCount: number): number {
  const base   = Math.max(bull, bear) * 20;          // 0-80
  const flowBonus = Math.min(flowCount * 2, 10);      // 0-10
  const newsBonus = Math.min(newsCount * 2, 10);      // 0-10
  return Math.min(Math.round(base + flowBonus + newsBonus), 95);
}

const DEFAULT_LEVELS: Record<string, [number,number,number,number]> = {
  TSLA:[256,255,270,250],MSFT:[386,385,395,380],NVDA:[106,105,112,100],
  AAPL:[201,200,210,195],AMD:[101,100,110,95],NFLX:[921,920,940,910],
  GOOG:[156,155,165,150],AMZN:[181,180,190,175],PLTR:[88,88,95,85],
  AVGO:[171,170,180,165],MU:[91,90,100,88],META:[541,540,560,530],
  ORCL:[151,150,160,145],SPX:[5202,5200,5300,5150],QQQ:[436,435,445,430],
  DIA:[406,405,415,400],IWM:[191,190,200,185],SPY:[521,520,530,515],
  SOXL:[17,17,20,16],USO:[71,70,75,68],SLV:[27,27,30,26],GLD:[286,285,295,280],
};

function deriveLevels(ticker: string, flows: any[]) {
  const d = DEFAULT_LEVELS[ticker] || [100,100,105,95];
  if (flows.length === 0) return { gammaFlip: d[0], maxPain: d[1], callWall: d[2], putWall: d[3] };

  const callsByStrike: Record<number, number> = {};
  const putsByStrike:  Record<number, number> = {};
  for (const f of flows) {
    const strike  = parseFloat(f.strike?.replace(/\$/g, "") || "0");
    const notional = parseNotional(f.notional || f.volume || "0");
    if (!strike || !notional) continue;
    const vol = f.volume; let parsed: any = {};
    try { parsed = typeof vol === "string" ? JSON.parse(vol) : {}; } catch {}
    const isCall = (parsed.callPut || f.type || "").toString().toUpperCase().includes("CALL");
    if (isCall) callsByStrike[strike] = (callsByStrike[strike] || 0) + notional;
    else        putsByStrike[strike]  = (putsByStrike[strike]  || 0) + notional;
  }

  const callStrikes = Object.keys(callsByStrike).map(Number);
  const putStrikes  = Object.keys(putsByStrike).map(Number);
  const callWall    = callStrikes.length > 0 ? callStrikes.reduce((a,b) => callsByStrike[a] > callsByStrike[b] ? a : b) : d[2];
  const putWall     = putStrikes.length  > 0 ? putStrikes.reduce((a,b)  => putsByStrike[a]  > putsByStrike[b]  ? a : b) : d[3];
  const maxPain     = Math.round((callWall + putWall) / 2);
  const gammaFlip   = Math.round(maxPain * 0.99);

  return { gammaFlip, maxPain, callWall: Math.round(callWall), putWall: Math.round(putWall) };
}
