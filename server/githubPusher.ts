/**
 * githubPusher.ts
 * Pushes options key levels (Gamma Flip, Max Pain, Call Wall, Put Wall)
 * for all 22 tickers to the Pine Seeds repo every 5 minutes.
 *
 * Pine Seeds format: YYYYMMDDT,open,high,low,close,volume (NO headers)
 * Mapping: open=gammaFlip, high=maxPain, low=putWall, close=callWall, volume=0
 *
 * TradingView reads via: request.seed("seed_rikoinvestfg-collab_optionflow", sym, open)
 */

import https from "https";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const PINE_SEEDS_REPO = "rikoinvestfg-collab/seed_rikoinvestfg-collab_optionflow";
const PUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const TICKERS = [
  "TSLA","MSFT","NVDA","AAPL","AMD","NFLX","GOOG","AMZN","PLTR","AVGO",
  "MU","META","ORCL","SPX","QQQ","DIA","IWM","SPY","SOXL","USO","SLV","GLD"
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function githubRequest(method: string, path: string, body?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: "api.github.com",
      path,
      method,
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "Accept":        "application/vnd.github.v3+json",
        "User-Agent":    "OptionFlow-Dashboard/1.0",
        "Content-Type":  "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getFileSHA(repo: string, filePath: string): Promise<string | undefined> {
  try {
    const res = await githubRequest("GET", `/repos/${repo}/contents/${filePath}`);
    return res?.sha;
  } catch {
    return undefined;
  }
}

/**
 * Push to Pine Seeds repo in OHLCV format (no headers).
 * open=gammaFlip, high=maxPain, low=putWall, close=callWall, volume=0
 */
async function pushPineSeedsCSV(ticker: string, levels: {
  gammaFlip: number;
  maxPain:   number;
  callWall:  number;
  putWall:   number;
}): Promise<void> {
  const now = new Date();
  const ymd = now.toISOString().slice(0,10).replace(/-/g, "") + "T";

  // Pine Seeds OHLCV format: date,open,high,low,close,volume
  // NO headers, sorted ascending by date
  const csv = `${ymd},${levels.gammaFlip},${levels.maxPain},${levels.putWall},${levels.callWall},0\n`;
  const content = Buffer.from(csv).toString("base64");
  const sha = await getFileSHA(PINE_SEEDS_REPO, `data/${ticker}.csv`);

  await githubRequest("PUT", `/repos/${PINE_SEEDS_REPO}/contents/data/${ticker}.csv`, {
    message: `${ticker} levels ${now.toISOString().slice(0,16)}`,
    content,
    ...(sha ? { sha } : {}),
  });
}

// ── Main push logic ──────────────────────────────────────────────────────────

let storage: any = null;

export function initGithubPusher(storageInstance: any) {
  storage = storageInstance;
  console.log("[githubPusher] Starting auto-push to GitHub every 5 minutes");
  pushAllTickers(); // immediate first run
  setInterval(pushAllTickers, PUSH_INTERVAL_MS);
}

async function pushAllTickers() {
  if (!storage) return;
  console.log("[githubPusher] Pushing key levels to GitHub (Pine Seeds)...");

  let pushed = 0;
  for (const ticker of TICKERS) {
    try {
      const allTickers = storage.getAllTickers();
      const tickerData = allTickers.find((t: any) => t.symbol === ticker);

      // Use the dashboard's key levels data directly
      let levels: { gammaFlip: number; maxPain: number; callWall: number; putWall: number };

      if (tickerData && tickerData.gammaFlip) {
        levels = {
          gammaFlip: parseLevel(tickerData.gammaFlip),
          maxPain:   parseLevel(tickerData.maxPain),
          callWall:  parseLevel(tickerData.callWall),
          putWall:   parseLevel(tickerData.putWall),
        };
      } else {
        levels = deriveDefaultLevels(ticker);
      }

      await pushPineSeedsCSV(ticker, levels);
      pushed++;
    } catch (err: any) {
      console.error(`[githubPusher] Error pushing ${ticker}:`, err.message?.substring(0, 100));
    }
  }

  console.log(`[githubPusher] Pushed ${pushed}/22 tickers to Pine Seeds repo`);
}

function parseLevel(val: any): number {
  if (!val) return 0;
  const s = String(val).replace(/[$,]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n);
}

// Default levels per ticker (used when no live data available)
const DEFAULT_LEVELS: Record<string, [number,number,number,number]> = {
  // [gammaFlip, maxPain, callWall, putWall]
  TSLA:  [256, 255, 270, 250], MSFT:  [386, 385, 395, 380],
  NVDA:  [106, 105, 112, 100], AAPL:  [201, 200, 210, 195],
  AMD:   [101, 100, 110,  95], NFLX:  [921, 920, 940, 910],
  GOOG:  [156, 155, 165, 150], AMZN:  [181, 180, 190, 175],
  PLTR:  [ 88,  88,  95,  85], AVGO:  [171, 170, 180, 165],
  MU:    [ 91,  90, 100,  88], META:  [541, 540, 560, 530],
  ORCL:  [151, 150, 160, 145], SPX:   [5202,5200,5300,5150],
  QQQ:   [436, 435, 445, 430], DIA:   [406, 405, 415, 400],
  IWM:   [191, 190, 200, 185], SPY:   [521, 520, 530, 515],
  SOXL:  [ 17,  17,  20,  16], USO:   [ 71,  70,  75,  68],
  SLV:   [ 27,  27,  30,  26], GLD:   [286, 285, 295, 280],
};

function deriveDefaultLevels(ticker: string) {
  const d = DEFAULT_LEVELS[ticker] || [100, 100, 105, 95];
  return { gammaFlip: d[0], maxPain: d[1], callWall: d[2], putWall: d[3] };
}

// ── Push levels + AI signal (called by agentAnalyzer) ────────────────────────
export async function pushLevelsWithSignal(ticker: string, levels: {
  gammaFlip: number; maxPain: number; callWall: number; putWall: number;
  signal: string; confidence: number;
}): Promise<void> {
  // Push to Pine Seeds in OHLCV format
  try {
    await pushPineSeedsCSV(ticker, levels);
  } catch (err: any) {
    console.error(`[githubPusher] pushLevelsWithSignal error for ${ticker}:`, err.message?.substring(0, 100));
  }
}
