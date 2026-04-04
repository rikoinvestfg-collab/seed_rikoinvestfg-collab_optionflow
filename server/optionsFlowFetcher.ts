import { storage } from "./storage";
import type { InsertOptionsFlow } from "@shared/schema";

const ALL_SYMBOLS = [
  "TSLA", "MSFT", "NVDA", "AAPL", "AMD", "NFLX", "GOOG", "AMZN",
  "PLTR", "AVGO", "MU", "META", "ORCL", "SPX", "QQQ", "DIA",
  "IWM", "SPY", "SOXL", "USO", "SLV", "GLD"
];

interface FlowSignal {
  symbol: string;
  optionContract: string; // e.g. SPY260402P00658000
  type: string;           // sweep, burst, block, single
  direction: string;      // BUY 90%, SELL 10%
  contracts: number;
  notional: string;
  premium: string;
  trades: number;
  time: string;
  durationMs: number;
  first: string;
  last: string;
  bid: string;
  ask: string;
  exchanges: number;
  confidence: number;     // percentage 0-100
  callPut: string;        // CALL or PUT
  strike: string;
  expiry: string;
  sentiment: string;      // bullish or bearish
}

// Generate detailed options flow from our live ticker data
function generateDetailedFlow(): FlowSignal[] {
  const signals: FlowSignal[] = [];
  const tickers = storage.getAllTickers();
  const now = new Date();
  
  // Time formatting
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const dateStr = now.toISOString().split("T")[0].replace(/-/g, "").substring(2); // YYMMDD
  
  for (const t of tickers) {
    if (!t.volume || t.volume < 1000) continue;
    
    const absChange = Math.abs(t.changePercent);
    const price = t.price;
    
    // Generate flow based on price movement magnitude
    if (absChange > 0.5) {
      // Number of flow signals proportional to movement
      const numSignals = absChange > 3 ? 3 : absChange > 2 ? 2 : 1;
      
      for (let s = 0; s < numSignals; s++) {
        const isCall = t.change >= 0;
        const isBuy = Math.random() > 0.2; // 80% buys
        const callPut = isCall ? "C" : "P";
        
        // Generate realistic strike prices
        const strikeDelta = (s + 1) * Math.max(1, Math.round(price * 0.01));
        const strike = isCall 
          ? Math.round((price + strikeDelta) / (price < 100 ? 1 : 5)) * (price < 100 ? 1 : 5)
          : Math.round((price - strikeDelta) / (price < 100 ? 1 : 5)) * (price < 100 ? 1 : 5);
        
        const strikeStr = (strike * 1000).toString().padStart(8, "0");
        
        // Use realistic 2026 option expiration dates (weekly Fri, monthly 3rd Fri, Good Friday=Thu)
        // Based on CBOE calendar: weekly expirations every Friday (or Thursday when Friday is holiday)
        const REAL_EXPIRATIONS_2026 = [
          "260403", // Apr 3 Thu (Good Friday exception - weekly)
          "260409", // Apr 9 (weekly)
          "260417", // Apr 17 (monthly)
          "260423", // Apr 23 (weekly)
          "260430", // Apr 30 (weekly)
          "260507", // May 7 (weekly)
          "260515", // May 15 (monthly)
          "260521", // May 21 (weekly)
          "260528", // May 28 (weekly)
          "260604", // Jun 4 (weekly)
          "260618", // Jun 18 Thursday (monthly, Juneteenth holiday)
        ];
        // Weight shorter-dated expirations more heavily (like real flow)
        const expWeights = [0.35, 0.20, 0.15, 0.10, 0.08, 0.05, 0.03, 0.02, 0.01, 0.005, 0.005];
        let rand = Math.random(); let expStr = REAL_EXPIRATIONS_2026[0];
        let cumulative = 0;
        for (let i = 0; i < expWeights.length; i++) {
          cumulative += expWeights[i];
          if (rand < cumulative) { expStr = REAL_EXPIRATIONS_2026[i]; break; }
        }
        // Parse expiry for storage
        const expYY = expStr.substring(0,2), expMM = expStr.substring(2,4), expDD = expStr.substring(4,6);
        const expDate = new Date(2000+parseInt(expYY), parseInt(expMM)-1, parseInt(expDD));
        
        // Contract name like SPY260409P00658000
        const contractName = `${t.symbol}${expStr}${callPut}${strikeStr}`;
        
        // Realistic values
        const contracts = Math.round(100 + Math.random() * 1800);
        const optionPrice = Math.max(0.01, price * absChange * 0.001 * (numSignals - s + 1));
        const notional = contracts * optionPrice * 100;
        const premium = notional;
        const trades = Math.round(1 + Math.random() * 15);
        const duration = Math.round(50 + Math.random() * 2000);
        const confidence = Math.round(75 + Math.random() * 25);
        const exchanges = Math.round(1 + Math.random() * 6);
        
        // Signal type based on characteristics
        let signalType = "block";
        if (trades > 3 && exchanges > 1) signalType = "sweep";
        else if (duration < 200 && contracts > 500) signalType = "burst";
        else if (contracts < 200 && trades <= 1) signalType = "single";
        
        const buyPct = isBuy ? Math.round(80 + Math.random() * 20) : Math.round(5 + Math.random() * 20);
        const direction = isBuy 
          ? `BUY ${buyPct}%` 
          : `SELL ${buyPct}%`;
        
        const spread = optionPrice * (0.01 + Math.random() * 0.05);
        
        // Compute time offsets for variety
        const minutesAgo = Math.round(s * 2 + Math.random() * 5);
        const signalTime = new Date(now.getTime() - minutesAgo * 60000);
        const signalTimeStr = signalTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
        
        signals.push({
          symbol: t.symbol,
          optionContract: contractName,
          type: signalType,
          direction,
          contracts,
          notional: formatMoney(notional),
          premium: formatMoney(premium),
          trades,
          time: signalTimeStr,
          durationMs: duration,
          first: `$${optionPrice.toFixed(2)}`,
          last: `$${(optionPrice + spread * 0.5).toFixed(2)}`,
          bid: `$${(optionPrice - spread * 0.3).toFixed(2)}`,
          ask: `$${(optionPrice + spread * 0.7).toFixed(2)}`,
          exchanges,
          confidence,
          callPut: isCall ? "CALL" : "PUT",
          strike: `$${strike}`,
          expiry: expDate.toISOString().split("T")[0],
          sentiment: (isCall && isBuy) || (!isCall && !isBuy) ? "bullish" : "bearish",
        });
      }
    }
  }
  
  // Sort by most recent
  signals.sort((a, b) => {
    // Sort by most recent time first
    const aPrem = parseFloat(a.notional.replace(/[$KMB,]/g, "")) || 0;
    const bPrem = parseFloat(b.notional.replace(/[$KMB,]/g, "")) || 0;
    return bPrem - aPrem;
  });
  
  return signals;
}

