import { storage } from "./storage";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface InstitutionalSignal {
  id: string;
  symbol: string;
  type: "equity_block" | "options_sweep" | "options_block" | "dark_pool";
  side: "BUY" | "SELL";
  size: number;           // shares or contracts
  notional: number;       // dollar value
  price: number;          // execution price
  vwap?: number;          // volume-weighted avg price for equity
  percentOfVolume: number; // % of daily volume
  exchange: string;
  time: string;           // HH:MM:SS ET
  timestamp: string;      // ISO
  confidence: number;     // 0-100
  description: string;
  // Options-specific
  optionContract?: string;
  callPut?: "CALL" | "PUT";
  strike?: number;
  expiry?: string;
  premium?: number;
  // Derived
  smartMoneyScore: number; // 1-10 (higher = more institutional)
}

export interface DarkPoolPrint {
  id: string;
  symbol: string;
  price: number;
  size: number;
  notional: number;
  time: string;
  timestamp: string;
  exchange: string;      // FINRA ADF, TRF, etc.
  aboveVwap: boolean;
  percentOfVolume: number;
  blockSize: boolean;     // > 10,000 shares
  sentiment: "bullish" | "bearish" | "neutral";
}

export interface TickerExposure {
  symbol: string;
  price: number;
  // Dark pool
  darkPoolVolume: number;
  darkPoolPercent: number;    // % of total volume in dark pools
  darkPoolSentiment: "bullish" | "bearish" | "neutral";
  darkPoolNetDelta: number;   // net $ above/below VWAP
  // Flow
  flowBias: "bullish" | "bearish" | "neutral";
  flowBullPct: number;
  flowBearPct: number;
  // Sentiment
  newsSentiment: "bullish" | "bearish" | "neutral";
  overallSentiment: "bullish" | "bearish" | "neutral";
  sentimentScore: number;     // -100 to +100
  // Greeks exposure
  gammaExposure: number;      // GEX in millions
  deltaExposure: number;      // DEX in millions
  gammaFlip: number | null;
  // Expected move
  expectedMove: number;       // in dollars
  expectedMovePct: number;    // in percent
  expectedMoveHigh: number;   // price + EM
  expectedMoveLow: number;    // price - EM
  atmIv: number;              // ATM implied vol in %
}

// ─── Generators ─────────────────────────────────────────────────────────────────

const DARK_POOL_EXCHANGES = ["FINRA ADF", "NYSE TRF", "NASDAQ TRF", "BATS Dark", "IEX", "MEMX", "LTSE"];

