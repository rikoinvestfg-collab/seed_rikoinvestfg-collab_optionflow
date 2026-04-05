import https from "https";
import http from "http";
import { storage } from "./storage";
import type { InsertNews } from "@shared/schema";
import { sendNewsToDiscord } from "./discordSender";
import fs from "fs";
import path from "path";

// Persistent tracking of sent news IDs to Discord
const SENT_NEWS_FILE = path.join(process.cwd(), "data", "sent_news_ids.json");

function loadSentNewsIds(): Set<string> {
  try {
    if (fs.existsSync(SENT_NEWS_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(SENT_NEWS_FILE, "utf-8")));
    }
  } catch {}
  return new Set();
}

function saveSentNewsIds(ids: Set<string>) {
  try {
    const dir = path.dirname(SENT_NEWS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const arr = [...ids].slice(-500);
    fs.writeFileSync(SENT_NEWS_FILE, JSON.stringify(arr));
  } catch {}
}

const sentNewsIds = loadSentNewsIds();

const ALL_SYMBOLS = [
  "TSLA", "MSFT", "NVDA", "AAPL", "AMD", "NFLX", "GOOG", "AMZN",
  "PLTR", "AVGO", "MU", "META", "ORCL", "SPY", "QQQ", "SOXL",
  "USO", "SLV", "GLD", "SPX", "DIA", "IWM"
];

// Map symbols to search-friendly names
const SYMBOL_NAMES: Record<string, string[]> = {
  TSLA: ["Tesla", "TSLA"],
  MSFT: ["Microsoft", "MSFT"],
  NVDA: ["Nvidia", "NVDA", "NVIDIA"],
  AAPL: ["Apple", "AAPL"],
  AMD: ["AMD", "Advanced Micro"],
  NFLX: ["Netflix", "NFLX"],
  GOOG: ["Google", "Alphabet", "GOOG", "GOOGL"],
  AMZN: ["Amazon", "AMZN"],
  PLTR: ["Palantir", "PLTR"],
  AVGO: ["Broadcom", "AVGO"],
  MU: ["Micron", "MU "],
  META: ["Meta Platforms", "META", "Facebook"],
  ORCL: ["Oracle", "ORCL"],
  SPY: ["S&P 500 ETF", "SPY"],
  SPX: ["S&P 500", "SPX"],
  QQQ: ["Nasdaq", "QQQ"],
  SOXL: ["semiconductor", "SOXL", "chip stocks"],
  USO: ["oil", "crude", "USO"],
  SLV: ["silver", "SLV"],
  GLD: ["gold", "GLD"],
  DIA: ["Dow Jones", "DIA"],
  IWM: ["Russell 2000", "IWM", "small cap"],
};

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers: { "User-Agent": "OptionFlowDashboard/2.0" }, timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => resolve(data));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

interface RawNewsItem {
  title: string;
  summary: string;
  source: string;
  url: string;
  pubDate: string;
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();
  
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

function parseRSS(xml: string, sourceName: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  
  // Match <item> or <entry> blocks
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2];
    const title = extractTag(block, "title");
    const description = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
    const link = extractTag(block, "link") || (block.match(/href="([^"]+)"/)?.[1] || "");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    
    if (title && title.length > 10) {
      items.push({
        title: decodeHTMLEntities(title),
        summary: decodeHTMLEntities(description).substring(0, 500),
        source: sourceName,
        url: link,
        pubDate,
      });
    }
  }
  
  return items;
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function detectTicker(title: string, summary: string): string | null {
  const combined = (title + " " + summary).toUpperCase();
  
  for (const [symbol, keywords] of Object.entries(SYMBOL_NAMES)) {
    for (const kw of keywords) {
      if (combined.includes(kw.toUpperCase())) {
        return symbol;
      }
    }
  }
  
  // Also check for exact ticker mentions like $TSLA or (TSLA)
  for (const sym of ALL_SYMBOLS) {
    if (combined.includes(`$${sym}`) || combined.includes(`(${sym})`) || combined.includes(` ${sym} `)) {
      return sym;
    }
  }
  
  return null;
}

