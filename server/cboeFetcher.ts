/**
 * CBOE Free Options Chain GEX Calculator
 *
 * Fetches free public options chain data from CBOE's CDN:
 *   https://cdn.cboe.com/api/global/delayed_quotes/options/{TICKER}.json
 *
 * Calculates Gamma Exposure (GEX) key levels from scratch:
 *   - Gamma Flip  : zero-crossing of net GEX nearest to current price
 *   - Call Wall   : strike with highest cumulative positive GEX above price
 *   - Put Wall    : strike with most negative cumulative GEX below price
 *   - Max Pain    : strike with highest total open interest
 *   - Net GEX     : sum of all per-strike GEX values
 *   - Gamma Regime: Positive / Negative based on sign of net GEX
 *
 * No API key, no rate limits, completely free.
 * Data is ~15 min delayed (more than sufficient for key level computation).
 */

import https from "https";
import { storage } from "./storage";

// ─── Ticker → CBOE URL map ────────────────────────────────────────────────────
// SPX uses underscore prefix on CBOE CDN (_SPX), not $SPX
const CBOE_SYMBOL: Record<string, string> = {
  SPX: "_SPX",
};

// Tickers that never have 0DTE weeklies on CBOE — we use nearest expiry instead
// (includes non-equity ETPs + less-liquid names)
const NO_0DTE_TICKERS = new Set([
  "AMD", "NFLX", "GOOG", "PLTR", "MU", "ORCL", "DIA", "SOXL", "USO",
]);

const ALL_TICKERS = [
  "TSLA", "MSFT", "NVDA", "AAPL", "AMD", "NFLX", "GOOG", "AMZN",
  "PLTR", "AVGO", "MU", "META", "ORCL", "SPX", "QQQ", "DIA",
  "IWM", "SPY", "SOXL", "USO", "SLV", "GLD",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface CboeOption {
  option: string;           // e.g. "SPY260406C00650000"
  bid: number;
  ask: number;
  iv: number;               // implied volatility (decimal)
  open_interest: number;    // total OI (may be in lots or shares depending on chain)
  gamma: number;            // per-share gamma from CBOE
  delta?: number;
  theta?: number;
  vega?: number;
  volume?: number;
}

interface CboeResponse {
  data: {
    current_price: number;
    options: CboeOption[];
  };
}

interface ParsedOption {
  symbol: string;
  expDate: string;   // YYMMDD
  type: "C" | "P";
  strike: number;
  gamma: number;
  oi: number;
  iv: number;
}

interface GexLevels {
  gammaFlip: string | null;
  maxPain: string | null;
  callWall: string | null;
  putWall: string | null;
  gammaRegime: string | null;
  atmIv: string | null;
  netGex: string | null;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OptionFlowDashboard/1.0)",
          "Accept": "application/json",
        },
        timeout: 15000,
      },
      (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (loc) return httpsGet(loc).then(resolve).catch(reject);
          return reject(new Error(`Redirect with no location for ${url}`));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
        res.on("error", reject);
      }
    ).on("error", reject).on("timeout", () => reject(new Error(`Timeout fetching ${url}`)));
  });
}

// ─── Option symbol parser ─────────────────────────────────────────────────────
// Format: {TICKER}{YYMMDD}{C|P}{STRIKE*1000 zero-padded to 8 digits}
// e.g.  SPY260406C00650000  → SPY, 260406, C, 650.00
//       $SPX260406P05500000 → SPX, 260406, P, 5500.00
// Ticker length: find first digit position in symbol (after stripping leading $)

function parseOptionSymbol(raw: string): ParsedOption | null {
  try {
    // Strip leading $ or _ (for $SPX / _SPX options on CBOE)
    const sym = (raw.startsWith("$") || raw.startsWith("_")) ? raw.slice(1) : raw;

    // Find first digit — that marks end of ticker name
    let tickerEnd = 0;
    while (tickerEnd < sym.length && isNaN(parseInt(sym[tickerEnd], 10))) {
      tickerEnd++;
    }
    if (tickerEnd === 0 || tickerEnd + 15 > sym.length) return null;

    const expDate = sym.slice(tickerEnd, tickerEnd + 6);       // YYMMDD
    const optType = sym[tickerEnd + 6] as "C" | "P";          // C or P
    const strikeRaw = sym.slice(tickerEnd + 7, tickerEnd + 15); // 8 digits
    const strike = parseInt(strikeRaw, 10) / 1000;

    if (isNaN(strike) || (optType !== "C" && optType !== "P")) return null;

    return { symbol: raw, expDate, type: optType, strike, gamma: 0, oi: 0, iv: 0 };
  } catch {
    return null;
  }
}