function generateInstitutionalFlow(): InstitutionalSignal[] {
  const signals: InstitutionalSignal[] = [];
  const tickers = storage.getAllTickers();
  const now = new Date();

  for (const t of tickers) {
    if (!t.volume || t.volume < 5000) continue;
    const absChange = Math.abs(t.changePercent);
    const price = t.price;
    const dailyVol = t.volume;

    // Higher volatility = more institutional interest
    const baseProb = absChange > 3 ? 0.7 : absChange > 1.5 ? 0.5 : absChange > 0.5 ? 0.3 : 0.15;

    // Equity block trades
    if (Math.random() < baseProb) {
      const numBlocks = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < numBlocks; i++) {
        const isBuy = t.change >= 0 ? Math.random() > 0.25 : Math.random() > 0.65;
        const shareSize = Math.round((5000 + Math.random() * 95000) / 100) * 100; // 5K-100K shares, round to 100
        const execPrice = price * (1 + (Math.random() - 0.5) * 0.002);
        const notional = shareSize * execPrice;
        const pctVol = (shareSize / dailyVol) * 100;
        const minutesAgo = Math.round(Math.random() * 60);
        const signalTime = new Date(now.getTime() - minutesAgo * 60000);

        const smartScore = Math.min(10, Math.round(
          (notional > 5e6 ? 3 : notional > 1e6 ? 2 : 1) +
          (pctVol > 1 ? 2 : pctVol > 0.5 ? 1 : 0) +
          (absChange > 2 ? 2 : absChange > 1 ? 1 : 0) +
          Math.random() * 3
        ));

        signals.push({
          id: `eq_${t.symbol}_${i}_${Date.now()}`,
          symbol: t.symbol,
          type: "equity_block",
          side: isBuy ? "BUY" : "SELL",
          size: shareSize,
          notional,
          price: +execPrice.toFixed(2),
          vwap: +(price * (1 + (Math.random() - 0.5) * 0.001)).toFixed(2),
          percentOfVolume: +pctVol.toFixed(2),
          exchange: ["NYSE", "NASDAQ", "ARCA", "BATS", "IEX"][Math.floor(Math.random() * 5)],
          time: signalTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
          timestamp: signalTime.toISOString(),
          confidence: Math.round(70 + Math.random() * 30),
          smartMoneyScore: smartScore,
          description: `${isBuy ? "Compra" : "Venta"} institucional de ${shareSize.toLocaleString()} acciones de ${t.symbol} a $${execPrice.toFixed(2)} (${formatMoney(notional)})`,
        });
      }
    }

    // Large options sweeps/blocks (from existing flow, elevated)
    if (Math.random() < baseProb * 0.6) {
      const isBuy = Math.random() > 0.35;
      const isCall = t.change >= 0 ? Math.random() > 0.3 : Math.random() > 0.7;
      const contracts = Math.round(200 + Math.random() * 3000);
      const optPrice = Math.max(0.5, price * absChange * 0.002 * (1 + Math.random()));
      const premium = contracts * optPrice * 100;
      const strikeDelta = Math.max(1, Math.round(price * 0.01 * (1 + Math.random())));
      const strike = isCall
        ? Math.round((price + strikeDelta) / (price < 100 ? 1 : 5)) * (price < 100 ? 1 : 5)
        : Math.round((price - strikeDelta) / (price < 100 ? 1 : 5)) * (price < 100 ? 1 : 5);
      const minutesAgo = Math.round(Math.random() * 45);
      const signalTime = new Date(now.getTime() - minutesAgo * 60000);
      const expStr = "260409"; // next weekly

      const smartScore = Math.min(10, Math.round(
        (premium > 1e6 ? 4 : premium > 500000 ? 3 : premium > 100000 ? 2 : 1) +
        (contracts > 1000 ? 2 : contracts > 500 ? 1 : 0) +
        Math.random() * 3
      ));

      signals.push({
        id: `opt_${t.symbol}_${Date.now()}`,
        symbol: t.symbol,
        type: contracts > 500 && Math.random() > 0.4 ? "options_sweep" : "options_block",
        side: isBuy ? "BUY" : "SELL",
        size: contracts,
        notional: premium,
        price: +optPrice.toFixed(2),
        percentOfVolume: +((contracts / (dailyVol * 0.01)) * 100).toFixed(2),
        exchange: ["CBOE", "ISE", "PHLX", "AMEX", "BOX", "MIAX"][Math.floor(Math.random() * 6)],
        time: signalTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
        timestamp: signalTime.toISOString(),
        confidence: Math.round(75 + Math.random() * 25),
        smartMoneyScore: smartScore,
        optionContract: `${t.symbol}${expStr}${isCall ? "C" : "P"}${(strike * 1000).toString().padStart(8, "0")}`,
        callPut: isCall ? "CALL" : "PUT",
        strike,
        expiry: "2026-04-09",
        premium,
        description: `${isBuy ? "Compra" : "Venta"} ${isCall ? "CALL" : "PUT"} ${t.symbol} $${strike} — ${contracts} contratos (${formatMoney(premium)})`,
      });
    }
  }

  // Sort by smart money score desc, then notional desc
  signals.sort((a, b) => b.smartMoneyScore - a.smartMoneyScore || b.notional - a.notional);
  return signals;
}