function detectSentiment(title: string, summary: string): string {
  const combined = (title + " " + summary).toLowerCase();
  const bullish = ["surge", "rally", "gain", "jump", "soar", "beat", "record", "high", "upgrade", "buy", "outperform", "bullish", "rises", "climbs", "strong", "boost", "positive", "growth"];
  const bearish = ["drop", "fall", "decline", "crash", "miss", "sell", "downgrade", "bearish", "slump", "plunge", "loss", "weak", "cut", "warning", "fear", "risk", "concern", "tumble"];
  
  let bullCount = 0, bearCount = 0;
  for (const w of bullish) if (combined.includes(w)) bullCount++;
  for (const w of bearish) if (combined.includes(w)) bearCount++;
  
  if (bullCount > bearCount) return "bullish";
  if (bearCount > bullCount) return "bearish";
  return "neutral";
}

// Parse Seeking Alpha news sitemap (freshest breaking news)
function parseSeekingAlphaSitemap(xml: string): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const urlRegex = /<url>([\s\S]*?)<\/url>/gi;
  let match;
  
  while ((match = urlRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "news:title");
    const loc = extractTag(block, "loc");
    const pubDate = extractTag(block, "news:publication_date");
    const tickers = extractTag(block, "news:stock_tickers");
    const keywords = extractTag(block, "news:keywords");
    
    if (title && title.length > 10) {
      items.push({
        title: decodeHTMLEntities(title),
        summary: keywords ? `Tickers: ${tickers}. ${decodeHTMLEntities(title)}` : decodeHTMLEntities(title),
        source: "Seeking Alpha",
        url: loc,
        pubDate,
      });
    }
  }
  
  return items;
}

// Seeking Alpha per-ticker RSS feeds for our portfolio
const SA_TICKER_SYMBOLS = [
  "TSLA", "MSFT", "NVDA", "AAPL", "AMD", "NFLX", "GOOG", "AMZN",
  "PLTR", "AVGO", "MU", "META", "ORCL", "SPY", "QQQ", "SOXL", "GLD", "SLV"
];

// RSS feeds for financial news — Seeking Alpha first (primary source)
const RSS_FEEDS: Array<{ url: string; source: string; parser?: "sitemap" }> = [
  // Seeking Alpha breaking news sitemap (freshest)
  { url: "https://seekingalpha.com/sitemap_news.xml", source: "Seeking Alpha", parser: "sitemap" },
  // Seeking Alpha general feed
  { url: "https://seekingalpha.com/feed.xml", source: "Seeking Alpha" },
  // Seeking Alpha per-ticker feeds (batched into groups to limit requests)
  ...SA_TICKER_SYMBOLS.map(sym => ({
    url: `https://seekingalpha.com/api/sa/combined/${sym}.xml`,
    source: "Seeking Alpha",
  })),
  // Other sources
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=TSLA,AAPL,MSFT,NVDA,AMZN,GOOG,META,AMD,NFLX,PLTR,AVGO,MU,ORCL&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,SOXL,GLD,SLV,USO&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", source: "MarketWatch" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147", source: "CNBC Markets" },
  { url: "https://www.investing.com/rss/news_25.rss", source: "Investing.com" },
];

let lastNewsFetchTime: Date | null = null;
let newsFetchInProgress = false;
// Using persistent sentNewsIds set instead of isFirstNewsFetch flag

