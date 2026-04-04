/**
 * historicalData.ts
 * Fetches OHLCV historical data from finance connector
 * Supports multiple timeframes: 1min, 5min, 15min, 30min, 1hour, 4hour, 1day, 1week
 * Caches results to avoid hammering the API
 */

import { execSync } from "child_process";
import https from "https";
import http from "http";

interface OHLCVBar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CacheEntry {
  bars: OHLCVBar[];
  fetchedAt: number;
  interval: string;
}

// Cache: key = "SYMBOL:INTERVAL"
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS: Record<string, number> = {
  "1min": 60_000,
  "5min": 120_000,
  "15min": 300_000,
  "30min": 300_000,
  "1hour": 600_000,
  "4hour": 1800_000,
  "1day": 3600_000,
  "1week": 86400_000,
};

// How far back to fetch for each interval to get ~1000 bars
const DATE_RANGE_DAYS: Record<string, number> = {
  "1min": 3,
  "5min": 14,
  "15min": 40,
  "30min": 80,
  "1hour": 150,
  "4hour": 600,
  "1day": 1400,
  "1week": 7000,
};

const VALID_INTERVALS = ["1min", "5min", "15min", "30min", "1hour", "4hour", "1day", "1week"];

function callFinanceTool(toolName: string, args: Record<string, unknown>): any {
  try {
    const params = JSON.stringify({ source_id: "finance", tool_name: toolName, arguments: args });
    const result = execSync(`external-tool call '${params}'`, {
      timeout: 45000,
      encoding: "utf-8",
    });
    return JSON.parse(result);
  } catch (err: any) {
    console.error(`[historicalData] Error calling ${toolName}:`, err.message?.substring(0, 300));
    return null;
  }
}

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      let data = "";
      res.on("data", (chunk: any) => (data += chunk));
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function parseCSVToOHLCV(csvContent: string): OHLCVBar[] {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(",").map(h => h.trim());
  const dateIdx = header.findIndex(h => h === "date" || h === "datetime" || h === "timestamp");
  const openIdx = header.findIndex(h => h === "open");
  const highIdx = header.findIndex(h => h === "high");
  const lowIdx = header.findIndex(h => h === "low");
  const closeIdx = header.findIndex(h => h === "close");
  const volIdx = header.findIndex(h => h === "volume");

  if (dateIdx === -1 || closeIdx === -1) return [];

  const bars: OHLCVBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
    if (cols.length < 2) continue;

    const d = new Date(cols[dateIdx]);
    if (isNaN(d.getTime())) continue;
    const timestamp = Math.floor(d.getTime() / 1000);

    const open = openIdx >= 0 ? parseFloat(cols[openIdx].replace(/,/g, "")) : 0;
    const high = highIdx >= 0 ? parseFloat(cols[highIdx].replace(/,/g, "")) : 0;
    const low = lowIdx >= 0 ? parseFloat(cols[lowIdx].replace(/,/g, "")) : 0;
    const close = parseFloat(cols[closeIdx].replace(/,/g, ""));
    const volume = volIdx >= 0 ? parseFloat(cols[volIdx].replace(/,/g, "")) : 0;

    if (isNaN(close) || close === 0) continue;
    bars.push({ time: timestamp, open: open || close, high: high || close, low: low || close, close, volume: volume || 0 });
  }

  bars.sort((a, b) => a.time - b.time);
  return bars;
}

function parseMarkdownTableToOHLCV(content: string): OHLCVBar[] {
  // Extract markdown table rows: | date | open | high | low | close | volume |
  const lines = content.split("\n");
  const bars: OHLCVBar[] = [];
  let headerFound = false;
  let colMap: Record<string, number> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;

    const cells = trimmed.split("|").map(c => c.trim()).filter(c => c.length > 0);

    // Skip separator row (| --- | --- |)
    if (cells.every(c => /^[-:]+$/.test(c))) continue;

    if (!headerFound) {
      // Parse header
      cells.forEach((c, i) => { colMap[c.toLowerCase()] = i; });
      headerFound = true;
      continue;
    }

    // Parse data row
    const dateStr = cells[colMap["date"] ?? 0];
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;

    const parseNum = (key: string): number => {
      const idx = colMap[key];
      if (idx === undefined || idx >= cells.length) return 0;
      return parseFloat(cells[idx].replace(/,/g, "")) || 0;
    };

    const close = parseNum("close");
    if (close === 0) continue;

    bars.push({
      time: Math.floor(d.getTime() / 1000),
      open: parseNum("open") || close,
      high: parseNum("high") || close,
      low: parseNum("low") || close,
      close,
      volume: parseNum("volume"),
    });
  }

  bars.sort((a, b) => a.time - b.time);
  return bars;
}

export async function fetchHistoricalOHLCV(symbol: string, interval: string): Promise<OHLCVBar[]> {
  if (!VALID_INTERVALS.includes(interval)) interval = "5min";

  const cacheKey = `${symbol}:${interval}`;
  const cached = cache.get(cacheKey);
  const ttl = CACHE_TTL_MS[interval] || 300_000;

  if (cached && Date.now() - cached.fetchedAt < ttl) {
    return cached.bars;
  }

  const daysBack = DATE_RANGE_DAYS[interval] || 14;
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];

  console.log(`[historicalData] Fetching ${symbol} ${interval} from ${startStr} to ${endStr}`);

  const result = callFinanceTool("finance_ohlcv_histories", {
    ticker_symbols: [symbol],
    query: `${symbol} price history`,
    start_date_yyyy_mm_dd: startStr,
    end_date_yyyy_mm_dd: endStr,
    time_interval: interval,
    fields: ["open", "high", "low", "close", "volume"],
    extended_hours: true,
  });

  if (!result) {
    console.error("[historicalData] No result returned for", symbol, interval);
    return cached?.bars || [];
  }

  let bars: OHLCVBar[] = [];

  // Method 1: Download CSV file if available
  if (result.csv_files && Array.isArray(result.csv_files) && result.csv_files.length > 0) {
    const csvFile = result.csv_files[0];
    if (csvFile.url) {
      try {
        console.log(`[historicalData] Downloading CSV from S3 for ${symbol} ${interval}`);
        const csvContent = await fetchUrl(csvFile.url);
        bars = parseCSVToOHLCV(csvContent);
        if (bars.length > 0) {
          console.log(`[historicalData] Parsed ${bars.length} bars from CSV file`);
        }
      } catch (err: any) {
        console.error(`[historicalData] CSV download failed:`, err.message?.substring(0, 200));
      }
    }
  }

  // Method 2: Parse markdown table from content
  if (bars.length === 0 && result.content && typeof result.content === "string") {
    bars = parseMarkdownTableToOHLCV(result.content);
    if (bars.length > 0) {
      console.log(`[historicalData] Parsed ${bars.length} bars from markdown table`);
    }
  }

  if (bars.length > 0) {
    const trimmed = bars.slice(-1000);
    cache.set(cacheKey, { bars: trimmed, fetchedAt: Date.now(), interval });
    console.log(`[historicalData] ${symbol} ${interval}: ${trimmed.length} bars cached`);
    return trimmed;
  }

  console.error(`[historicalData] No bars parsed for ${symbol} ${interval}`);
  return cached?.bars || [];
}

export function getValidIntervals() {
  return VALID_INTERVALS;
}
