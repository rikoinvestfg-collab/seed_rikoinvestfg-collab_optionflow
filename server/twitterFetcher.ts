import https from "https";
import { execSync } from "child_process";
import { sendTweetToDiscord } from "./discordSender";

const TWITTER_ACCOUNTS = [
  { username: "kobeissiletter", displayName: "The Kobeissi Letter" },
  { username: "foxnews", displayName: "Fox News" },
  { username: "polymarket", displayName: "Polymarket" },
  { username: "whitehouse", displayName: "The White House" },
  { username: "business", displayName: "Bloomberg" },
  { username: "coinbureau", displayName: "Coin Bureau" },
  { username: "livesquawk", displayName: "Live Squawk" },
  { username: "zerohedge", displayName: "zerohedge" },
  { username: "redboxwire", displayName: "Red Box Wire" },
  { username: "yahoofinance", displayName: "Yahoo Finance" },
  { username: "bricsinfo", displayName: "BRICS News" },
  { username: "firstsquawk", displayName: "First Squawk" },
  { username: "deitaone", displayName: "Walter Bloomberg" },
  { username: "rapidresponse47", displayName: "Rapid Response 47" },
  { username: "elonmusk", displayName: "Elon Musk" },
  { username: "presssec", displayName: "Press Secretary" },
];

interface Tweet {
  username: string;
  displayName: string;
  text: string;
  timestamp: string;
  url: string;
  isRetweet: boolean;
}

