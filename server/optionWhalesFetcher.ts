/**
 * OptionWhales API Fetcher
 * Fetches real-time GEX / options flow data from api.optionwhales.io/v1
 * and maps it to the dashboard's key level fields per ticker.
 *
 * API Key: ow_pro_23e1f7972e60377b7c360ca5b506ccc7
 * Docs: https://www.optionwhales.io/developers
 * Rate limit: 60 req/min (Pro plan)
 */

import https from "https";
import { storage } from "./storage";

const OW_API_KEY = "ow_pro_23e1f7972e60377b7c360ca5b506ccc7";
const OW_BASE_URL = "https://api.optionwhales.io/v1";

// Our 22 tracked tickers
const TRACKED_TICKERS = new Set([
  "TSLA", "MSFT", "NVDA", "AAPL", "AMD", "NFLX", "GOOG", "AMZN",
  "PLTR", "AVGO", "MU", "META", "ORCL", "SPX", "QQQ", "DIA",
  "IWM", "SPY", "SOXL", "USO", "SLV", "GLD"
]);

interface OWRanking {
  ticker: string;
  momentum_fast: number;
  momentum_slow: number;
  coherence_last: number;
  strength_last: number;
  net_delta_last: number;
  net_gamma_last: number;
  net_vega_last: number;
  intent_label: string;
  intent_primary: string;
  intent_modifiers: string;
  intent_confidence: number;
  direction_bias: string;   // "bullish" | "bearish" | "neutral"
  thesis_build_score: number;
  short_term_dominance: number;
  long_dated_bias: boolean;
  expiry_noise: boolean;
  closing_weight_fraction: number;
  key_strikes: string;      // semicolon-separated strike prices e.g. "450.00;400.00;460.00"
  entry_time: string;
  entry_date: string;
}

interface OWFlowResponse {
  session: string;
  is_live: boolean;
  rankings: OWRanking[];
}

/**
 * Make a GET request to the OptionWhales API
 */
