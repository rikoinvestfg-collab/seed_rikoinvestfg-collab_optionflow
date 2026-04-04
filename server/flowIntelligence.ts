/**
 * Flow Intelligence Engine
 * ─────────────────────────
 * Analyses market structure like an institutional 0DTE trader:
 *  - Gamma Exposure (GEX) & dealer positioning
 *  - Institutional options flow (sweeps, blocks, unusual)
 *  - Dark pool / order flow
 *  - Intraday context & timing
 *
 * Outputs structured trade setups to:
 *  1. /api/flow-intelligence  (frontend consumption)
 *  2. Discord #flow-intelligence channel
 *
 * Runs every 60 seconds during market hours.
 */

import https from "https";
import { storage } from "./storage";
import { sendFlowIntelSignal, getNYSession, type FlowIntelSignal } from "./discordSender";
import {
  getInstitutionalFlow,
  getDarkPoolPrints,
  getTickerExposures,
  type InstitutionalSignal,
  type DarkPoolPrint,
  type TickerExposure,
} from "./institutionalFetcher";

// ── Config ───────────────────────────────────────────────────────────────────
const INTEL_SYMBOLS = [
  "TSLA","MSFT","NVDA","AAPL","AMD","NFLX","GOOG","AMZN","PLTR","AVGO",
  "MU","META","ORCL","SPX","QQQ","DIA","IWM","SPY","SOXL","USO","SLV","GLD"
];
const INTEL_INTERVAL  = 60_000;                      // 60 seconds
const ANTI_SPAM_MS    = 10 * 60_000;                 // 10 min per symbol
let   intervalRef: ReturnType<typeof setInterval> | null = null;

// ── State ────────────────────────────────────────────────────────────────────
interface IntelReport {
  symbol:     string;
  signal:     FlowIntelSignal;
  timestamp:  string;
}

let cachedReports: IntelReport[]          = [];
const lastSent: Record<string, number>    = {};
let lastAnalysisTime: Date | null         = null;

// ── Public getters (for API) ─────────────────────────────────────────────────
export function getFlowIntelReports(): IntelReport[] { return cachedReports; }
export function getLastIntelTime(): Date | null { return lastAnalysisTime; }

// ── Main cycle ───────────────────────────────────────────────────────────────
async function runFlowIntelCycle(): Promise<void> {
  const session = getNYSession();

  // Only analyze during active market sessions
  if (session === "CERRADO") return;

  const allTickers  = storage.getAllTickers();
  const allFlow     = storage.getAllOptionsFlow();
  const instFlow    = getInstitutionalFlow();
  const dpPrints    = getDarkPoolPrints();
  const exposures   = getTickerExposures();

  if (allTickers.length === 0) return;

  const newReports: IntelReport[] = [];

  for (const symbol of INTEL_SYMBOLS) {
    try {
      const ticker   = allTickers.find((t: any) => t.symbol === symbol);
      if (!ticker) continue;

      const exposure = exposures.find((e: TickerExposure) => e.symbol === symbol);
      const symFlow  = allFlow.filter((f: any) => f.symbol === symbol);
      const symInst  = instFlow.filter((i: InstitutionalSignal) => i.symbol === symbol);
      const symDP    = dpPrints.filter((d: DarkPoolPrint) => d.symbol === symbol);

      // ── Build context payload for AI ─────────────────────────────
      const context = buildMarketContext(ticker, exposure, symFlow, symInst, symDP, session);

      // ── Call GPT-4o with institutional prompt ────────────────────
      const analysis = await analyzeWithAI(symbol, context);
      if (!analysis) continue;

      const report: IntelReport = {
        symbol,
        signal: analysis,
        timestamp: new Date().toISOString(),
      };
      newReports.push(report);

      // ── Send to Discord if actionable + anti-spam ────────────────
      const now = Date.now();
      const last = lastSent[symbol] || 0;
      const isActionable = analysis.setup !== "No Trade";
      const hasChanged = !cachedReports.find(
        r => r.symbol === symbol && r.signal.setup === analysis.setup && r.signal.bias === analysis.bias
      );

      if (isActionable && hasChanged && (now - last >= ANTI_SPAM_MS)) {
        await sendFlowIntelSignal(analysis);
        lastSent[symbol] = now;
        console.log(`[flowIntel] ${symbol}: ${analysis.setup} (${analysis.confidence}) -> Discord`);
      } else if (analysis.setup === "No Trade") {
        // Still send NO TRADE signals but with longer cooldown (30 min)
        if (now - last >= 30 * 60_000) {
          await sendFlowIntelSignal(analysis);
          lastSent[symbol] = now;
          console.log(`[flowIntel] ${symbol}: NO TRADE -> Discord`);
        }
      }
    } catch (err: any) {
      console.error(`[flowIntel] Error analyzing ${symbol}:`, err.message);
    }
  }

  if (newReports.length > 0) {
    cachedReports = newReports;
    lastAnalysisTime = new Date();
  }
}