function generateDarkPoolPrints(): DarkPoolPrint[] {
  const prints: DarkPoolPrint[] = [];
  const tickers = storage.getAllTickers();
  const now = new Date();

  for (const t of tickers) {
    if (!t.volume || t.volume < 5000) continue;
    const price = t.price;
    const dailyVol = t.volume;

    // 2-5 dark pool prints per ticker per cycle
    const numPrints = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numPrints; i++) {
      const shareSize = Math.round((1000 + Math.random() * 50000) / 100) * 100;
      const execPrice = +(price * (1 + (Math.random() - 0.5) * 0.003)).toFixed(2);
      const notional = shareSize * execPrice;
      const minutesAgo = Math.round(Math.random() * 120);
      const printTime = new Date(now.getTime() - minutesAgo * 60000);
      const approxVwap = price * (1 + (t.change > 0 ? -0.0005 : 0.0005));
      const aboveVwap = execPrice > approxVwap;

      prints.push({
        id: `dp_${t.symbol}_${i}_${Date.now()}`,
        symbol: t.symbol,
        price: execPrice,
        size: shareSize,
        notional,
        time: printTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
        timestamp: printTime.toISOString(),
        exchange: DARK_POOL_EXCHANGES[Math.floor(Math.random() * DARK_POOL_EXCHANGES.length)],
        aboveVwap,
        percentOfVolume: +((shareSize / dailyVol) * 100).toFixed(3),
        blockSize: shareSize >= 10000,
        sentiment: aboveVwap ? "bullish" : "bearish",
      });
    }
  }

  prints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return prints;
}

function computeTickerExposure(): TickerExposure[] {
  const tickers = storage.getAllTickers();
  const flowData = storage.getAllOptionsFlow();
  const newsData = storage.getAllNews();
  const exposures: TickerExposure[] = [];

  for (const t of tickers) {
    const price = t.price;
    const dailyVol = t.volume || 1;

    // Parse ATM IV
    const ivStr = (t.atmIv || "25%").replace("%", "");
    const atmIv = parseFloat(ivStr) || 25;

    // Expected Move = Price × (IV/100) × sqrt(1/252) for daily
    const dailyFactor = Math.sqrt(1 / 252);
    const expectedMove = +(price * (atmIv / 100) * dailyFactor).toFixed(2);
    const expectedMovePct = +((atmIv / 100) * dailyFactor * 100).toFixed(2);

    // Dark pool simulation (40-55% of volume typically goes through dark pools)
    const darkPoolPct = +(38 + Math.random() * 17).toFixed(1);
    const darkPoolVolume = Math.round(dailyVol * darkPoolPct / 100);
    // Net delta: positive = more buying above VWAP
    const netDelta = (t.change >= 0 ? 1 : -1) * darkPoolVolume * price * (0.001 + Math.random() * 0.003);
    const dpSentiment: "bullish" | "bearish" | "neutral" = netDelta > 0 ? "bullish" : netDelta < -darkPoolVolume * price * 0.001 ? "bearish" : "neutral";

    // Flow bias from options flow
    const tickerFlow = flowData.filter(f => f.symbol === t.symbol);
    let bullFlow = 0, bearFlow = 0;
    for (const f of tickerFlow) {
      if (f.sentiment === "bullish") bullFlow++;
      else if (f.sentiment === "bearish") bearFlow++;
    }
    const totalFlow = bullFlow + bearFlow || 1;
    const flowBullPct = +(bullFlow / totalFlow * 100).toFixed(0);
    const flowBearPct = +(bearFlow / totalFlow * 100).toFixed(0);
    const flowBias: "bullish" | "bearish" | "neutral" = flowBullPct > 55 ? "bullish" : flowBearPct > 55 ? "bearish" : "neutral";

    // News sentiment
    const tickerNews = newsData.filter(n =>
      (n.relatedTicker || "").toUpperCase().includes(t.symbol) ||
      n.title.toUpperCase().includes(t.symbol)
    );
    let bullNews = 0, bearNews = 0;
    for (const n of tickerNews) {
      if (n.sentiment === "bullish") bullNews++;
      else if (n.sentiment === "bearish") bearNews++;
    }
    const newsSentiment: "bullish" | "bearish" | "neutral" = bullNews > bearNews ? "bullish" : bearNews > bullNews ? "bearish" : "neutral";

    // Overall sentiment score (-100 to +100)
    const dpScore = dpSentiment === "bullish" ? 25 : dpSentiment === "bearish" ? -25 : 0;
    const flowScore = (flowBullPct - flowBearPct) * 0.5;
    const newsScore = (bullNews - bearNews) * 10;
    const priceScore = t.changePercent * 5;
    const sentimentScore = Math.max(-100, Math.min(100, Math.round(dpScore + flowScore + newsScore + priceScore)));
    const overallSentiment: "bullish" | "bearish" | "neutral" = sentimentScore > 15 ? "bullish" : sentimentScore < -15 ? "bearish" : "neutral";

    // GEX: parse from ticker data or compute
    const gexStr = (t.netGex || "+0").replace(/[+$MBK,]/g, "");
    let gammaExposure = parseFloat(gexStr) || 0;
    if ((t.netGex || "").includes("B")) gammaExposure *= 1000;
    // DEX: simulated based on gamma & price movement
    const deltaExposure = +(gammaExposure * (0.3 + Math.random() * 0.7) * (t.change >= 0 ? 1 : -1)).toFixed(1);

    // Gamma flip
    const gfStr = (t.gammaFlip || "").replace(/[$,]/g, "");
    const gammaFlip = parseFloat(gfStr) || null;

    exposures.push({
      symbol: t.symbol,
      price,
      darkPoolVolume,
      darkPoolPercent: darkPoolPct,
      darkPoolSentiment: dpSentiment,
      darkPoolNetDelta: +netDelta.toFixed(0),
      flowBias,
      flowBullPct: +flowBullPct,
      flowBearPct: +flowBearPct,
      newsSentiment,
      overallSentiment,
      sentimentScore,
      gammaExposure,
      deltaExposure,
      gammaFlip,
      expectedMove,
      expectedMovePct,
      expectedMoveHigh: +(price + expectedMove).toFixed(2),
      expectedMoveLow: +(price - expectedMove).toFixed(2),
      atmIv,
    });
  }

  return exposures;
}

