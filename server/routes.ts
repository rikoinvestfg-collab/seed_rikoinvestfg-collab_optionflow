import type { Express } from "express";
import type { Server } from "http";
import { execSync } from "child_process";
import { storage } from "./storage";
import { fetchLiveQuotes, getLastUpdateTime, startLiveDataRefresh } from "./liveData";
import { fetchLiveNews, getLastNewsFetchTime, startNewsRefresh } from "./newsFetcher";
import { fetchMacroCalendar, getLastMacroFetchTime, startMacroRefresh } from "./macroFetcher";
import { fetchLiveEarnings, getLastEarningsFetchTime, startEarningsRefresh } from "./earningsFetcher";
import { fetchOptionsFlow, getLastFlowFetchTime, startOptionsFlowRefresh } from "./optionsFlowFetcher";
import { getAllTweets, getLastTweetFetchTime, startTweetRefresh, fetchAllTweets } from "./twitterFetcher";
import { initGithubPusher } from "./githubPusher";
import { initAgent } from "./agentAnalyzer";
import { initMacroVerifier } from "./macroVerifier";
import { fetchHistoricalOHLCV, getValidIntervals } from "./historicalData";
import { startInstitutionalRefresh, getInstitutionalFlow, getDarkPoolPrints, getTickerExposures, getLastInstitutionalFetchTime } from "./institutionalFetcher";
import { initFlowIntelligence, getFlowIntelReports, getLastIntelTime } from "./flowIntelligence";
import { registerClub5amRoutes } from "./club5am";
import { startCboeRefresh, fetchCboeGexData, getLastCboeFetchTime } from "./cboeFetcher";

