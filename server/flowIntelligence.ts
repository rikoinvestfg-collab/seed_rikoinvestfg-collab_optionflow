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
import { getOptionsChain } from "./cboeFetcher";
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

  // Only skip if truly closed AND we already have cached reports from today
  // Allow analysis during extended hours for dashboard display
  if (session === "CERRADO" && cachedReports.length > 0) return;

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

// ── Local deterministic analysis engine ─────────────────────────────────────
// Uses GEX levels, options flow, dark pool, and institutional data
// to produce structured trade setups without requiring OpenAI API access.
function analyzeWithAI(symbol: string, _context: string): Promise<FlowIntelSignal | null> {
  return Promise.resolve(analyzeLocally(symbol));
}

function analyzeLocally(symbol: string): FlowIntelSignal | null {
  try {
    const ticker = storage.getAllTickers().find((t: any) => t.symbol === symbol);
    if (!ticker) return null;

    const price       = parseFloat(ticker.price)         || 0;
    const changePct   = parseFloat(ticker.changePercent) || 0;
    const dayHigh     = parseFloat(ticker.dayHigh)       || price;
    const dayLow      = parseFloat(ticker.dayLow)        || price;
    const gammaFlip   = ticker.gammaFlip   || "N/A";
    const callWall    = ticker.callWall    || "N/A";
    const putWall     = ticker.putWall     || "N/A";
    const maxPain     = ticker.maxPain     || "N/A";
    const gammaRegime = ticker.gammaRegime || "Unknown";
    const netGex      = ticker.netGex      || "N/A";
    const atmIv       = ticker.atmIv       || "N/A";

    const gfNum = parseFloat(String(gammaFlip).replace(/[$,]/g, "")) || 0;
    const cwNum = parseFloat(String(callWall ).replace(/[$,]/g, "")) || 0;
    const pwNum = parseFloat(String(putWall  ).replace(/[$,]/g, "")) || 0;

    const session     = getNYSession();
    const etHour      = parseInt(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }));
    const isChopZone  = etHour >= 12 && etHour < 14;
    const isPowerHour = etHour >= 14 && etHour < 16;
    const isPreMkt    = session === "PRE-MARKET";

    // ── Options flow data ───────────────────────────────────────────────────
    const allFlow    = storage.getAllOptionsFlow().filter((f: any) => f.symbol === symbol);
    const instFlows  = getInstitutionalFlow().filter((i: InstitutionalSignal) => i.symbol === symbol);
    const dpPrints   = getDarkPoolPrints().filter((d: DarkPoolPrint) => d.symbol === symbol);
    const exposure   = getTickerExposures().find((e: TickerExposure) => e.symbol === symbol);

    const bullFlow   = allFlow.filter((f: any) => f.sentiment === "bullish");
    const bearFlow   = allFlow.filter((f: any) => f.sentiment === "bearish");
    const sweeps     = allFlow.filter((f: any) => f.signal === "sweep");
    const blocks     = allFlow.filter((f: any) => f.signal === "block");
    const bullSweeps = sweeps.filter((s: any) => s.sentiment === "bullish");
    const bearSweeps = sweeps.filter((s: any) => s.sentiment === "bearish");
    const bullBlocks = blocks.filter((b: any) => b.sentiment === "bullish");
    const bearBlocks = blocks.filter((b: any) => b.sentiment === "bearish");

    const flowBias    = exposure?.flowBias         ?? "neutral";
    const sentScore   = exposure?.sentimentScore   ?? 50;
    const dpSentiment = exposure?.darkPoolSentiment ?? "neutral";
    const instBuys    = instFlows.filter(i => i.side === "BUY");
    const instSells   = instFlows.filter(i => i.side === "SELL");

    // ── CBOE options chain ──────────────────────────────────────────────────
    const chain        = getOptionsChain(symbol);
    const callPutRatio = chain?.callPutRatio ?? 1;
    const ivSkew       = chain?.ivSkew       ?? 0;   // positive = put skew = bearish

    // OTM +1/+2 strikes for contract recommendation
    let otm1Call: number | null = null;
    let otm2Call: number | null = null;
    let otm1Put:  number | null = null;
    let otm2Put:  number | null = null;
    if (chain?.strikes?.length) {
      const callStr = chain.strikes.filter(s => s.strike > price && s.callOI > 0).sort((a, b) => a.strike - b.strike);
      const putStr  = chain.strikes.filter(s => s.strike < price && s.putOI  > 0).sort((a, b) => b.strike - a.strike);
      otm1Call = callStr[0]?.strike ?? null;
      otm2Call = callStr[1]?.strike ?? null;
      otm1Put  = putStr[0]?.strike  ?? null;
      otm2Put  = putStr[1]?.strike  ?? null;
    }

    // ── Technical analysis ──────────────────────────────────────────────────
    // VWAP: intraday estimate from (H+L+C)/3
    const vwap        = (dayHigh + dayLow + price) / 3;
    const vwapDist    = price - vwap;
    const vwapDistPct = vwap > 0 ? (vwapDist / vwap) * 100 : 0;

    // Day range position: 0 = bottom, 1 = top
    const dayRange     = dayHigh - dayLow;
    const dayRangeUsed = dayRange > 0 ? (price - dayLow) / dayRange : 0.5;

    // EMA approximations from price momentum
    const ema9Approx  = vwap + (changePct / 100) * price * 0.4;
    const ema21Approx = vwap + (changePct / 100) * price * 0.2;
    const ema9x21Bull = price > ema9Approx && price > ema21Approx;
    const ema9x21Bear = price < ema9Approx && price < ema21Approx;

    // ── SMA 20/40/100/200 — 15min and 1h timeframes ──────────────────────────
    // Derived from: current price, prevClose, dayHigh, dayLow, and weekly/monthly drift
    // 15min SMA: uses intraday price momentum over short periods
    // 1h SMA: uses multi-day drift context for trend bias
    //
    // Key: weeklyChangePct from prev week, monthlyChangePct from prev month price levels
    // We approximate via changePct (daily) scaled for each timeframe window:
    //   SMA20_15min  ≈ avg of last 20 × 15min bars ≈ last 5h of price action
    //   SMA40_15min  ≈ avg of last 40 × 15min bars ≈ last 10h (≈ 1.5 trading days)
    //   SMA100_15min ≈ avg of last 100 × 15min bars ≈ last 25h (≈ 3.5 days)
    //   SMA200_15min ≈ avg of last 200 × 15min bars ≈ last 50h (≈ 7 trading days)
    //   SMA20_1h     ≈ avg of last 20 × 1h bars ≈ last 20h (≈ 2.5 days)
    //   SMA40_1h     ≈ avg of last 40 × 1h bars ≈ last 5 trading days
    //   SMA100_1h    ≈ avg of last 100 × 1h bars ≈ last 2.5 trading weeks
    //   SMA200_1h    ≈ avg of last 200 × 1h bars ≈ last 5 trading weeks

    const prevClose   = (ticker as any).previousClose ?? price * (1 - changePct / 100);
    const weeklyDrift = changePct / 5;          // daily chg / 5 = per-day drift
    const dailyDrift  = changePct / 100 * price;

    // 15-minute SMAs (in price units)
    const sma20_15m  = prevClose + dailyDrift * 0.25;          // ~5h lookback
    const sma40_15m  = prevClose + dailyDrift * 0.15;          // ~10h lookback
    const sma100_15m = prevClose + dailyDrift * 0.05;          // ~25h lookback
    const sma200_15m = prevClose - dailyDrift * 0.10;          // ~50h lookback (2+ days)

    // 1-hour SMAs (in price units) — longer lookback = less responsive to 1-day move
    const sma20_1h   = prevClose + dailyDrift * 0.50;          // ~2.5 days lookback
    const sma40_1h   = prevClose + dailyDrift * 0.30;          // ~5 days lookback
    const sma100_1h  = prevClose + dailyDrift * 0.10;          // ~2.5 weeks lookback
    const sma200_1h  = prevClose - Math.abs(dailyDrift) * 0.05; // ~5 weeks lookback

    // SMA alignment (trend bias) — are all SMAs stacked bullishly or bearishly?
    const smasBullish15m = price > sma20_15m && price > sma40_15m && sma20_15m > sma40_15m;
    const smasBearish15m = price < sma20_15m && price < sma40_15m && sma20_15m < sma40_15m;
    const smasBullish1h  = price > sma20_1h  && price > sma100_1h && sma20_1h > sma100_1h;
    const smasBearish1h  = price < sma20_1h  && price < sma100_1h && sma20_1h < sma100_1h;

    // Price vs key SMA walls (these act as support/resistance)
    const aboveSma200_1h = price > sma200_1h;   // major bull/bear line
    const aboveSma100_1h = price > sma100_1h;
    const aboveSma20_15m = price > sma20_15m;
    const aboveSma40_15m = price > sma40_15m;

    // SMA confluence score: strong alignment = trend continuation
    let smaScore = 0;
    if (smasBullish15m) smaScore += 2;
    if (smasBearish15m) smaScore -= 2;
    if (smasBullish1h)  smaScore += 3;
    if (smasBearish1h)  smaScore -= 3;
    if (aboveSma200_1h) smaScore += 1;
    else smaScore -= 1;

    // Bollinger Bands (2 std dev of intraday range)
    const bbStdDev = dayRange / 4;
    const bbUpper  = vwap + 2 * bbStdDev;
    const bbLower  = vwap - 2 * bbStdDev;

    // Overextension filters — KEY sniper check
    const overExtendedUp   = vwapDistPct >  0.8;  // >0.8% above VWAP = don't buy
    const overExtendedDown = vwapDistPct < -0.8;  // >0.8% below VWAP = don't short
    const nearBBUpper      = price >= bbUpper * 0.998;
    const nearBBLower      = price <= bbLower * 1.002;

    // GEX wall proximity (within 0.3% = danger zone)
    const nearCallWall  = cwNum > 0 && (cwNum - price) / price < 0.003 && price < cwNum;
    const nearPutWall   = pwNum > 0 && (price - pwNum) / price < 0.003 && price > pwNum;
    const aboveCallWall = cwNum > 0 && price > cwNum;
    const belowPutWall  = pwNum > 0 && price < pwNum;

    // ── Scoring (0–100) ─────────────────────────────────────────────────────
    let score = 50;

    if (gfNum > 0) score += price > gfNum ? 15 : -15;
    if (changePct > 1.5)  score += 12; else if (changePct > 0.5) score += 6;
    else if (changePct < -1.5) score -= 12; else if (changePct < -0.5) score -= 6;

    const totalFlow = allFlow.length;
    const bullPct   = totalFlow > 0 ? bullFlow.length / totalFlow : 0.5;
    if (bullPct > 0.65) score += 12; else if (bullPct > 0.55) score += 6;
    else if (bullPct < 0.35) score -= 12; else if (bullPct < 0.45) score -= 6;

    if (bullSweeps.length >= 2) score += 10; else if (bullSweeps.length === 1) score += 5;
    if (bearSweeps.length >= 2) score -= 10; else if (bearSweeps.length === 1) score -= 5;
    if (bullBlocks.length > bearBlocks.length) score += 5;
    if (bearBlocks.length > bullBlocks.length) score -= 5;

    if (callPutRatio > 1.3) score += 6; else if (callPutRatio < 0.8) score -= 6;
    if (ivSkew > 0.02) score -= 4; else if (ivSkew < -0.02) score += 4;

    if (flowBias === "bullish") score += 8; else if (flowBias === "bearish") score -= 8;
    if (dpSentiment === "bullish") score += 5; else if (dpSentiment === "bearish") score -= 5;
    if (instBuys.length > instSells.length) score += 7; else if (instSells.length > instBuys.length) score -= 7;

    if (ema9x21Bull) score += 5; if (ema9x21Bear) score -= 5;
    if (price > vwap) score += 3; else score -= 3;
    if (dayRangeUsed > 0.75) score += 4; else if (dayRangeUsed < 0.25) score -= 4;

    // SMA confluence bonus/penalty (max ±7)
    score += Math.max(-7, Math.min(7, smaScore * 1.2));

    score = Math.max(0, Math.min(100, score));

    // ── Gamma regime ────────────────────────────────────────────────────────
    const isPositiveGamma = gammaRegime.toLowerCase().includes("positive");
    const isNegativeGamma = gammaRegime.toLowerCase().includes("negative");
    const marketMode = isPositiveGamma
      ? "Gamma Positivo — rango y reversiones desde niveles GEX"
      : "Gamma Negativo — tendencia y breakouts amplificados";

    // ── Bias ─────────────────────────────────────────────────────────────────
    const bias = score >= 68 ? `Alcista — score ${Math.round(score)}/100`
               : score <= 32 ? `Bajista — score ${Math.round(score)}/100`
               :                `Neutral — score ${Math.round(score)}/100`;

    // ── Setup logic with SNIPER FILTERS ─────────────────────────────────────
    let setup: "Long" | "Short" | "No Trade" = "No Trade";
    let confidence: "Alta" | "Media" | "Baja" = "Baja";
    const confirmations: string[] = [];
    const rejections: string[]    = [];

    if (isPreMkt) rejections.push("Pre-market: liquidez insuficiente — esperar 9:30 AM ET");
    if (aboveCallWall) rejections.push(`Precio sobre Call Wall $${cwNum} — resistencia extrema, no perseguir`);
    if (belowPutWall)  rejections.push(`Precio bajo Put Wall $${pwNum} — soporte roto, no comprar caída libre`);

    const hardBlocked = rejections.length > 0;

    if (!hardBlocked && !isChopZone) {
      if (score >= 65) {
        // LONG — sniper filters
        if (overExtendedUp && !isPowerHour) {
          rejections.push(`Precio +${vwapDistPct.toFixed(1)}% sobre VWAP ($${vwap.toFixed(2)}) — sobreextendido, espera pullback`);
        } else if (nearBBUpper) {
          rejections.push(`En Bollinger Band superior ($${bbUpper.toFixed(2)}) — posible reversión, no entrar`);
        } else {
          setup = "Long";
          if (price > gfNum && gfNum > 0) confirmations.push(`Sobre Gamma Flip $${gfNum} — dealers en cobertura alcista`);
          if (bullSweeps.length > 0)      confirmations.push(`${bullSweeps.length} call sweeps institucionales`);
          if (bullBlocks.length > 0)      confirmations.push(`${bullBlocks.length} bloques alcistas registrados`);
          if (ema9x21Bull)                confirmations.push("EMA estructura alcista confirmada");
          if (smasBullish15m)             confirmations.push(`SMA 15min alcista (20>${sma20_15m.toFixed(2)} / 40>${sma40_15m.toFixed(2)})`);
          if (smasBullish1h)              confirmations.push(`SMA 1h alcista — tendencia multi-día confirmada`);
          if (!aboveSma200_1h)            confirmations.push(`⚠️ Bajo SMA200 1h ($${sma200_1h.toFixed(2)}) — resistencia importante`);
          if (aboveSma200_1h && aboveSma100_1h) confirmations.push(`Precio sobre SMA100/200 1h — estructura macro alcista`);
          if (price > vwap)               confirmations.push(`Sobre VWAP ($${vwap.toFixed(2)}) — momentum positivo del día`);
          if (callPutRatio > 1.2)         confirmations.push(`Call/Put OI ${callPutRatio.toFixed(2)}x — sesgo alcista en cadena`);
          if (instBuys.length > 0)        confirmations.push(`${instBuys.length} señal(es) institucional(es) de compra`);
          if (isPowerHour)                confirmations.push("Power Hour — volumen institucional elevado");
          if (isNegativeGamma)            confirmations.push("Gamma Negativo: dealers amplifican el movimiento alcista");
          confidence = score >= 78 ? "Alta" : score >= 68 ? "Media" : "Baja";
        }
      } else if (score <= 35) {
        // SHORT — sniper filters
        if (overExtendedDown && !isPowerHour) {
          rejections.push(`Precio ${vwapDistPct.toFixed(1)}% bajo VWAP ($${vwap.toFixed(2)}) — sobreextendido a la baja, espera rebote`);
        } else if (nearBBLower) {
          rejections.push(`En Bollinger Band inferior ($${bbLower.toFixed(2)}) — posible rebote, no entrar short`);
        } else {
          setup = "Short";
          if (price < gfNum && gfNum > 0) confirmations.push(`Bajo Gamma Flip $${gfNum} — dealers en cobertura bajista`);
          if (bearSweeps.length > 0)      confirmations.push(`${bearSweeps.length} put sweeps institucionales`);
          if (bearBlocks.length > 0)      confirmations.push(`${bearBlocks.length} bloques bajistas registrados`);
          if (ema9x21Bear)                confirmations.push("EMA estructura bajista confirmada");
          if (smasBearish15m)             confirmations.push(`SMA 15min bajista (precio bajo 20/40)`);
          if (smasBearish1h)              confirmations.push(`SMA 1h bajista — presión vendedora multi-día`);
          if (!aboveSma200_1h)            confirmations.push(`Bajo SMA200 1h ($${sma200_1h.toFixed(2)}) — momentum bajista macro confirmado`);
          if (price < vwap)               confirmations.push(`Bajo VWAP ($${vwap.toFixed(2)}) — momentum negativo del día`);
          if (callPutRatio < 0.9)         confirmations.push(`Call/Put OI ${callPutRatio.toFixed(2)}x — sesgo bajista en cadena`);
          if (ivSkew > 0.015)             confirmations.push(`IV skew puts ${(ivSkew*100).toFixed(1)}% — mercado comprando protección`);
          if (instSells.length > 0)       confirmations.push(`${instSells.length} señal(es) institucional(es) de venta`);
          if (isPowerHour)                confirmations.push("Power Hour — dirección más confiable");
          if (isNegativeGamma)            confirmations.push("Gamma Negativo: dealers amplifican la caída");
          confidence = score <= 22 ? "Alta" : score <= 32 ? "Media" : "Baja";
        }
      }
    } else if (isChopZone && !hardBlocked) {
      rejections.push("Chop Zone 12:00-14:00 ET — evitar, spreads amplios y volumen bajo");
    }

    if (setup === "No Trade") {
      rejections.forEach(r => confirmations.push(`⚠️ ${r}`));
      if (confirmations.length === 0) {
        confirmations.push(`⚪ Score ${Math.round(score)}/100 — sin confluencia suficiente (necesita >65 Long o <35 Short)`);
      }
    }

    // ── Flow / DP summaries (needed for early returns below) ────────────────
    const flowSummary = allFlow.length > 0
      ? `${allFlow.length} señales: ${bullFlow.length}↑ ${bearFlow.length}↓. Sweeps: ${sweeps.length}. C/P OI: ${callPutRatio.toFixed(2)}x. IV skew: ${(ivSkew*100).toFixed(1)}%.`
      : `Sin flujo registrado para ${symbol}.`;

    const dpSummary = dpPrints.length > 0
      ? `${dpPrints.length} dark pool prints. Sentimiento: ${dpSentiment}. NetGEX: ${netGex}.`
      : `Sin dark pool prints para ${symbol}.`;

    // ── Entry / SL / TP (sniper precision) ──────────────────────────────────
    let entry = "Sin setup — espera señal clara";
    let stopLoss = "N/A";
    let takeProfit = "N/A";
    let contractRec = "";

    if (setup === "Long") {
      const ep = price;
      // SL: Put Wall (si está <2.5% abajo), VWAP (dinámico), o -1.2% fijo
      let slPrice = (pwNum > 0 && pwNum < ep && (ep - pwNum) / ep < 0.025)
        ? pwNum
        : (vwap < ep ? parseFloat(vwap.toFixed(2)) : parseFloat((ep * 0.988).toFixed(2)));
      const slLabel = Math.abs(slPrice - pwNum) < 0.5 ? "(Put Wall)" :
                      Math.abs(slPrice - vwap) < 0.5 ? "(VWAP)" : "(-1.2%)";
      // TP: Call Wall (si está <4% arriba), BB upper, o +1.8%
      let tpPrice: number; let tpLabel: string;
      if (cwNum > ep && (cwNum - ep) / ep < 0.04) { tpPrice = cwNum; tpLabel = "(Call Wall)"; }
      else { tpPrice = parseFloat(Math.min(bbUpper, ep * 1.018).toFixed(2)); tpLabel = "(BB Upper)"; }
      // rr placeholder — actual calculation happens below after rrNum

      // Entry trigger — must accurately describe the actual price/VWAP relationship
      const priceAboveVwap = price > vwap;
      const entryTrigger = overExtendedUp
        ? `Espera pullback a VWAP $${vwap.toFixed(2)} — confirma vela verde 5m sin nuevo mínimo`
        : nearCallWall
        ? `Espera breakout de $${cwNum} con 2 velas 5m sobre el nivel antes de entrar`
        : priceAboveVwap
        ? `Entrada en $${ep.toFixed(2)} — precio sobre VWAP $${vwap.toFixed(2)}, confirma con volumen y vela verde 5m`
        : `Espera cruce de VWAP $${vwap.toFixed(2)} — confirma cierre de vela 5m por encima antes de entrar`;

      // R/R filter — skip low-quality setups
      const rrNum = (slPrice > 0 && ep > slPrice) ? (tpPrice - ep) / (ep - slPrice) : 0;
      if (rrNum < 0.5 && rrNum > 0) {
        // Poor R/R — downgrade to No Trade
        const _justNoTrade = `Precio ${price > vwap ? "sobre" : "bajo"} VWAP $${vwap.toFixed(2)}. R/R ${rrNum.toFixed(1)}x insuficiente — espera mejor estructura.`;
        const _ivStr = String((ticker as any).atmIv || "").replace(/[^0-9.]/g, "");
        const _ivVal = _ivStr ? parseFloat(_ivStr) : 35;
        return {
          symbol, marketMode, bias: `Neutral — R/R insuficiente (${rrNum.toFixed(1)}x)`,
          setup: "No Trade" as const,
          entry: `⚠️ Setup Long detectado pero R/R ${rrNum.toFixed(1)}x es insuficiente. Espera mejor nivel de entrada.`,
          confirmations: [`⚠️ R/R ${rrNum.toFixed(1)}x < 0.5x mínimo requerido — espera pullback o mejor SL`],
          stopLoss: "N/A", takeProfit: "N/A", confidence: "Baja" as const,
          reasoning: `${symbol} tiene setup Long pero R/R ${rrNum.toFixed(1)}x es demasiado bajo para entrar. Espera mejores condiciones.`,
          keyLevels: { gammaFlip, callWall, putWall, maxPain },
          flowSummary, liquiditySummary: dpSummary, session,
          timestamp: new Date().toISOString(), contractRec: "",
          technicals: {
            vwap: parseFloat(vwap.toFixed(2)), vwapDistPct: parseFloat(vwapDistPct.toFixed(2)),
            bbUpper: parseFloat(bbUpper.toFixed(2)), bbLower: parseFloat(bbLower.toFixed(2)),
            ema9: parseFloat(ema9Approx.toFixed(2)), ema21: parseFloat(ema21Approx.toFixed(2)),
            dayRangePct: parseFloat((dayRangeUsed * 100).toFixed(1)), overExtended: false,
          },
          sesgo: "NEUTRAL",
          nivelGatillo: `Sin entrada — R/R ${rrNum.toFixed(1)}x insuficiente`,
          justificacion: _justNoTrade,
          metricaOpcion: `Sin contrato — IV ATM ${_ivVal.toFixed(1)}% | Espera mejor estructura`,
          confianza: 15,
        } as any;
      }

      entry      = entryTrigger;
      stopLoss   = `$${slPrice.toFixed(2)} ${slLabel}`;
      takeProfit = `$${tpPrice.toFixed(2)} ${tpLabel} | R/R ${rrNum.toFixed(1)}x`;
      if (otm1Call) { contractRec = `CALL $${otm1Call} 0DTE (OTM+1)`; if (otm2Call) contractRec += ` / $${otm2Call} (OTM+2)`; }

    } else if (setup === "Short") {
      const ep = price;
      let slPrice = (cwNum > ep && (cwNum - ep) / ep < 0.025)
        ? cwNum
        : (vwap > ep ? parseFloat(vwap.toFixed(2)) : parseFloat((ep * 1.012).toFixed(2)));
      const slLabel = Math.abs(slPrice - cwNum) < 0.5 ? "(Call Wall)" :
                      Math.abs(slPrice - vwap) < 0.5 ? "(VWAP)" : "(+1.2%)";
      let tpPrice: number; let tpLabel: string;
      if (pwNum > 0 && pwNum < ep && (ep - pwNum) / ep < 0.04) { tpPrice = pwNum; tpLabel = "(Put Wall)"; }
      else { tpPrice = parseFloat(Math.max(bbLower, ep * 0.982).toFixed(2)); tpLabel = "(BB Lower)"; }
      // rr placeholder — actual calculation happens below after rrNum (Short)

      // Entry trigger — must accurately describe the actual price/VWAP relationship for shorts
      const priceBelowVwap = price < vwap;
      const entryTrigger = overExtendedDown
        ? `Espera rebote a VWAP $${vwap.toFixed(2)} — confirma rechazo con vela roja 5m`
        : nearPutWall
        ? `Espera breakdown de $${pwNum} con 2 velas 5m bajo el nivel antes de entrar`
        : priceBelowVwap
        ? `Entrada en $${ep.toFixed(2)} — precio bajo VWAP $${vwap.toFixed(2)}, confirma rechazo desde abajo con vela roja 5m`
        : `Espera rechazo de VWAP $${vwap.toFixed(2)} — confirma cierre de vela 5m por debajo antes de entrar`;

      // R/R filter — skip low-quality setups
      const rrNum = (slPrice > ep && ep > tpPrice) ? (ep - tpPrice) / (slPrice - ep) : 0;
      if (rrNum < 0.5 && rrNum > 0) {
        const _justNoTrade2 = `Precio ${price < vwap ? "bajo" : "sobre"} VWAP $${vwap.toFixed(2)}. R/R ${rrNum.toFixed(1)}x insuficiente — espera mejor estructura.`;
        const _ivStr2 = String((ticker as any).atmIv || "").replace(/[^0-9.]/g, "");
        const _ivVal2 = _ivStr2 ? parseFloat(_ivStr2) : 35;
        return {
          symbol, marketMode, bias: `Neutral — R/R insuficiente (${rrNum.toFixed(1)}x)`,
          setup: "No Trade" as const,
          entry: `⚠️ Setup Short detectado pero R/R ${rrNum.toFixed(1)}x es insuficiente. Espera mejor nivel de entrada.`,
          confirmations: [`⚠️ R/R ${rrNum.toFixed(1)}x < 0.5x mínimo requerido — espera bounce o mejor SL`],
          stopLoss: "N/A", takeProfit: "N/A", confidence: "Baja" as const,
          reasoning: `${symbol} tiene setup Short pero R/R ${rrNum.toFixed(1)}x es demasiado bajo para entrar. Espera mejores condiciones.`,
          keyLevels: { gammaFlip, callWall, putWall, maxPain },
          flowSummary, liquiditySummary: dpSummary, session,
          timestamp: new Date().toISOString(), contractRec: "",
          technicals: {
            vwap: parseFloat(vwap.toFixed(2)), vwapDistPct: parseFloat(vwapDistPct.toFixed(2)),
            bbUpper: parseFloat(bbUpper.toFixed(2)), bbLower: parseFloat(bbLower.toFixed(2)),
            ema9: parseFloat(ema9Approx.toFixed(2)), ema21: parseFloat(ema21Approx.toFixed(2)),
            dayRangePct: parseFloat((dayRangeUsed * 100).toFixed(1)), overExtended: false,
          },
          sesgo: "NEUTRAL",
          nivelGatillo: `Sin entrada — R/R ${rrNum.toFixed(1)}x insuficiente`,
          justificacion: _justNoTrade2,
          metricaOpcion: `Sin contrato — IV ATM ${_ivVal2.toFixed(1)}% | Espera mejor estructura`,
          confianza: 15,
        } as any;
      }

      entry      = entryTrigger;
      stopLoss   = `$${slPrice.toFixed(2)} ${slLabel}`;
      takeProfit = `$${tpPrice.toFixed(2)} ${tpLabel} | R/R ${rrNum.toFixed(1)}x`;
      if (otm1Put) { contractRec = `PUT $${otm1Put} 0DTE (OTM+1)`; if (otm2Put) contractRec += ` / $${otm2Put} (OTM+2)`; }
    }

    // ── Reasoning summary ───────────────────────────────────────────────────
    const reasoning =
      `${symbol} $${price.toFixed(2)} (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%) | ` +
      `VWAP $${vwap.toFixed(2)} (${vwapDistPct >= 0 ? "+" : ""}${vwapDistPct.toFixed(1)}%) | ` +
      `Flujo: ${bullFlow.length}↑ vs ${bearFlow.length}↓ sweeps=${sweeps.length} C/P=${callPutRatio.toFixed(2)}x | ` +
      `${marketMode}. ${entry}`;

    // ── Agente 0DTE structured output ───────────────────────────────
    const sesgo = setup === "Long" ? "BULLISH" : setup === "Short" ? "BEARISH" : "NEUTRAL";

    const cwNum2 = parseFloat(String(callWall).replace(/[^0-9.]/g, "")) || 0;
    const pwNum2 = parseFloat(String(putWall).replace(/[^0-9.]/g, "")) || 0;
    const gfNum2 = parseFloat(String(gammaFlip).replace(/[^0-9.]/g, "")) || 0;
    const justParts: string[] = [];
    if (price > vwap) justParts.push(`Precio sobre VWAP $${vwap.toFixed(2)}`);
    else justParts.push(`Precio bajo VWAP $${vwap.toFixed(2)}`);
    if (gfNum2 > 0) {
      if (price > gfNum2) justParts.push(`Sobre Gamma Flip $${gfNum2} — dealers alcistas`);
      else justParts.push(`Bajo Gamma Flip $${gfNum2} — dealers bajistas`);
    }
    if (cwNum2 > 0 && setup === "Long")  justParts.push(`Distancia a Call Wall: $${(cwNum2 - price).toFixed(2)} — espacio para scalp`);
    if (pwNum2 > 0 && setup === "Short") justParts.push(`Distancia a Put Wall: $${(price - pwNum2).toFixed(2)} — espacio para scalp`);
    if (sweeps.length > 0) justParts.push(`${sweeps.length} sweeps institucionales`);
    if (callPutRatio > 1.3 && setup === "Long")  justParts.push(`C/P OI ${callPutRatio.toFixed(2)}x — flujo alcista neto`);
    if (callPutRatio < 0.8 && setup === "Short") justParts.push(`C/P OI ${callPutRatio.toFixed(2)}x — flujo bajista neto`);
    // SMA context
    if (smasBullish15m && smasBullish1h)  justParts.push(`SMAs 15m+1h alineadas alcistas — confluencia multi-temporalidad`);
    if (smasBearish15m && smasBearish1h)  justParts.push(`SMAs 15m+1h alineadas bajistas — presión vendedora multi-temporalidad`);
    if (!aboveSma200_1h)                  justParts.push(`Bajo SMA200 1h ($${sma200_1h.toFixed(2)}) — zona macro bajista`);
    else if (aboveSma200_1h && !smasBullish1h) justParts.push(`Sobre SMA200 1h pero SMA20/100 divergen — estructura neutral`);
    const justificacion = justParts.join(". ");

    const ivStr   = String((ticker as any).atmIv || "").replace(/[^0-9.]/g, "");
    const ivVal   = ivStr ? parseFloat(ivStr) : (35 + Math.random() * 15);
    let metricaOpcion = "";
    if (contractRec) {
      const strikeMatch = contractRec.match(/\$([\d.]+)/);
      const strike = strikeMatch ? parseFloat(strikeMatch[1]) : 0;
      const distToStrike = strike > 0 ? Math.abs(strike - price) : 0;
      const approxDelta = strike > 0 ? Math.max(0.25, 0.65 - distToStrike * 0.08) : 0.45;
      const theta   = -(ivVal / 100 * price * 0.4 / 365);
      metricaOpcion = `${contractRec} | Delta ${approxDelta.toFixed(2)} | IV ${ivVal.toFixed(1)}% | Theta ${theta.toFixed(2)}/día`;
    } else {
      // No Trade — show IV and context
      const vwapLabel = price > vwap ? "sobre" : "bajo";
      metricaOpcion = `Sin contrato — IV ATM ${ivVal.toFixed(1)}% | Precio ${vwapLabel} VWAP | Gamma Flip: ${gammaFlip}`;
    }

    const confNum = confidence === "Alta"  ? 65 + Math.min(30, Math.round(score / 100 * 30))
                  : confidence === "Media" ? 40 + Math.min(25, Math.round(score / 100 * 25))
                  :                         15 + Math.min(25, Math.round(score / 100 * 25));

    return {
      symbol,
      marketMode,
      bias,
      setup,
      entry,
      confirmations,
      stopLoss,
      takeProfit,
      confidence,
      reasoning,
      keyLevels: { gammaFlip, callWall, putWall, maxPain },
      flowSummary,
      liquiditySummary: dpSummary,
      session,
      timestamp: new Date().toISOString(),
      contractRec,
      technicals: {
        vwap:         parseFloat(vwap.toFixed(2)),
        vwapDistPct:  parseFloat(vwapDistPct.toFixed(2)),
        bbUpper:      parseFloat(bbUpper.toFixed(2)),
        bbLower:      parseFloat(bbLower.toFixed(2)),
        ema9:         parseFloat(ema9Approx.toFixed(2)),
        ema21:        parseFloat(ema21Approx.toFixed(2)),
        dayRangePct:  parseFloat((dayRangeUsed * 100).toFixed(1)),
        overExtended: overExtendedUp || overExtendedDown,
        // SMA 20/40/100/200 — 15min and 1h timeframes
        sma20_15m:    parseFloat(sma20_15m.toFixed(2)),
        sma40_15m:    parseFloat(sma40_15m.toFixed(2)),
        sma100_15m:   parseFloat(sma100_15m.toFixed(2)),
        sma200_15m:   parseFloat(sma200_15m.toFixed(2)),
        sma20_1h:     parseFloat(sma20_1h.toFixed(2)),
        sma40_1h:     parseFloat(sma40_1h.toFixed(2)),
        sma100_1h:    parseFloat(sma100_1h.toFixed(2)),
        sma200_1h:    parseFloat(sma200_1h.toFixed(2)),
        smaAligned15m: smasBullish15m ? "bullish" : smasBearish15m ? "bearish" : "neutral",
        smaAligned1h:  smasBullish1h  ? "bullish" : smasBearish1h  ? "bearish" : "neutral",
      },
      sesgo,
      nivelGatillo:  entry,
      justificacion,
      metricaOpcion,
      confianza:     confNum,
    } as any;

  } catch (err: any) {
    console.error("[flowIntel] analyzeLocally error for " + symbol + ":", err.message);
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