function formatMoney(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

let flowFetchInProgress = false;
let lastFlowFetchTime: Date | null = null;

// Track last clear date to reset at start of each trading day
let lastClearDate = new Date().toDateString();
const MAX_DAILY_FLOWS = 300; // Keep up to 300 flows accumulated during the day

export async function fetchOptionsFlow(): Promise<number> {
  if (flowFetchInProgress) return 0;
  flowFetchInProgress = true;
  console.log("[optionsFlow] Generating options flow signals...");
  
  try {
    const signals = generateDetailedFlow();
    
    // Only clear at start of a new trading day (not every refresh)
    const todayStr = new Date().toDateString();
    if (todayStr !== lastClearDate) {
      storage.clearAllOptionsFlow();
      lastClearDate = todayStr;
      console.log("[optionsFlow] New trading day — cleared flow history");
    }

    // Trim to MAX_DAILY_FLOWS if needed
    const existing = storage.getAllOptionsFlow();
    if (existing.length >= MAX_DAILY_FLOWS) {
      storage.clearAllOptionsFlow();
      // Re-add last 200 to preserve recent history
      for (const e of existing.slice(-200)) {
        try { storage.addOptionsFlow(e as any); } catch {}
      }
    }
    
    let added = 0;
    for (const s of signals) {
      try {
        storage.addOptionsFlow({
          symbol: s.symbol,
          type: s.type,
          strike: s.strike || null,
          expiry: s.expiry || null,
          premium: s.premium || null,
          volume: JSON.stringify({
            optionContract: s.optionContract,
            direction: s.direction,
            contracts: s.contracts,
            notional: s.notional,
            trades: s.trades,
            time: s.time,
            durationMs: s.durationMs,
            first: s.first,
            last: s.last,
            bid: s.bid,
            ask: s.ask,
            exchanges: s.exchanges,
            confidence: s.confidence,
            callPut: s.callPut,
          }),
          openInterest: null,
          sentiment: s.sentiment || null,
          signal: s.type || null,
          timestamp: new Date().toISOString(),
          details: `${s.optionContract} | ${s.direction} | ${s.contracts} contracts | ${s.notional}`,
        });
        added++;
      } catch {}
    }
    
    lastFlowFetchTime = new Date();
    console.log(`[optionsFlow] Added ${added} flow signals`);
    flowFetchInProgress = false;
    return added;
  } catch (err: any) {
    console.error("[optionsFlow] Error:", err.message);
    flowFetchInProgress = false;
    return 0;
  }
}

export function getLastFlowFetchTime(): Date | null {
  return lastFlowFetchTime;
}

let flowInterval: NodeJS.Timeout | null = null;

export function startOptionsFlowRefresh(intervalMs = 120000) {
  if (flowInterval) clearInterval(flowInterval);
  console.log(`[optionsFlow] Starting options flow refresh every ${intervalMs / 1000}s`);
  setTimeout(() => { fetchOptionsFlow().catch(console.error); }, 15000);
  flowInterval = setInterval(() => { fetchOptionsFlow().catch(console.error); }, intervalMs);
}

export function stopOptionsFlowRefresh() {
  if (flowInterval) { clearInterval(flowInterval); flowInterval = null; }
}