function owGet(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `${OW_BASE_URL}${path}`;
    const options = {
      headers: {
        "X-API-Key": OW_API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "OptionFlow-Dashboard/1.0",
      },
    };

    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.substring(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

/**
 * Format a number as a dollar amount string for display
 */
function formatDollar(value: number | undefined | null): string | null {
  if (value === undefined || value === null || isNaN(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

/**
 * Parse key_strikes string and derive Call Wall, Put Wall, Gamma Flip
 *
 * OptionWhales provides key_strikes as semicolon-separated prices.
 * We use the following heuristic:
 *   - The strike with the largest absolute gamma exposure is the primary wall
 *   - If direction_bias is bullish → first strike is call wall, last is put wall
 *   - If direction_bias is bearish → first strike is put wall, last is call wall
 *   - If neutral (pin) → first strike is gamma flip / max pain level
 *   - The momentum fast/slow ratio gives us a regime signal for gammaRegime
 */
function mapRankingToKeyLevels(r: OWRanking): {
  gammaFlip: string | null;
  maxPain: string | null;
  callWall: string | null;
  putWall: string | null;
  gammaRegime: string | null;
  atmIv: string | null;
  netGex: string | null;
} {
  // Parse key strikes
  const strikes = (r.key_strikes || "")
    .split(";")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b); // sort ascending

  let gammaFlip: string | null = null;
  let maxPain: string | null = null;
  let callWall: string | null = null;
  let putWall: string | null = null;

  if (strikes.length > 0) {
    if (r.direction_bias === "neutral" || strikes.length === 1) {
      // Pin regime — primary strike IS the gamma flip / max pain
      const primary = strikes[Math.floor(strikes.length / 2)]; // median strike
      gammaFlip = `$${primary.toFixed(2)}`;
      maxPain = `$${primary.toFixed(2)}`;
      // Call wall = highest strike, put wall = lowest strike
      if (strikes.length >= 2) {
        callWall = `$${strikes[strikes.length - 1].toFixed(2)}`;
        putWall = `$${strikes[0].toFixed(2)}`;
      } else {
        callWall = `$${primary.toFixed(2)}`;
        putWall = `$${primary.toFixed(2)}`;
      }
    } else if (r.direction_bias === "bullish") {
      // Bullish-convex: highest strike = call wall (resistance above)
      // Lowest strike = put wall (support below)
      // Gamma flip = median
      const mid = strikes[Math.floor(strikes.length / 2)];
      gammaFlip = `$${mid.toFixed(2)}`;
      maxPain = `$${mid.toFixed(2)}`;
      callWall = `$${strikes[strikes.length - 1].toFixed(2)}`;
      putWall = `$${strikes[0].toFixed(2)}`;
    } else if (r.direction_bias === "bearish") {
      // Bearish-convex: lowest strike = put wall (pressure below)
      // Highest strike = call wall (resistance above)
      const mid = strikes[Math.floor(strikes.length / 2)];
      gammaFlip = `$${mid.toFixed(2)}`;
      maxPain = `$${mid.toFixed(2)}`;
      callWall = `$${strikes[strikes.length - 1].toFixed(2)}`;
      putWall = `$${strikes[0].toFixed(2)}`;
    }
  }

  // Gamma regime: derive from intent_label + direction_bias + momentum
  let gammaRegime: string | null = null;
  const intentPrimary = r.intent_primary || "Mixed";
  const bias = r.direction_bias || "neutral";
  const confidence = r.intent_confidence || 0;
  const confidencePct = Math.round(confidence * 100);

  if (intentPrimary === "Gamma") {
    const mods = r.intent_modifiers || "";
    if (mods.includes("pin-like")) {
      gammaRegime = bias === "neutral"
        ? `Gamma PIN (${confidencePct}%)`
        : `Gamma PIN → ${bias} (${confidencePct}%)`;
    } else if (mods.includes("bullish-convex")) {
      gammaRegime = `Bullish GEX (${confidencePct}%)`;
    } else if (mods.includes("bearish-convex")) {
      gammaRegime = `Bearish GEX (${confidencePct}%)`;
    } else {
      gammaRegime = `Gamma ${bias} (${confidencePct}%)`;
    }
  } else if (intentPrimary === "Directional") {
    gammaRegime = `Directional ${bias} (${confidencePct}%)`;
  } else if (intentPrimary === "LongVol") {
    gammaRegime = `Long Vol / Event (${confidencePct}%)`;
  } else if (intentPrimary === "ShortVol") {
    gammaRegime = `Short Vol / Carry (${confidencePct}%)`;
  } else {
    gammaRegime = `Mixed (${confidencePct}%)`;
  }

  // Net GEX: format net_gamma_last
  const netGex = formatDollar(r.net_gamma_last);

  // ATM IV: show momentum direction signal
  // Since OW doesn't provide raw IV, we show a directional momentum signal
  // momentum_fast > 0 → buying pressure; < 0 → selling pressure
  const momentumDir = r.momentum_fast >= 0 ? "▲ Buying" : "▼ Selling";
  const coherencePct = Math.round(r.coherence_last * 100);
  const atmIv = `${momentumDir} (${coherencePct}% signal)`;

  return { gammaFlip, maxPain, callWall, putWall, gammaRegime, atmIv, netGex };
}

let lastOwFetchTime: Date | null = null;
let owFetchInProgress = false;
let owRefreshInterval: NodeJS.Timeout | null = null;

/**
 * Fetch OptionWhales flow data and update ticker key levels in storage
 */
export async function fetchOptionWhalesData(): Promise<boolean> {
  if (owFetchInProgress) {
    console.log("[optionWhales] Fetch already in progress, skipping");
    return false;
  }

  owFetchInProgress = true;
  console.log("[optionWhales] Fetching live GEX data from OptionWhales...");

  try {
    const data: OWFlowResponse = await owGet("/flow/current");

    if (!data || !Array.isArray(data.rankings)) {
      console.error("[optionWhales] Invalid response structure:", JSON.stringify(data).substring(0, 200));
      return false;
    }

    const rankings = data.rankings;
    console.log(`[optionWhales] Received ${rankings.length} rankings, session: ${data.session}, live: ${data.is_live}`);

    let updated = 0;
    let matched = 0;

    for (const r of rankings) {
      if (!TRACKED_TICKERS.has(r.ticker)) continue;
      matched++;

      const existing = storage.getTickerBySymbol(r.ticker);
      if (!existing) {
        console.log(`[optionWhales] Ticker ${r.ticker} not in storage, skipping`);
        continue;
      }

      const keyLevels = mapRankingToKeyLevels(r);

      storage.upsertTicker({
        ...existing,
        gammaFlip: keyLevels.gammaFlip ?? existing.gammaFlip,
        maxPain: keyLevels.maxPain ?? existing.maxPain,
        callWall: keyLevels.callWall ?? existing.callWall,
        putWall: keyLevels.putWall ?? existing.putWall,
        gammaRegime: keyLevels.gammaRegime ?? existing.gammaRegime,
        atmIv: keyLevels.atmIv ?? existing.atmIv,
        netGex: keyLevels.netGex ?? existing.netGex,
      });

      updated++;
    }

    lastOwFetchTime = new Date();
    console.log(
      `[optionWhales] Updated key levels for ${updated}/${matched} matched tickers at ${lastOwFetchTime.toISOString()}`
    );

    if (matched === 0) {
      console.log(`[optionWhales] None of our 22 tickers found in today's rankings. Session: ${data.session}`);
      // Log which tickers were in the response for debugging
      const inResponse = rankings.slice(0, 10).map((r) => r.ticker).join(", ");
      console.log(`[optionWhales] Sample tickers in response: ${inResponse}`);
    }

    return updated > 0;
  } catch (err: any) {
    console.error("[optionWhales] fetchOptionWhalesData error:", err.message);
    return false;
  } finally {
    owFetchInProgress = false;
  }
}

export function getLastOwFetchTime(): Date | null {
  return lastOwFetchTime;
}

/**
 * Start the OptionWhales refresh loop
 * Default: every 90 seconds (within 60 req/min Pro limit)
 */
export function startOptionWhalesRefresh(intervalMs = 90000) {
  if (owRefreshInterval) clearInterval(owRefreshInterval);

  console.log(`[optionWhales] Starting OptionWhales refresh every ${intervalMs / 1000}s`);

  // Initial fetch after 10s (let server start first)
  setTimeout(() => {
    fetchOptionWhalesData().catch(console.error);
  }, 10000);

  owRefreshInterval = setInterval(() => {
    fetchOptionWhalesData().catch(console.error);
  }, intervalMs);
}

export function stopOptionWhalesRefresh() {
  if (owRefreshInterval) {
    clearInterval(owRefreshInterval);
    owRefreshInterval = null;
    console.log("[optionWhales] Stopped OptionWhales refresh");
  }
}
