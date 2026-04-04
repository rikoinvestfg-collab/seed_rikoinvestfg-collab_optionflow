import { execSync } from "child_process";
import { storage } from "./storage";

const ALL_SYMBOLS = [
  "TSLA", "MSFT", "NVDA", "AAPL", "AMD", "NFLX", "GOOG", "AMZN",
  "PLTR", "AVGO", "MU", "META", "ORCL", "SPX", "QQQ", "DIA",
  "IWM", "SPY", "SOXL", "USO", "SLV", "GLD"
];

function callTool(sourceId: string, toolName: string, args: Record<string, unknown>): any {
  try {
    const params = JSON.stringify({ source_id: sourceId, tool_name: toolName, arguments: args });
    const result = execSync(`external-tool call '${params}'`, {
      timeout: 30000,
      encoding: "utf-8",
    });
    return JSON.parse(result);
  } catch (err: any) {
    console.error(`[liveData] Error calling ${toolName}:`, err.message?.substring(0, 200));
    return null;
  }
}

interface QuoteRow {
  symbol: string;
  price: number;
  change: number;
  changesPercentage: number;
  marketCap?: number;
  pe?: number;
  eps?: number;
  volume?: number;
  dayLow?: number;
  dayHigh?: number;
  previousClose?: number;
  open?: number;
}

function parseQuotesMarkdown(content: string): QuoteRow[] {
  const rows: QuoteRow[] = [];
  const lines = content.split("\n").filter((l: string) => l.includes("|") && !l.includes("---"));
  
  if (lines.length < 2) return rows;
  
  // Parse header
  const headers = lines[0].split("|").map((h: string) => h.trim().toLowerCase()).filter(Boolean);
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("|").map((c: string) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    
    const row: any = {};
    headers.forEach((h: string, idx: number) => {
      const val = cells[idx];
      if (!val || val === "N/A" || val === "-") return;
      
      if (h === "symbol" || h === "ticker") {
        row.symbol = val;
      } else {
        // Remove % signs, $ signs, commas, and parse as number
        const cleaned = val.replace(/[%$,]/g, "").trim();
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          if (h === "price") row.price = num;
          else if (h === "change") row.change = num;
          else if (h === "changespercentage" || h === "changes percentage") row.changesPercentage = num;
          else if (h === "marketcap" || h === "market cap") row.marketCap = num;
          else if (h === "pe" || h === "p/e") row.pe = num;
          else if (h === "eps") row.eps = num;
          else if (h === "volume") row.volume = num;
          else if (h === "daylow" || h === "day low") row.dayLow = num;
          else if (h === "dayhigh" || h === "day high") row.dayHigh = num;
          else if (h === "previousclose" || h === "previous close") row.previousClose = num;
          else if (h === "open") row.open = num;
        }
      }
    });
    
    if (row.symbol && row.price) rows.push(row as QuoteRow);
  }
  
  return rows;
}

let lastUpdateTime: Date | null = null;
let updateInProgress = false;

export async function fetchLiveQuotes(): Promise<boolean> {
  if (updateInProgress) {
    console.log("[liveData] Update already in progress, skipping");
    return false;
  }
  
  updateInProgress = true;
  console.log("[liveData] Fetching live quotes for", ALL_SYMBOLS.length, "tickers...");
  
  try {
    const result = callTool("finance", "finance_quotes", {
      ticker_symbols: ALL_SYMBOLS,
      fields: ["price", "change", "changesPercentage", "marketCap", "pe", "eps", "volume", "dayLow", "dayHigh", "previousClose", "open"]
    });
    
    if (!result) {
      console.error("[liveData] No result from finance_quotes");
      return false;
    }
    
    // The result has a content field with markdown table
    const content = typeof result === "string" ? result : 
                    result.content || result.text || JSON.stringify(result);
    
    const quotes = parseQuotesMarkdown(content);
    
    if (quotes.length === 0) {
      console.error("[liveData] Could not parse any quotes from response");
      // Try to parse as JSON in case the format is different
      try {
        const parsed = typeof result === "object" ? result : JSON.parse(content);
        if (Array.isArray(parsed)) {
          for (const q of parsed) {
            if (q.symbol && q.price) {
              const existing = storage.getTickerBySymbol(q.symbol);
              if (existing) {
                storage.upsertTicker({
                  ...existing,
                  price: q.price,
                  change: q.change ?? existing.change,
                  changePercent: q.changesPercentage ?? existing.changePercent,
                  marketCap: q.marketCap ?? existing.marketCap,
                  pe: q.pe ?? existing.pe,
                  eps: q.eps ?? existing.eps,
                  volume: q.volume ?? existing.volume,
                  dayLow: q.dayLow ?? existing.dayLow,
                  dayHigh: q.dayHigh ?? existing.dayHigh,
                  previousClose: q.previousClose ?? existing.previousClose,
                  open: q.open ?? existing.open,
                });
              }
            }
          }
        }
      } catch { /* ignore parse error */ }
      return false;
    }
    
    let updated = 0;
    for (const q of quotes) {
      const existing = storage.getTickerBySymbol(q.symbol);
      if (existing) {
        storage.upsertTicker({
          ...existing,
          price: q.price,
          change: q.change ?? existing.change,
          changePercent: q.changesPercentage ?? existing.changePercent,
          marketCap: q.marketCap ?? existing.marketCap,
          pe: q.pe ?? existing.pe,
          eps: q.eps ?? existing.eps,
          volume: q.volume ?? existing.volume,
          dayLow: q.dayLow ?? existing.dayLow,
          dayHigh: q.dayHigh ?? existing.dayHigh,
          previousClose: q.previousClose ?? existing.previousClose,
          open: q.open ?? existing.open,
        });
        updated++;
      }
    }
    
    lastUpdateTime = new Date();
    console.log(`[liveData] Updated ${updated}/${ALL_SYMBOLS.length} tickers at ${lastUpdateTime.toISOString()}`);
    return updated > 0;
  } catch (err: any) {
    console.error("[liveData] fetchLiveQuotes error:", err.message);
    return false;
  } finally {
    updateInProgress = false;
  }
}

export function getLastUpdateTime(): Date | null {
  return lastUpdateTime;
}

let refreshInterval: NodeJS.Timeout | null = null;

export function startLiveDataRefresh(intervalMs = 60000) {
  if (refreshInterval) clearInterval(refreshInterval);
  
  console.log(`[liveData] Starting live data refresh every ${intervalMs / 1000}s`);
  
  // Initial fetch after a short delay to let the server start
  setTimeout(() => {
    fetchLiveQuotes().catch(console.error);
  }, 5000);
  
  // Then refresh at the interval
  refreshInterval = setInterval(() => {
    fetchLiveQuotes().catch(console.error);
  }, intervalMs);
}

export function stopLiveDataRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log("[liveData] Stopped live data refresh");
  }
}