export async function fetchLiveNews(): Promise<number> {
  if (newsFetchInProgress) {
    console.log("[newsFetcher] Already fetching, skipping");
    return 0;
  }
  
  newsFetchInProgress = true;
  console.log("[newsFetcher] Fetching news from RSS feeds...");
  
  const allRawNews: RawNewsItem[] = [];
  
  for (const feed of RSS_FEEDS) {
    try {
      const xml = await httpGet(feed.url);
      const items = feed.parser === "sitemap"
        ? parseSeekingAlphaSitemap(xml)
        : parseRSS(xml, feed.source);
      allRawNews.push(...items);
    } catch (err: any) {
      // Silently skip failed feeds
    }
  }
  
  console.log(`[newsFetcher] Parsed ${allRawNews.length} total items from feeds`);
  
  if (allRawNews.length === 0) {
    newsFetchInProgress = false;
    return 0;
  }
  
  // Filter to items related to our tickers
  const relevant: RawNewsItem[] = [];
  const irrelevant: RawNewsItem[] = [];
  
  for (const item of allRawNews) {
    const ticker = detectTicker(item.title, item.summary);
    if (ticker) {
      relevant.push(item);
    } else {
      irrelevant.push(item);
    }
  }
  
  // Take relevant news first, then pad with general market news
  const toInsert = [...relevant.slice(0, 30), ...irrelevant.slice(0, 10)].slice(0, 35);
  
  if (toInsert.length === 0) {
    console.log("[newsFetcher] No relevant news found");
    newsFetchInProgress = false;
    return 0;
  }
  
  // Get existing news titles for deduplication
  const existingNews = storage.getAllNews();
  const existingTitles = new Set(existingNews.map(n => n.title.toLowerCase().substring(0, 60)));
  
  let added = 0;
  const now = new Date();
  
  for (const item of toInsert) {
    const titleKey = item.title.toLowerCase().substring(0, 60);
    if (existingTitles.has(titleKey)) continue;
    
    const ticker = detectTicker(item.title, item.summary);
    const sentiment = detectSentiment(item.title, item.summary);
    
    // Store ISO timestamp for proper sorting; frontend converts to relative display
    let timestamp: string;
    if (item.pubDate) {
      const pubDate = new Date(item.pubDate);
      timestamp = isNaN(pubDate.getTime()) ? now.toISOString() : pubDate.toISOString();
    } else {
      timestamp = now.toISOString();
    }
    
    try {
      const newsData: InsertNews = {
        title: item.title.substring(0, 200),
        summary: item.summary || item.title,
        source: item.source,
        url: item.url || null,
        relatedTicker: ticker,
        timestamp,
        sentiment,
      };
      
      storage.addNews(newsData);
      existingTitles.add(titleKey);
      added++;

      // Auto-send to Discord #news-feed (persistent tracking prevents re-sends)
      const newsKey = newsData.title.toLowerCase().substring(0, 80);
      if (!sentNewsIds.has(newsKey)) {
        sentNewsIds.add(newsKey);
        sendNewsToDiscord({
          title: newsData.title,
          summary: newsData.summary || "",
          source: newsData.source || "Unknown",
          url: newsData.url || "",
          ticker: ticker || "MARKET",
          sentiment: sentiment || "neutral",
          timestamp,
        }).catch(() => {});
      }
    } catch (err: any) {
      // Ignore duplicate errors
    }
  }
  
  // Prune old news - keep latest 50
  pruneOldNews(50);
  
  // Save persistent tracking
  saveSentNewsIds(sentNewsIds);

  lastNewsFetchTime = new Date();
  console.log(`[newsFetcher] Added ${added} new items (${storage.getAllNews().length} total)`);
  
  newsFetchInProgress = false;
  return added;
}

function pruneOldNews(maxItems: number) {
  const allNews = storage.getAllNews();
  if (allNews.length > maxItems) {
    // Sort by id descending (newest first), remove old ones
    const sorted = allNews.sort((a, b) => b.id - a.id);
    const toRemove = sorted.slice(maxItems);
    for (const item of toRemove) {
      storage.deleteNews(item.id);
    }
  }
}

export function getLastNewsFetchTime(): Date | null {
  return lastNewsFetchTime;
}

let newsInterval: NodeJS.Timeout | null = null;

export function startNewsRefresh(intervalMs = 120000) {
  if (newsInterval) clearInterval(newsInterval);
  
  console.log(`[newsFetcher] Starting news refresh every ${intervalMs / 1000}s`);
  
  // Initial fetch after a short delay
  setTimeout(() => {
    fetchLiveNews().catch(console.error);
  }, 8000);
  
  // Then refresh at interval
  newsInterval = setInterval(() => {
    fetchLiveNews().catch(console.error);
  }, intervalMs);
}

export function stopNewsRefresh() {
  if (newsInterval) {
    clearInterval(newsInterval);
    newsInterval = null;
  }
}