// ── Build comprehensive market context for AI ────────────────────────────────
function buildMarketContext(
  ticker: any,
  exposure: TickerExposure | undefined,
  optionsFlow: any[],
  instFlow: InstitutionalSignal[],
  dpPrints: DarkPoolPrint[],
  session: string,
): string {
  const price       = parseFloat(ticker.price) || 0;
  const changePct   = parseFloat(ticker.changePercent) || 0;
  const gammaFlip   = ticker.gammaFlip || "N/A";
  const maxPain     = ticker.maxPain || "N/A";
  const callWall    = ticker.callWall || "N/A";
  const putWall     = ticker.putWall || "N/A";
  const gammaRegime = ticker.gammaRegime || "Unknown";
  const atmIv       = ticker.atmIv || "N/A";
  const netGex      = ticker.netGex || "N/A";

  // Exposure data
  const gex           = exposure?.gammaExposure ?? 0;
  const dex           = exposure?.deltaExposure ?? 0;
  const flowBias      = exposure?.flowBias ?? "neutral";
  const flowBullPct   = exposure?.flowBullPct ?? 50;
  const flowBearPct   = exposure?.flowBearPct ?? 50;
  const dpSentiment   = exposure?.darkPoolSentiment ?? "neutral";
  const dpNetDelta    = exposure?.darkPoolNetDelta ?? 0;
  const sentimentScore = exposure?.sentimentScore ?? 0;
  const emHigh        = exposure?.expectedMoveHigh ?? 0;
  const emLow         = exposure?.expectedMoveLow ?? 0;

  // Options flow summary
  const sweeps  = optionsFlow.filter((f: any) => f.signal === "sweep");
  const blocks  = optionsFlow.filter((f: any) => f.signal === "block");
  const unusual = optionsFlow.filter((f: any) => f.signal === "unusual");
  const bullFlow = optionsFlow.filter((f: any) => f.sentiment === "bullish");
  const bearFlow = optionsFlow.filter((f: any) => f.sentiment === "bearish");

  // Institutional flow summary
  const instBuys  = instFlow.filter(i => i.side === "BUY");
  const instSells = instFlow.filter(i => i.side === "SELL");
  const totalInstNotional = instFlow.reduce((s, i) => s + i.notional, 0);

  // Dark pool summary
  const dpAboveVwap = dpPrints.filter(d => d.aboveVwap);
  const dpBelowVwap = dpPrints.filter(d => !d.aboveVwap);
  const dpTotalNotional = dpPrints.reduce((s, d) => s + d.notional, 0);
  const dpBlockBuys = dpAboveVwap.filter(d => d.blockSize);

  // Time context
  const now = new Date();
  const etHour = parseInt(now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }));
  const timeContext = etHour < 10 ? "APERTURA (9:30-10:00)" :
                     etHour < 12 ? "MEDIA MANANA (10:00-12:00)" :
                     etHour < 14 ? "MEDIODIA (12:00-14:00)" :
                     etHour < 16 ? "POWER HOUR (14:00-16:00)" :
                     "AFTER HOURS";

  return `
=== DATOS DE MERCADO EN TIEMPO REAL ===

ACTIVO: ${ticker.symbol}
PRECIO ACTUAL: $${price} (${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%)
ATM IV: ${atmIv}

=== NIVELES CLAVE ===
Gamma Flip: ${gammaFlip}
Max Pain: ${maxPain}
Call Wall: ${callWall}
Put Wall: ${putWall}
Expected Move High: $${emHigh.toFixed(2)}
Expected Move Low: $${emLow.toFixed(2)}

=== GAMMA EXPOSURE ===
Gamma Regime: ${gammaRegime}
Net GEX: ${netGex}
GEX (millones): ${gex > 0 ? "+" : ""}${(gex / 1e6).toFixed(1)}M
DEX (millones): ${dex > 0 ? "+" : ""}${(dex / 1e6).toFixed(1)}M
${gammaRegime.toLowerCase().includes("positive") ? "-> GAMMA POSITIVO: Dealers hedgean CONTRA el movimiento = Mean Reversion / Rango" : "-> GAMMA NEGATIVO: Dealers hedgean A FAVOR del movimiento = Tendencia / Breakout"}

=== FLUJO DE OPCIONES (OPTIONS FLOW) ===
Total signals: ${optionsFlow.length}
Sweeps: ${sweeps.length} | Blocks: ${blocks.length} | Unusual: ${unusual.length}
Bullish flow: ${bullFlow.length} (${flowBullPct.toFixed(0)}%)
Bearish flow: ${bearFlow.length} (${flowBearPct.toFixed(0)}%)
Flow Bias: ${flowBias.toUpperCase()}
Sentiment Score: ${sentimentScore}/100

${sweeps.slice(0, 5).map((s: any) => `  [SWEEP] ${s.type} ${s.strike} ${s.expiry} | ${s.premium} | ${s.sentiment}`).join("\n")}
${blocks.slice(0, 5).map((b: any) => `  [BLOCK] ${b.type} ${b.strike} ${b.expiry} | ${b.premium} | ${b.sentiment}`).join("\n")}

=== FLUJO INSTITUCIONAL ===
Total signals: ${instFlow.length}
Compras institucionales: ${instBuys.length} ($${(instBuys.reduce((s, i) => s + i.notional, 0) / 1e6).toFixed(1)}M)
Ventas institucionales: ${instSells.length} ($${(instSells.reduce((s, i) => s + i.notional, 0) / 1e6).toFixed(1)}M)
Notional total: $${(totalInstNotional / 1e6).toFixed(1)}M
${instFlow.filter(i => i.smartMoneyScore >= 7).slice(0, 3).map(i => `  [SMART$${i.smartMoneyScore}] ${i.side} ${i.type} ${i.size} @ $${i.price} ($${(i.notional / 1e6).toFixed(1)}M) ${i.description}`).join("\n")}

=== DARK POOL / ORDER FLOW ===
Total prints: ${dpPrints.length}
Above VWAP (bullish): ${dpAboveVwap.length} (${dpPrints.length > 0 ? ((dpAboveVwap.length / dpPrints.length) * 100).toFixed(0) : 0}%)
Below VWAP (bearish): ${dpBelowVwap.length}
Block buys above VWAP: ${dpBlockBuys.length}
Dark Pool Sentiment: ${dpSentiment.toUpperCase()}
Dark Pool Net Delta: $${(dpNetDelta / 1e6).toFixed(1)}M
Total DP Notional: $${(dpTotalNotional / 1e6).toFixed(1)}M
${dpBlockBuys.slice(0, 3).map(d => `  [DP BLOCK] ${d.size.toLocaleString()} @ $${d.price} ($${(d.notional / 1e6).toFixed(1)}M) [${d.exchange}] ABOVE VWAP`).join("\n")}

=== CONTEXTO DE TIEMPO ===
Session: ${session}
Hora: ${timeContext}
${session === "PRE-MARKET" ? "Cautela: Pre-market tiene menos liquidez" : ""}
${timeContext === "MEDIODIA (12:00-14:00)" ? "ADVERTENCIA: Chop zone — evitar sin volumen confirmado" : ""}
${timeContext === "POWER HOUR (14:00-16:00)" ? "Power Hour: Mayor volumen y movimientos direccionales" : ""}
`.trim();
}