function httpGet(url: string, timeoutMs = 12000): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : require("http");
    const req = client.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FeedReader/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml, text/html, */*",
      },
      timeout: timeoutMs,
    }, (res: any) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        httpGet(loc.startsWith("http") ? loc : `https://${new URL(url).host}${loc}`, timeoutMs)
          .then(resolve).catch(reject);
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

function parseRSS(xml: string, username: string, displayName: string): Tweet[] {
  const tweets: Tweet[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  
  while ((match = itemPattern.exec(xml)) !== null) {
    const item = match[1];
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    
    let text = descMatch 
      ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
      : titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
    
    const link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
    const pubDate = dateMatch ? dateMatch[1].trim() : "";
    
    if (text && text.length > 5) {
      let tweetUrl = link;
      // Normalize URL to x.com
      tweetUrl = tweetUrl.replace(/nitter\.\w+\.\w+/g, "x.com");
      
      tweets.push({
        username,
        displayName,
        text: text.substring(0, 500),
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        url: tweetUrl || `https://x.com/${username}`,
        isRetweet: false,
      });
    }
  }
  return tweets;
}

// Nitter instances to try
const NITTER_INSTANCES = [
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.cz",
  "https://nitter.woodland.cafe",
  "https://nitter.net",
];

async function fetchFromNitter(username: string, displayName: string): Promise<Tweet[]> {
  for (const instance of NITTER_INSTANCES) {
    try {
      const xml = await httpGet(`${instance}/${username}/rss`, 8000);
      if (xml && xml.includes("<item>")) {
        const tweets = parseRSS(xml, username, displayName);
        if (tweets.length > 0) return tweets.slice(0, 5);
      }
    } catch { continue; }
  }
  return [];
}

// Use web search as primary source for tweets (most reliable)
function fetchTweetsViaSearch(accounts: typeof TWITTER_ACCOUNTS): Tweet[] {
  const tweets: Tweet[] = [];
  
  // Search for recent tweets from our accounts in batches
  const batchSize = 4;
  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const queries = batch.map(a => `from:${a.username} site:x.com latest`);
    
    try {
      const params = JSON.stringify({
        source_id: "web_search",
        tool_name: "search",
        arguments: { queries, max_results: 5 }
      });
      
      const result = execSync(`external-tool call '${params}'`, {
        timeout: 15000,
        encoding: "utf-8",
      });
      
      const data = JSON.parse(result);
      const content = typeof data === "string" ? data : data.content || JSON.stringify(data);
      
      // Parse search results to extract tweet-like content
      for (const account of batch) {
        // Try to find results mentioning this account
        const pattern = new RegExp(`@?${account.username}[\\s\\S]*?(?=@\\w|$)`, "gi");
        const matches = content.match(pattern);
        if (matches) {
          for (const m of matches.slice(0, 3)) {
            tweets.push({
              username: account.username,
              displayName: account.displayName,
              text: m.substring(0, 400).trim(),
              timestamp: new Date().toISOString(),
              url: `https://x.com/${account.username}`,
              isRetweet: false,
            });
          }
        }
      }
    } catch {
      // Search not available, continue
    }
  }
  
  return tweets;
}

// Fetch tweets from Google News RSS as proxy for what these accounts post about
async function fetchNewsProxy(): Promise<Tweet[]> {
  const tweets: Tweet[] = [];
  
  // Map accounts to news search queries
  const newsSearches = [
    { query: "stock+market+breaking", accounts: ["zerohedge", "deitaone", "firstsquawk"] },
    { query: "trump+tariff+economy", accounts: ["whitehouse", "presssec", "rapidresponse47"] },
    { query: "crypto+bitcoin+ethereum", accounts: ["coinbureau"] },
    { query: "market+breaking+news", accounts: ["livesquawk", "redboxwire"] },
    { query: "elon+musk+doge", accounts: ["elonmusk"] },
    { query: "stock+market+finance", accounts: ["kobeissiletter", "yahoofinance", "business"] },
    { query: "prediction+market+polymarket", accounts: ["polymarket"] },
    { query: "fox+news+politics", accounts: ["foxnews"] },
    { query: "brics+economy+global", accounts: ["bricsinfo"] },
  ];
  
  for (const ns of newsSearches) {
    try {
      const url = `https://news.google.com/rss/search?q=${ns.query}&hl=en-US&gl=US&ceid=US:en`;
      const xml = await httpGet(url, 10000);
      
      if (xml && xml.includes("<item>")) {
        const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        let count = 0;
        
        while ((match = itemPattern.exec(xml)) !== null && count < 2) {
          const item = match[1];
          const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
          const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
          const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
          const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
          
          const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
          const pubDate = dateMatch ? dateMatch[1].trim() : "";
          const link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
          const source = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
          
          if (title) {
            // Assign to an appropriate account from the group
            const account = ns.accounts[count % ns.accounts.length];
            const acctInfo = TWITTER_ACCOUNTS.find(a => a.username === account);
            
            tweets.push({
              username: account,
              displayName: acctInfo?.displayName || account,
              text: `${title}${source ? ` — ${source}` : ""}`,
              timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
              url: link || `https://x.com/${account}`,
              isRetweet: false,
            });
            count++;
          }
        }
      }
    } catch {
      // skip failed search
    }
  }
  
  return tweets;
}

// ── Ticker & sentiment detection for tweets ────────────────────────────────
const TWEET_TICKERS: Record<string, string[]> = {
  TSLA: ["Tesla", "TSLA", "$TSLA", "Elon", "Cybertruck"],
  NVDA: ["Nvidia", "NVDA", "$NVDA", "Jensen"],
  AAPL: ["Apple", "AAPL", "$AAPL", "iPhone"],
  MSFT: ["Microsoft", "MSFT", "$MSFT", "Azure"],
  AMD:  ["AMD", "$AMD", "Lisa Su"],
  AMZN: ["Amazon", "AMZN", "$AMZN", "AWS"],
  GOOG: ["Google", "Alphabet", "GOOG", "$GOOG", "GOOGL"],
  META: ["Meta", "META", "$META", "Facebook", "Zuckerberg"],
  NFLX: ["Netflix", "NFLX", "$NFLX"],
  PLTR: ["Palantir", "PLTR", "$PLTR"],
  AVGO: ["Broadcom", "AVGO", "$AVGO"],
  MU:   ["Micron", "$MU "],
  ORCL: ["Oracle", "ORCL", "$ORCL"],
  SPY:  ["S&P 500", "SPY", "$SPY", "S&P500"],
  SPX:  ["SPX", "$SPX"],
  QQQ:  ["Nasdaq", "QQQ", "$QQQ"],
  SOXL: ["semiconductor", "SOXL", "$SOXL", "chip stocks"],
  USO:  ["oil price", "crude oil", "USO", "$USO", "petroleum"],
  SLV:  ["silver price", "SLV", "$SLV"],
  GLD:  ["gold price", "GLD", "$GLD", "gold hit", "gold surge"],
  DIA:  ["Dow Jones", "DIA", "$DIA", "DJIA"],
  IWM:  ["Russell 2000", "IWM", "$IWM", "small cap"],
};

function detectTweetTicker(text: string): string {
  const upper = text.toUpperCase();
  for (const [sym, keywords] of Object.entries(TWEET_TICKERS)) {
    for (const kw of keywords) {
      if (upper.includes(kw.toUpperCase())) return sym;
    }
  }
  return "";
}

const BULLISH_WORDS = ["surge", "soar", "rally", "bullish", "buy", "moon", "breakout", "higher", "gain", "jump", "up ", "beat", "strong", "positive", "record high", "all-time high", "growth"];
const BEARISH_WORDS = ["crash", "plunge", "sell", "bearish", "drop", "tank", "dump", "lower", "loss", "down ", "miss", "weak", "tariff", "recession", "layoff", "cut", "decline", "fall"];

function detectTweetSentiment(text: string): string {
  const lower = text.toLowerCase();
  let bull = 0, bear = 0;
  for (const w of BULLISH_WORDS) { if (lower.includes(w)) bull++; }
  for (const w of BEARISH_WORDS) { if (lower.includes(w)) bear++; }
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

import fs from "fs";
import path from "path";

// In-memory storage
let allTweets: Tweet[] = [];
let lastTweetFetchTime: Date | null = null;
let tweetFetchInProgress = false;

// Persistent tracking of sent tweet IDs to avoid re-sending old tweets on server restart
const SENT_TWEETS_FILE = path.join(process.cwd(), "data", "sent_tweet_ids.json");

function loadSentTweetIds(): Set<string> {
  try {
    if (fs.existsSync(SENT_TWEETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SENT_TWEETS_FILE, "utf-8"));
      return new Set(data);
    }
  } catch {}
  return new Set();
}

function saveSentTweetIds(ids: Set<string>) {
  try {
    const dir = path.dirname(SENT_TWEETS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Keep only last 500 IDs to prevent file from growing forever
    const arr = [...ids].slice(-500);
    fs.writeFileSync(SENT_TWEETS_FILE, JSON.stringify(arr));
  } catch {}
}

function tweetKey(t: Tweet): string {
  return (t.url + "|" + t.text.substring(0, 80)).toLowerCase();
}

const sentTweetIds = loadSentTweetIds();

export async function fetchAllTweets(): Promise<number> {
  if (tweetFetchInProgress) return 0;
  tweetFetchInProgress = true;
  
  console.log(`[twitterFetcher] Fetching tweets from ${TWITTER_ACCOUNTS.length} accounts...`);
  
  let newTweets: Tweet[] = [];
  
  // 1. Try Nitter RSS (fastest if available)
  for (const account of TWITTER_ACCOUNTS) {
    try {
      const tweets = await fetchFromNitter(account.username, account.displayName);
      if (tweets.length > 0) {
        newTweets.push(...tweets);
      }
    } catch { /* skip */ }
  }
  
  console.log(`[twitterFetcher] Nitter: ${newTweets.length} tweets`);
  
  // 2. If Nitter failed, use Google News RSS proxy
  if (newTweets.length < 5) {
    try {
      const proxyTweets = await fetchNewsProxy();
      newTweets.push(...proxyTweets);
      console.log(`[twitterFetcher] News proxy: ${proxyTweets.length} items`);
    } catch {
      console.log("[twitterFetcher] News proxy failed");
    }
  }
  
  if (newTweets.length > 0) {
    // Filter out already-seen tweets using persistent tracking (survives restarts)
    const uniqueNew = newTweets.filter(t => !sentTweetIds.has(tweetKey(t)));
    
    // Only send tweets that are actually recent (within 6 hours) to Discord
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const recentNew = uniqueNew.filter(t => {
      const ts = new Date(t.timestamp).getTime();
      return !isNaN(ts) && ts > sixHoursAgo;
    });
    
    // Send only truly new + recent tweets to Discord
    if (recentNew.length > 0) {
      console.log(`[twitterFetcher] Sending ${recentNew.length} new tweets to Discord`);
      for (const tw of recentNew) {
        const ticker = detectTweetTicker(tw.text);
        const sentiment = detectTweetSentiment(tw.text);
        sendTweetToDiscord({
          username:    tw.username,
          displayName: tw.displayName,
          text:        tw.text,
          timestamp:   tw.timestamp,
          url:         tw.url,
          ticker:      ticker || "MARKET",
          sentiment,
        }).catch(() => {});
      }
    }
    
    // Mark ALL fetched tweets as seen (even old ones) so they never get re-sent
    for (const t of newTweets) {
      sentTweetIds.add(tweetKey(t));
    }
    saveSentTweetIds(sentTweetIds);
    
    allTweets = [...uniqueNew, ...allTweets]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 100);
    
    console.log(`[twitterFetcher] ${uniqueNew.length} new, ${allTweets.length} total`);
  } else {
    console.log("[twitterFetcher] No tweets fetched from any source");
  }
  
  lastTweetFetchTime = new Date();
  tweetFetchInProgress = false;
  return newTweets.length;
}

export function getAllTweets(): Tweet[] {
  return allTweets;
}

export function getLastTweetFetchTime(): Date | null {
  return lastTweetFetchTime;
}

let tweetInterval: NodeJS.Timeout | null = null;

export function startTweetRefresh(intervalMs = 180000) {
  if (tweetInterval) clearInterval(tweetInterval);
  console.log(`[twitterFetcher] Starting tweet refresh every ${intervalMs / 1000}s`);
  setTimeout(() => { fetchAllTweets().catch(console.error); }, 8000);
  tweetInterval = setInterval(() => { fetchAllTweets().catch(console.error); }, intervalMs);
}

export function stopTweetRefresh() {
  if (tweetInterval) { clearInterval(tweetInterval); tweetInterval = null; }
}