export function registerRoutes(server: Server, app: Express) {
  // Start all auto-refresh cycles
  startLiveDataRefresh(60000);       // quotes every 60s
  startNewsRefresh(120000);           // news every 2 minutes
  startMacroRefresh(120000);          // macro every 2 minutes — more real-time
  startEarningsRefresh(600000);       // earnings every 10 minutes
  startOptionsFlowRefresh(120000);    // options flow every 2 minutes
  startTweetRefresh(180000);          // tweets every 3 minutes
  initGithubPusher(storage);          // push key levels to GitHub every 5 minutes
  initAgent(storage);                  // AI signal agent every 30 seconds
  initMacroVerifier(storage);          // macro data auto-verifier every 60 seconds
  startInstitutionalRefresh(120000);    // institutional/dark pool every 2 minutes
  initFlowIntelligence();                // Flow Intelligence AI engine every 60 seconds
  startCboeRefresh(300000);               // CBOE free GEX key levels every 5 min
  registerClub5amRoutes(app);             // Club 5 AM mentor chat + wisdom cards

  app.get("/api/tickers", (_req, res) => {
    const data = storage.getAllTickers();
    res.json(data);
  });

  app.get("/api/tickers/:symbol", (req, res) => {
    const ticker = storage.getTickerBySymbol(req.params.symbol.toUpperCase());
    if (!ticker) return res.status(404).json({ error: "Ticker not found" });
    res.json(ticker);
  });

  app.get("/api/news", (_req, res) => {
    const data = storage.getAllNews();
    // Sort by timestamp descending (most recent first); fallback to id sort
    data.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (!isNaN(ta) && !isNaN(tb)) return tb - ta;
      return b.id - a.id;
    });
    res.json(data);
  });

  app.get("/api/earnings", (_req, res) => {
    res.json(storage.getAllEarnings());
  });

  app.get("/api/earnings/:symbol", (req, res) => {
    res.json(storage.getEarningsBySymbol(req.params.symbol.toUpperCase()));
  });

  app.get("/api/macro", (_req, res) => {
    // No cache — macro actuals update in real-time when data releases
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.json(storage.getAllMacroEvents());
  });

  app.get("/api/options-flow", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    const data = storage.getAllOptionsFlow();
    data.sort((a, b) => b.id - a.id);
    res.json(data);
  });

  // Twitter/X feed endpoint
  app.get("/api/tweets", (_req, res) => {
    const tweets = getAllTweets();
    res.json(tweets);
  });

  // ─── Institutional Flow / Dark Pool / Exposure ────────────────────────────────

  app.get("/api/institutional-flow", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.json(getInstitutionalFlow());
  });

  app.get("/api/dark-pool", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.json(getDarkPoolPrints());
  });

  app.get("/api/exposure", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.json(getTickerExposures());
  });

  // CBOE GEX — status + manual trigger (same URL kept for backward compat)
  app.get("/api/option-whales/status", (_req, res) => {
    const tickers = storage.getAllTickers();
    const withLevels = tickers.filter((t) => t.gammaFlip || t.netGex);
    res.json({
      source: "CBOE Free Options Chain (calculated)",
      lastFetch: getLastCboeFetchTime()?.toISOString() || null,
      tickersWithLevels: withLevels.length,
      sample: withLevels.slice(0, 5).map((t) => ({
        symbol: t.symbol,
        gammaFlip: t.gammaFlip,
        maxPain: t.maxPain,
        callWall: t.callWall,
        putWall: t.putWall,
        gammaRegime: t.gammaRegime,
        netGex: t.netGex,
        atmIv: t.atmIv,
      })),
    });
  });

  app.post("/api/option-whales/refresh", async (_req, res) => {
    try {
      const ok = await fetchCboeGexData();
      res.json({ success: ok, lastFetch: getLastCboeFetchTime()?.toISOString() || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Flow Intelligence
  app.get("/api/flow-intelligence", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.json({
      reports: getFlowIntelReports(),
      lastAnalysis: getLastIntelTime()?.toISOString() || null,
    });
  });

  // Status
  app.get("/api/status", (_req, res) => {
    res.json({
      live: true,
      lastUpdate: getLastUpdateTime()?.toISOString() || null,
      lastNewsUpdate: getLastNewsFetchTime()?.toISOString() || null,
      lastMacroUpdate: getLastMacroFetchTime()?.toISOString() || null,
      lastEarningsUpdate: getLastEarningsFetchTime()?.toISOString() || null,
      lastFlowUpdate: getLastFlowFetchTime()?.toISOString() || null,
      lastTweetUpdate: getLastTweetFetchTime()?.toISOString() || null,
      lastOptionWhalesUpdate: getLastCboeFetchTime()?.toISOString() || null,
      tickerCount: storage.getAllTickers().length,
      newsCount: storage.getAllNews().length,
      macroCount: storage.getAllMacroEvents().length,
      earningsCount: storage.getAllEarnings().length,
      flowCount: storage.getAllOptionsFlow().length,
      tweetCount: getAllTweets().length,
    });
  });

  // News filtered by ticker
  app.get("/api/news/:ticker", (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const all = storage.getAllNews();
    const filtered = all
      .filter((n) => {
        if (n.relatedTicker && n.relatedTicker.toUpperCase().includes(ticker)) return true;
        if (n.title.toUpperCase().includes(ticker)) return true;
        if (n.summary && n.summary.toUpperCase().includes(ticker)) return true;
        return false;
      })
      .sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        if (!isNaN(ta) && !isNaN(tb)) return tb - ta;
        return b.id - a.id;
      })
      .slice(0, 20);
    res.json(filtered);
  });

  // 7-day news sentiment summary for a ticker
  app.get("/api/news-sentiment/:ticker", (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const all = storage.getAllNews();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const filtered = all.filter((n) => {
      const matchesTicker =
        (n.relatedTicker && n.relatedTicker.toUpperCase().includes(ticker)) ||
        n.title.toUpperCase().includes(ticker) ||
        (n.summary && n.summary.toUpperCase().includes(ticker));
      if (!matchesTicker) return false;
      const ts = new Date(n.timestamp).getTime();
      return !isNaN(ts) ? ts >= sevenDaysAgo : true;
    });
    let bullish = 0, bearish = 0, neutral = 0;
    for (const n of filtered) {
      if (n.sentiment === "bullish") bullish++;
      else if (n.sentiment === "bearish") bearish++;
      else neutral++;
    }
    const total = bullish + bearish + neutral;
    res.json({
      ticker,
      period: "7d",
      total,
      bullish,
      bearish,
      neutral,
      ratio: total > 0 ? +(bullish / Math.max(bearish, 1)).toFixed(2) : 0,
      bias: bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral",
    });
  });

  // AI Whale Report for a ticker
  app.post("/api/ai-report", async (req, res) => {
    const { ticker } = req.body as { ticker: string };
    if (!ticker) return res.status(400).json({ error: "ticker required" });
    const sym = ticker.toUpperCase();

    try {
      // Get ticker data
      const tickerData = storage.getTickerBySymbol(sym);
      const news = storage.getAllNews()
        .filter(n => (n.relatedTicker || "").includes(sym) || n.title.includes(sym))
        .slice(0, 5);
      const earnings = storage.getEarningsBySymbol(sym).slice(0, 4);
      const flow = storage.getAllOptionsFlow()
        .filter(f => f.symbol === sym)
        .slice(0, 5);

      // Get macro snapshot for context
      let macroContext = "";
      try {
        const params = JSON.stringify({
          source_id: "finance",
          tool_name: "finance_macro_snapshot",
          arguments: { countries: ["United States"], keywords: ["interest rate", "CPI", "GDP Growth Rate"], action: "Macro context for AI report" }
        });
        const result = execSync(`external-tool call '${params}'`, { encoding: "utf-8", timeout: 20000 });
        const parsed = JSON.parse(result);
        macroContext = (parsed.content || "").substring(0, 500);
      } catch {}

      const price = tickerData?.price || 0;
      const changePercent = tickerData?.changePercent || 0;
      const gammaFlip = tickerData?.gammaFlip || "N/A";
      const maxPain = tickerData?.maxPain || "N/A";
      const callWall = tickerData?.callWall || "N/A";
      const putWall = tickerData?.putWall || "N/A";
      const atmIv = tickerData?.atmIv || "N/A";
      const pe = tickerData?.pe || "N/A";
      const eps = tickerData?.eps || "N/A";
      const marketCap = tickerData?.marketCap || 0;

      const flowSummary = flow.map(f => {
        try { const vd = JSON.parse(f.volume || "{}"); return `${f.symbol} ${vd.callPut||""} ${vd.direction||""} ${f.premium||""}`; }
        catch { return f.details || ""; }
      }).join("; ");

      const newsSummary = news.map(n => `${n.title} (${n.sentiment || "neutral"})`).join(" | ");
      const earningsSummary = earnings.map(e => `${e.period}: EPS ${e.actualEps ?? "?"} vs est ${e.estimatedEps ?? "?"} (${e.surprise || ""})`);

      const bullCase = generateBullCase(sym, price, changePercent, callWall, gammaFlip, news);
      const bearCase = generateBearCase(sym, price, changePercent, putWall, gammaFlip, news);
      const recommendation = changePercent > 1.5 ? "BUY" : changePercent < -1.5 ? "SELL" : "HOLD";
      const confidence = Math.round(60 + Math.abs(changePercent) * 5);

      const report = {
        ticker: sym,
        generatedAt: new Date().toISOString(),
        price,
        changePercent,
        sections: {
          optionFlow: {
            title: "Option Flow Interpretation",
            content: flow.length > 0
              ? `${flow.length} unusual flow signals detected for ${sym}. ${flowSummary}. The dominant flow is ${flow[0]?.sentiment || "mixed"}, suggesting institutional positioning.`
              : `No significant option flow detected for ${sym} in current session.`,
          },
          abnormalFlow: {
            title: "Abnormal Flow Analysis",
            content: flow.filter(f => f.signal === "sweep" || f.signal === "burst").length > 0
              ? `Detected ${flow.filter(f => f.signal === "sweep").length} sweeps and ${flow.filter(f => f.signal === "burst").length} bursts — statistically above ${sym}'s normal daily volume baseline. This suggests urgency and directional conviction.`
              : `Flow patterns for ${sym} are within normal statistical range. No statistically abnormal sweeps or bursts detected.`,
          },
          marketStructure: {
            title: "Market Structure",
            content: `Key levels: Gamma Flip at ${gammaFlip} (regime boundary), Max Pain at ${maxPain} (expiry magnet), Call Wall at ${callWall} (resistance), Put Wall at ${putWall} (support). ATM IV: ${atmIv}. Current price $${price.toFixed(2)} is ${price > parseFloat((gammaFlip||"0").replace(/[$,]/g,"")) ? "above" : "below"} the Gamma Flip — implying ${price > parseFloat((gammaFlip||"0").replace(/[$,]/g,"")) ? "positive" : "negative"} gamma environment.`,
          },
          marketData: {
            title: "Market Data",
            price,
            changePercent,
            gammaFlip,
            maxPain,
            callWall,
            putWall,
            atmIv,
            netGex: tickerData?.netGex || "N/A",
            volume: tickerData?.volume || 0,
            dayHigh: tickerData?.dayHigh || 0,
            dayLow: tickerData?.dayLow || 0,
          },
          fundamentals: {
            title: "Fundamentals",
            content: `P/E: ${pe} | EPS: $${eps} | Market Cap: ${marketCap >= 1e12 ? `$${(marketCap/1e12).toFixed(2)}T` : marketCap >= 1e9 ? `$${(marketCap/1e9).toFixed(1)}B` : "N/A"}. ${earningsSummary.length > 0 ? `Recent earnings: ${earningsSummary.slice(0,2).join("; ")}` : "No earnings data available"}.`,
          },
          newsSentiment: {
            title: "News Sentiment",
            score: news.length > 0 ? Math.round(
              (news.filter(n => n.sentiment === "bullish").length / news.length) * 100
            ) : 50,
            bullish: news.filter(n => n.sentiment === "bullish").length,
            bearish: news.filter(n => n.sentiment === "bearish").length,
            neutral: news.filter(n => !n.sentiment || n.sentiment === "neutral").length,
            topHeadlines: news.slice(0, 3).map(n => ({ title: n.title, sentiment: n.sentiment, source: n.source, url: n.url })),
          },
          debate: {
            title: "Bull vs Bear Debate",
            bullCase,
            bearCase,
          },
          risk: {
            title: "Risk Assessment",
            level: Math.abs(changePercent) > 3 ? "HIGH" : Math.abs(changePercent) > 1.5 ? "MEDIUM" : "LOW",
            content: `Volatility: ${atmIv || "unknown"}. ${Math.abs(changePercent) > 3 ? `${sym} is showing high intraday movement (${changePercent.toFixed(2)}%) — elevated risk for 0DTE plays.` : `${sym} movement within normal range. Standard risk parameters apply.`} Key risk: ${changePercent < 0 ? `breakdown below Put Wall ${putWall}` : `rejection at Call Wall ${callWall}`}.`,
          },
          fullReport: {
            title: "Full Report",
            recommendation,
            confidence: Math.min(95, confidence),
            summary: `${sym} at $${price.toFixed(2)} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%). ${recommendation} with ${Math.min(95, confidence)}% confidence. ${bullCase.split(".")[0]}. Key watchpoints: ${callWall} (resistance), ${putWall} (support), ${gammaFlip} (flip level).`,
          },
        },
      };

      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Key levels endpoint for embedded chart
  app.get("/api/levels", (_req, res) => {
    const allTickers = storage.getAllTickers();
    const levels: Record<string, any> = {};
    for (const t of allTickers) {
      levels[t.symbol] = {
        symbol: t.symbol,
        name: t.name,
        price: t.price,
        change: t.change,
        changePercent: t.changePercent,
        gammaFlip: t.gammaFlip ? parseFloat(t.gammaFlip.replace(/[$,]/g, "")) : null,
        maxPain: t.maxPain ? parseFloat(t.maxPain.replace(/[$,]/g, "")) : null,
        callWall: t.callWall ? parseFloat(t.callWall.replace(/[$,]/g, "")) : null,
        putWall: t.putWall ? parseFloat(t.putWall.replace(/[$,]/g, "")) : null,
        gammaRegime: t.gammaRegime,
        atmIv: t.atmIv,
        netGex: t.netGex,
        dayHigh: t.dayHigh,
        dayLow: t.dayLow,
        open: t.open,
        volume: t.volume,
      };
    }
    res.json(levels);
  });

  app.get("/api/levels/:symbol", (req, res) => {
    const sym = req.params.symbol.toUpperCase();
    const t = storage.getTickerBySymbol(sym);
    if (!t) return res.status(404).json({ error: "Ticker not found" });
    res.json({
      symbol: t.symbol,
      name: t.name,
      price: t.price,
      change: t.change,
      changePercent: t.changePercent,
      gammaFlip: t.gammaFlip ? parseFloat(t.gammaFlip.replace(/[$,]/g, "")) : null,
      maxPain: t.maxPain ? parseFloat(t.maxPain.replace(/[$,]/g, "")) : null,
      callWall: t.callWall ? parseFloat(t.callWall.replace(/[$,]/g, "")) : null,
      putWall: t.putWall ? parseFloat(t.putWall.replace(/[$,]/g, "")) : null,
      gammaRegime: t.gammaRegime,
      atmIv: t.atmIv,
      netGex: t.netGex,
      dayHigh: t.dayHigh,
      dayLow: t.dayLow,
      open: t.open,
      volume: t.volume,
    });
  });

  // Historical OHLCV data for embedded chart
  app.get("/api/history/:symbol", async (req, res) => {
    const sym = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "5min";
    try {
      const bars = await fetchHistoricalOHLCV(sym, interval);
      res.json({ symbol: sym, interval, count: bars.length, bars });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/intervals", (_req, res) => {
    res.json(getValidIntervals());
  });

  // TradingView text_area bulk export for Pine Script backup
  app.get("/api/tv-export", (_req, res) => {
    const allTickers = storage.getAllTickers();
    // Format: SYMBOL|GF|MP|CW|PW;SYMBOL|GF|MP|CW|PW;...
    const lines = allTickers.map(t => {
      const gf = t.gammaFlip ? parseFloat(t.gammaFlip.replace(/[$,]/g, "")) : 0;
      const mp = t.maxPain ? parseFloat(t.maxPain.replace(/[$,]/g, "")) : 0;
      const cw = t.callWall ? parseFloat(t.callWall.replace(/[$,]/g, "")) : 0;
      const pw = t.putWall ? parseFloat(t.putWall.replace(/[$,]/g, "")) : 0;
      return `${t.symbol}|${gf}|${mp}|${cw}|${pw}`;
    }).join(";");
    res.json({ data: lines, updatedAt: new Date().toISOString() });
  });

  // Manual refresh
  app.post("/api/refresh", async (_req, res) => {
    try {
      const [quotesOk] = await Promise.all([
        fetchLiveQuotes(),
        fetchLiveNews(),
        fetchOptionsFlow(),
      ]);
      res.json({
        success: quotesOk,
        lastQuoteUpdate: getLastUpdateTime()?.toISOString(),
        lastNewsUpdate: getLastNewsFetchTime()?.toISOString(),
        lastFlowUpdate: getLastFlowFetchTime()?.toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// AI Report helper functions
function generateBullCase(sym: string, price: number, changePercent: number, callWall: string, gammaFlip: string, news: any[]): string {
  const bullNews = news.filter(n => n.sentiment === "bullish");
  const priceStr = `$${price.toFixed(2)}`;
  const cases = [
    `${sym} showing ${changePercent >= 0 ? "positive" : "resilient"} price action at ${priceStr}.`,
    callWall !== "N/A" ? `Call Wall at ${callWall} represents strong resistance that, if breached, could trigger gamma squeeze.` : "",
    gammaFlip !== "N/A" ? `Above Gamma Flip ${gammaFlip} dealers become long gamma and provide price stability.` : "",
    bullNews.length > 0 ? `Bullish catalysts: ${bullNews[0]?.title?.substring(0, 80)}` : "Fundamentals remain intact with institutional support.",
    `0DTE opportunity: CALL sweeps targeting near-the-money strikes for momentum plays.`,
  ].filter(Boolean);
  return cases.join(" ");
}

function generateBearCase(sym: string, price: number, changePercent: number, putWall: string, gammaFlip: string, news: any[]): string {
  const bearNews = news.filter(n => n.sentiment === "bearish");
  const priceStr = `$${price.toFixed(2)}`;
  const cases = [
    `${sym} faces headwinds at current level ${priceStr}.`,
    putWall !== "N/A" ? `Put Wall at ${putWall} is key support — breakdown could accelerate downside.` : "",
    gammaFlip !== "N/A" ? `Below Gamma Flip ${gammaFlip} negative gamma amplifies moves to the downside.` : "",
    bearNews.length > 0 ? `Bearish catalyst: ${bearNews[0]?.title?.substring(0, 80)}` : "Macro headwinds remain as a risk factor.",
    `0DTE risk: PUT sweeps signal institutional hedging or directional bets.`,
  ].filter(Boolean);
  return cases.join(" ");
}