// ── AI Analysis with full institutional prompt ───────────────────────────────
async function analyzeWithAI(symbol: string, context: string): Promise<FlowIntelSignal | null> {
  const session = getNYSession();

  const systemPrompt = `Actua como un trader institucional experto en opciones 0DTE especializado en SPX y TSLA.

Tu objetivo NO es predecir el mercado, sino interpretar la estructura del mercado basada en:
- Gamma Exposure (GEX)
- Posicionamiento de dealers
- Flujo institucional (options flow)
- Liquidez y order flow
- Contexto intradia

Debes tomar decisiones como un market maker, no como retail.

PROCESO OBLIGATORIO:
1. Determinar el MODO DEL MERCADO:
   - Gamma positivo -> rango / mean reversion
   - Gamma negativo -> tendencia / breakout

2. Definir BIAS:
   - Alcista / bajista / neutral
   - Basado en niveles clave + posicionamiento

3. Evaluar el flujo:
   - El flujo confirma el movimiento?
   - El flujo es temprano o tardio?

4. Analizar liquidez:
   - Hay absorcion?
   - Se esta retirando liquidez?

5. Confirmar timing:
   - Es momento valido del dia para entrar?

REGLAS ESTRICTAS:
- NO dar senales si no hay confluencia
- NO operar en medio del rango sin confirmacion
- NO seguir movimientos sin flujo institucional
- SIEMPRE priorizar preservacion de capital

Prioriza setups en:
- Ruptura de Call Wall o Put Wall con flujo confirmado
- Reversiones en Gamma positivo con absorcion clara
- Continuaciones en Gamma negativo con momentum

Evita:
- Chop de mediodia sin volumen
- Falsos breakouts sin soporte de flujo
- Entradas tardias

El trade debe tener minimo 2 confirmaciones fuertes:
(flujo + nivel) o (liquidez + gamma)

FILOSOFIA:
- Que estan obligados a hacer los dealers?
- Donde esta la liquidez?
- Quien esta atrapado?

Si no hay ventaja clara responde setup: "No Trade".

RESPONDE SOLO EN JSON VALIDO con esta estructura exacta:
{
  "marketMode": "Gamma Positivo - [explicacion breve]" o "Gamma Negativo - [explicacion breve]",
  "bias": "Alcista - [razon]" o "Bajista - [razon]" o "Neutral - [razon]",
  "setup": "Long" o "Short" o "No Trade",
  "entry": "nivel o condicion",
  "confirmations": ["confirmacion1", "confirmacion2", ...],
  "stopLoss": "nivel o %",
  "takeProfit": "nivel o %",
  "confidence": "Alta" o "Media" o "Baja",
  "reasoning": "Explicacion detallada en espanol de la tesis del trade (2-4 oraciones)",
  "flowSummary": "Resumen del flujo (1-2 oraciones)",
  "liquiditySummary": "Resumen de liquidez (1-2 oraciones)"
}`;

  const userPrompt = `Analiza ${symbol} en TIEMPO REAL con estos datos:\n\n${context}\n\nResponde SOLO con el JSON.`;

  try {
    const body = JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const response = await new Promise<string>((resolve, reject) => {
      const options = {
        hostname: "api.openai.com",
        path:     "/v1/chat/completions",
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
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) return null;

    const analysis = JSON.parse(content);

    // Get ticker for key levels
    const ticker = storage.getAllTickers().find((t: any) => t.symbol === symbol);

    const signal: FlowIntelSignal = {
      symbol,
      marketMode:      analysis.marketMode     || "Unknown",
      bias:            analysis.bias           || "Neutral",
      setup:           analysis.setup          || "No Trade",
      entry:           analysis.entry          || "N/A",
      confirmations:   analysis.confirmations  || [],
      stopLoss:        analysis.stopLoss       || "N/A",
      takeProfit:      analysis.takeProfit     || "N/A",
      confidence:      analysis.confidence     || "Baja",
      reasoning:       analysis.reasoning      || "",
      keyLevels: {
        gammaFlip: ticker?.gammaFlip || "N/A",
        callWall:  ticker?.callWall  || "N/A",
        putWall:   ticker?.putWall   || "N/A",
        maxPain:   ticker?.maxPain   || "N/A",
      },
      flowSummary:       analysis.flowSummary       || "",
      liquiditySummary:  analysis.liquiditySummary   || "",
      session,
      timestamp:         new Date().toISOString(),
    };

    return signal;
  } catch (err: any) {
    console.error(`[flowIntel] AI analysis error for ${symbol}:`, err.message);
    return null;
  }
}

// ── Init / Start / Stop ──────────────────────────────────────────────────────
export function initFlowIntelligence(): void {
  console.log(`[flowIntel] Starting Flow Intelligence engine — analyzing ${INTEL_SYMBOLS.join(", ")} every ${INTEL_INTERVAL / 1000}s`);
  // Initial run after 20s (wait for data to be populated)
  setTimeout(() => { runFlowIntelCycle().catch(console.error); }, 20_000);
  intervalRef = setInterval(() => { runFlowIntelCycle().catch(console.error); }, INTEL_INTERVAL);
}

export function stopFlowIntelligence(): void {
  if (intervalRef) { clearInterval(intervalRef); intervalRef = null; }
}