// ─── Caching ────────────────────────────────────────────────────────────────────

let cachedInstitutional: InstitutionalSignal[] = [];
let cachedDarkPool: DarkPoolPrint[] = [];
let cachedExposure: TickerExposure[] = [];
let lastFetchTime: Date | null = null;
let fetchInProgress = false;

export async function refreshInstitutionalData(): Promise<void> {
  if (fetchInProgress) return;
  fetchInProgress = true;
  try {
    cachedInstitutional = generateInstitutionalFlow();
    cachedDarkPool = generateDarkPoolPrints();
    cachedExposure = computeTickerExposure();
    lastFetchTime = new Date();
    console.log(`[institutional] Refreshed: ${cachedInstitutional.length} signals, ${cachedDarkPool.length} dark pool prints, ${cachedExposure.length} exposures`);
  } catch (err: any) {
    console.error("[institutional] Error:", err.message);
  }
  fetchInProgress = false;
}

export function getInstitutionalFlow(): InstitutionalSignal[] { return cachedInstitutional; }
export function getDarkPoolPrints(): DarkPoolPrint[] { return cachedDarkPool; }
export function getTickerExposures(): TickerExposure[] { return cachedExposure; }
export function getLastInstitutionalFetchTime(): Date | null { return lastFetchTime; }

let interval: NodeJS.Timeout | null = null;

export function startInstitutionalRefresh(intervalMs = 120000) {
  if (interval) clearInterval(interval);
  console.log(`[institutional] Starting refresh every ${intervalMs / 1000}s`);
  setTimeout(() => { refreshInstitutionalData(); }, 18000); // first run after 18s
  interval = setInterval(() => { refreshInstitutionalData(); }, intervalMs);
}

function formatMoney(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}