// ─── Today's date in YYMMDD format (ET) ──────────────────────────────────────

function todayYYMMDD(): string {
  // Get current date in America/New_York
  const now = new Date();
  const etStr = now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  // etStr: "MM/DD/YY"
  const [mm, dd, yy] = etStr.split("/");
  return `${yy}${mm}${dd}`;
}

// ─── Nearest expiry finder ────────────────────────────────────────────────────

function nearestExpiry(expDates: string[], today: string): string | null {
  // expDates are in YYMMDD format
  const sorted = expDates
    .filter((d) => d >= today) // only future/today
    .sort();
  return sorted.length > 0 ? sorted[0] : null;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatStrike(v: number): string {
  return `$${v.toFixed(2)}`;
}

function formatGexBillions(gex: number): string {
  const sign = gex < 0 ? "-" : "+";
  const abs = Math.abs(gex);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

// ─── Core GEX Calculator ──────────────────────────────────────────────────────
/**
 * GEX per contract:
 *   Call: +gamma × OI × 100 × spot² × 0.01
 *   Put:  −gamma × OI × 100 × spot² × 0.01
 *
 * "spot² × 0.01" converts dollar-gamma to notional GEX in USD
 */
function calculateGex(options: ParsedOption[], spot: number): {
  byStrike: Map<number, number>;
  total: number;
} {
  const byStrike = new Map<number, number>();

  for (const opt of options) {
    if (opt.gamma <= 0 || opt.oi <= 0) continue;
    const raw = opt.gamma * opt.oi * 100 * spot * spot * 0.01;
    const gex = opt.type === "C" ? raw : -raw;
    byStrike.set(opt.strike, (byStrike.get(opt.strike) ?? 0) + gex);
  }

  const total = Array.from(byStrike.values()).reduce((a, b) => a + b, 0);
  return { byStrike, total };
}

// ─── Key level derivation ─────────────────────────────────────────────────────

function deriveKeyLevels(
  options: ParsedOption[],
  spot: number,
  ticker: string
): GexLevels {
  if (options.length === 0) {
    return {
      gammaFlip: null,
      maxPain: null,
      callWall: null,
      putWall: null,
      gammaRegime: null,
      atmIv: null,
      netGex: null,
    };
  }

  const { byStrike, total: netGexRaw } = calculateGex(options, spot);

  // Sort strikes
  const strikes = Array.from(byStrike.keys()).sort((a, b) => a - b);

  // ── Gamma Flip ────────────────────────────────────────────────────────────
  // Find cumulative GEX from lowest strike up; find where it crosses zero
  // nearest to spot price
  let runningGex = 0;
  let gammaFlipStrike: number | null = null;
  let prevStrike: number | null = null;
  let prevRunning = 0;

  for (const s of strikes) {
    prevRunning = runningGex;
    runningGex += byStrike.get(s) ?? 0;
    if (prevStrike !== null && prevRunning * runningGex < 0) {
      // Sign changed — zero crossing between prevStrike and s
      // Pick the one closer to spot
      const distPrev = Math.abs((prevStrike) - spot);
      const distCurr = Math.abs(s - spot);
      gammaFlipStrike = distPrev < distCurr ? prevStrike : s;
    }
    prevStrike = s;
  }

  // If no cumulative zero-crossing, find the strike with smallest |GEX| near spot
  if (gammaFlipStrike === null) {
    let minAbs = Infinity;
    for (const [s, g] of byStrike.entries()) {
      const abs = Math.abs(g);
      if (abs < minAbs) {
        minAbs = abs;
        gammaFlipStrike = s;
      }
    }
  }

  // ── Call Wall (highest +GEX strike ABOVE spot) ────────────────────────────
  let callWallStrike: number | null = null;
  let maxPosGex = 0;
  for (const [s, g] of byStrike.entries()) {
    if (s > spot && g > maxPosGex) {
      maxPosGex = g;
      callWallStrike = s;
    }
  }

  // ── Put Wall (most negative GEX strike BELOW spot) ────────────────────────
  let putWallStrike: number | null = null;
  let maxNegGex = 0;
  for (const [s, g] of byStrike.entries()) {
    if (s < spot && g < maxNegGex) {
      maxNegGex = g;
      putWallStrike = s;
    }
  }

  // ── Max Pain (strike with highest total OI) ───────────────────────────────
  const oiByStrike = new Map<number, number>();
  for (const opt of options) {
    oiByStrike.set(opt.strike, (oiByStrike.get(opt.strike) ?? 0) + opt.oi);
  }
  let maxPainStrike: number | null = null;
  let maxOi = 0;
  for (const [s, oi] of oiByStrike.entries()) {
    if (oi > maxOi) {
      maxOi = oi;
      maxPainStrike = s;
    }
  }

  // ── ATM IV ────────────────────────────────────────────────────────────────
  // Find the option closest to spot price and use its IV
  let atmIvValue: number | null = null;
  let minDist = Infinity;
  for (const opt of options) {
    const dist = Math.abs(opt.strike - spot);
    if (dist < minDist && opt.iv > 0) {
      minDist = dist;
      atmIvValue = opt.iv;
    }
  }

  // ── Gamma Regime ──────────────────────────────────────────────────────────
  const gammaRegime = netGexRaw >= 0 ? "Positive Gamma" : "Negative Gamma";

  return {
    gammaFlip: gammaFlipStrike !== null ? formatStrike(gammaFlipStrike) : null,
    maxPain: maxPainStrike !== null ? formatStrike(maxPainStrike) : null,
    callWall: callWallStrike !== null ? formatStrike(callWallStrike) : null,
    putWall: putWallStrike !== null ? formatStrike(putWallStrike) : null,
    gammaRegime,
    atmIv: atmIvValue !== null ? `${(atmIvValue * 100).toFixed(1)}% IV` : null,
    netGex: formatGexBillions(netGexRaw),
  };
}

// ─── Per-ticker fetch + calculate ────────────────────────────────────────────

async function fetchGexForTicker(ticker: string): Promise<GexLevels | null> {
  const cboeSymbol = CBOE_SYMBOL[ticker] ?? ticker;
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${cboeSymbol}.json`;

  let raw: CboeResponse;
  try {
    const body = await httpsGet(url);
    raw = JSON.parse(body) as CboeResponse;
  } catch (err: any) {
    console.warn(`[cboe] Failed to fetch ${ticker}: ${err.message}`);
    return null;
  }

  const spot = raw?.data?.current_price;
  const optionsRaw = raw?.data?.options;

  if (!spot || !Array.isArray(optionsRaw) || optionsRaw.length === 0) {
    console.warn(`[cboe] No data for ${ticker}`);
    return null;
  }

  // Parse all options and attach gamma/OI/IV from the raw response
  const parsed: ParsedOption[] = [];
  for (const o of optionsRaw) {
    if (!o.option) continue;
    const p = parseOptionSymbol(o.option);
    if (!p) continue;
    p.gamma = o.gamma ?? 0;
    p.oi = o.open_interest ?? 0;
    p.iv = o.iv ?? 0;
    parsed.push(p);
  }

  // Determine target expiry
  const today = todayYYMMDD();
  const allExpiries = [...new Set(parsed.map((p) => p.expDate))];

  let targetExpiry: string | null = null;

  if (!NO_0DTE_TICKERS.has(ticker)) {
    // Prefer 0DTE (today's expiry)
    if (allExpiries.includes(today)) {
      targetExpiry = today;
    }
  }

  // Fallback: nearest available expiry
  if (!targetExpiry) {
    targetExpiry = nearestExpiry(allExpiries, today);
  }

  if (!targetExpiry) {
    console.warn(`[cboe] No valid expiry found for ${ticker}`);
    return null;
  }

  // Filter to target expiry only
  const filtered = parsed.filter((p) => p.expDate === targetExpiry);

  const label = targetExpiry === today ? "0DTE" : `exp ${targetExpiry}`;
  console.log(
    `[cboe] ${ticker}: spot=$${spot.toFixed(2)}, ${label}, ${filtered.length} contracts`
  );

  // ── Build and cache options chain snapshot ───────────────────────────────
  let totalCallOI = 0, totalPutOI = 0;
  const byStrikeMap = new Map<number, StrikeLevel>();

  for (const opt of filtered) {
    const existing = byStrikeMap.get(opt.strike) ?? {
      strike: opt.strike, callOI: 0, putOI: 0, callIV: 0, putIV: 0, netGex: 0,
    };
    if (opt.type === "C") {
      existing.callOI += opt.oi;
      existing.callIV  = opt.iv;
      existing.netGex += opt.gamma * opt.oi * 100 * spot * spot * 0.01;
      totalCallOI += opt.oi;
    } else {
      existing.putOI += opt.oi;
      existing.putIV  = opt.iv;
      existing.netGex -= opt.gamma * opt.oi * 100 * spot * spot * 0.01;
      totalPutOI += opt.oi;
    }
    byStrikeMap.set(opt.strike, existing);
  }

  // Sort strikes closest to spot
  const sortedStrikes = Array.from(byStrikeMap.values())
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));

  // IV skew: ATM put IV - ATM call IV (positive = bearish skew)
  const atmCall = sortedStrikes.find(s => s.callIV > 0);
  const atmPut  = sortedStrikes.find(s => s.putIV  > 0);
  const ivSkew  = (atmPut?.putIV ?? 0) - (atmCall?.callIV ?? 0);

  const snapshot: OptionsChainSnapshot = {
    ticker,
    spot,
    expiry:       targetExpiry,
    strikes:      sortedStrikes,
    callPutRatio: totalPutOI > 0 ? totalCallOI / totalPutOI : 1,
    ivSkew,
    totalCallOI,
    totalPutOI,
    fetchedAt:    Date.now(),
  };
  optionsChainCache.set(ticker, snapshot);

  return deriveKeyLevels(filtered, spot, ticker);
}

// ─── Options chain cache (per ticker) ────────────────────────────────────────
export interface StrikeLevel {
  strike:   number;
  callOI:   number;
  putOI:    number;
  callIV:   number;
  putIV:    number;
  netGex:   number;   // positive = call wall, negative = put wall
}

export interface OptionsChainSnapshot {
  ticker:       string;
  spot:         number;
  expiry:       string;   // YYMMDD
  strikes:      StrikeLevel[];
  callPutRatio: number;   // total call OI / total put OI
  ivSkew:       number;   // ATM put IV - ATM call IV (positive = put skew = bearish)
  totalCallOI:  number;
  totalPutOI:   number;
  fetchedAt:    number;   // Unix ms
}

const optionsChainCache = new Map<string, OptionsChainSnapshot>();

export function getOptionsChain(ticker: string): OptionsChainSnapshot | null {
  return optionsChainCache.get(ticker) ?? null;
}

// ─── State ────────────────────────────────────────────────────────────────────

let lastCboeFetchTime: Date | null = null;
let cboeInProgress = false;
let cboeInterval: NodeJS.Timeout | null = null;

// ─── Main fetch loop ──────────────────────────────────────────────────────────

export async function fetchCboeGexData(): Promise<boolean> {
  if (cboeInProgress) {
    console.log("[cboe] Fetch already in progress, skipping");
    return false;
  }

  cboeInProgress = true;
  console.log("[cboe] Starting CBOE GEX key level refresh for all tickers...");

  let updated = 0;
  let failed = 0;

  // Process tickers in batches of 4 to avoid flooding CBOE CDN
  const batchSize = 4;
  for (let i = 0; i < ALL_TICKERS.length; i += batchSize) {
    const batch = ALL_TICKERS.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const levels = await fetchGexForTicker(ticker);
          if (!levels) { failed++; return; }

          const existing = storage.getTickerBySymbol(ticker);
          if (!existing) { console.warn(`[cboe] ${ticker} not in storage`); return; }

          storage.upsertTicker({
            ...existing,
            gammaFlip:    levels.gammaFlip    ?? existing.gammaFlip,
            maxPain:      levels.maxPain      ?? existing.maxPain,
            callWall:     levels.callWall     ?? existing.callWall,
            putWall:      levels.putWall      ?? existing.putWall,
            gammaRegime:  levels.gammaRegime  ?? existing.gammaRegime,
            atmIv:        levels.atmIv        ?? existing.atmIv,
            netGex:       levels.netGex       ?? existing.netGex,
          });
          updated++;
        } catch (err: any) {
          console.error(`[cboe] Error processing ${ticker}:`, err.message);
          failed++;
        }
      })
    );

    // Small delay between batches to be polite to CBOE CDN
    if (i + batchSize < ALL_TICKERS.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  lastCboeFetchTime = new Date();
  console.log(
    `[cboe] Refresh complete: ${updated} updated, ${failed} failed at ${lastCboeFetchTime.toISOString()}`
  );

  cboeInProgress = false;
  return updated > 0;
}

export function getLastCboeFetchTime(): Date | null {
  return lastCboeFetchTime;
}

/**
 * Start the CBOE GEX refresh loop.
 * Default: every 5 minutes (data is 15-min delayed anyway, 5 min is plenty)
 */
export function startCboeRefresh(intervalMs = 300000) {
  if (cboeInterval) clearInterval(cboeInterval);

  console.log(`[cboe] Starting CBOE GEX refresh every ${intervalMs / 1000}s`);

  // Initial fetch after 15s (give server time to start, liveData to populate first)
  setTimeout(() => {
    fetchCboeGexData().catch(console.error);
  }, 15000);

  cboeInterval = setInterval(() => {
    fetchCboeGexData().catch(console.error);
  }, intervalMs);
}

export function stopCboeRefresh() {
  if (cboeInterval) {
    clearInterval(cboeInterval);
    cboeInterval = null;
    console.log("[cboe] Stopped CBOE GEX refresh");
  }
}
