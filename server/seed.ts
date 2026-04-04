import { storage } from "./storage";

// ── Existing 10 tickers ──
const existingTickers = [
  {
    symbol: "TSLA", name: "Tesla, Inc.", price: 381.26, change: 9.51, changePercent: 2.56,
    marketCap: 1430652218220, volume: 55816862, dayLow: 374.08, dayHigh: 383.14,
    previousClose: 371.75, open: 378.77, pe: 228.30, eps: 1.67,
    gammaFlip: "$358", maxPain: "$375", callWall: "$375", putWall: "$370",
    gammaRegime: "Positive Gamma", atmIv: "41.2%", netGex: "+419M"
  },
  {
    symbol: "MSFT", name: "Microsoft Corporation", price: 369.37, change: -0.80, changePercent: -0.22,
    marketCap: 2742804953100, volume: 28264760, dayLow: 368.20, dayHigh: 373.99,
    previousClose: 370.17, open: 373.16, pe: 23.10, eps: 15.99,
    gammaFlip: "$362", maxPain: "$370", callWall: "$400", putWall: "$350",
    gammaRegime: "Negative Gamma", atmIv: "33.1%", netGex: "-9.5M"
  },
  {
    symbol: "NVDA", name: "NVIDIA Corporation", price: 175.75, change: 1.35, changePercent: 0.77,
    marketCap: 4271603870213, volume: 156552273, dayLow: 174.76, dayHigh: 177.37,
    previousClose: 174.40, open: 176.00, pe: 35.79, eps: 4.91,
    gammaFlip: "$164", maxPain: "$175", callWall: "$180", putWall: "$160",
    gammaRegime: "Positive Gamma", atmIv: "40.0%", netGex: "-77M"
  },
  {
    symbol: "SPX", name: "S&P 500 Index", price: 5611.85, change: 0.00, changePercent: 0.00,
    marketCap: null, volume: null, dayLow: null, dayHigh: null,
    previousClose: null, open: null, pe: null, eps: null,
    gammaFlip: "$5,795", maxPain: "$5,700", callWall: "$7,000", putWall: "$7,000",
    gammaRegime: "Positive Gamma", atmIv: "20.7%", netGex: "-21.8B"
  },
  {
    symbol: "QQQ", name: "Invesco QQQ Trust", price: 584.31, change: 7.13, changePercent: 1.24,
    marketCap: 410232940345, volume: 78627972, dayLow: 580.42, dayHigh: 587.74,
    previousClose: 577.18, open: 581.48, pe: 31.45, eps: 18.58,
    gammaFlip: "$575", maxPain: "$585", callWall: "$600", putWall: "$585",
    gammaRegime: "Positive Gamma", atmIv: "24.8%", netGex: "-145M"
  },
  {
    symbol: "DIA", name: "SPDR Dow Jones ETF", price: 465.48, change: 2.29, changePercent: 0.49,
    marketCap: 37816944161, volume: 7680487, dayLow: 464.50, dayHigh: 467.90,
    previousClose: 463.19, open: 466.00, pe: 22.75, eps: 20.46,
    gammaFlip: "$457", maxPain: "$465", callWall: "$470", putWall: "$450",
    gammaRegime: "Positive Gamma", atmIv: "29.9%", netGex: "+14.1M"
  },
  {
    symbol: "IWM", name: "iShares Russell 2000 ETF", price: 249.56, change: 1.56, changePercent: 0.63,
    marketCap: 72397138883, volume: 47763464, dayLow: 249.11, dayHigh: 252.44,
    previousClose: 248.00, open: 249.92, pe: 18.23, eps: 13.69,
    gammaFlip: "$245", maxPain: "$250", callWall: "$260", putWall: "$240",
    gammaRegime: "Positive Gamma", atmIv: "26.5%", netGex: "-42M"
  },
  {
    symbol: "MU", name: "Micron Technology", price: 367.85, change: 30.01, changePercent: 8.88,
    marketCap: 414835480500, volume: 73934765, dayLow: 343.00, dayHigh: 377.89,
    previousClose: 337.84, open: 348.90, pe: 17.38, eps: 21.17,
    gammaFlip: "$345", maxPain: "$350", callWall: "$380", putWall: "$340",
    gammaRegime: "Negative Gamma", atmIv: "52.3%", netGex: "-28M"
  },
  {
    symbol: "META", name: "Meta Platforms, Inc.", price: 579.23, change: 7.10, changePercent: 1.24,
    marketCap: 1460234757434, volume: 23258579, dayLow: 573.92, dayHigh: 592.55,
    previousClose: 572.13, open: 581.07, pe: 24.66, eps: 23.49,
    gammaFlip: "$565", maxPain: "$580", callWall: "$650", putWall: "$580",
    gammaRegime: "Positive Gamma", atmIv: "35.4%", netGex: "+2.5M"
  },
  {
    symbol: "ORCL", name: "Oracle Corporation", price: 145.28, change: -1.83, changePercent: -1.24,
    marketCap: 417831962880, volume: 20425524, dayLow: 144.67, dayHigh: 149.65,
    previousClose: 147.11, open: 149.09, pe: 26.08, eps: 5.57,
    gammaFlip: "$141", maxPain: "$147", callWall: "$165", putWall: "$140",
    gammaRegime: "Negative Gamma", atmIv: "59.5%", netGex: "-77.3M"
  },
];

// ── 12 new tickers ──
const newTickers = [
  { symbol: "AAPL", name: "Apple Inc.", price: 255.63, change: 1.84, changePercent: 0.73, marketCap: 3757230848943, volume: 35595400, dayLow: 253.33, dayHigh: 256.18, previousClose: 253.79, open: 254.08, pe: 32.32, eps: 7.91, gammaFlip: "$251", maxPain: "$255", callWall: "$255", putWall: "$250", gammaRegime: "Positive Gamma", atmIv: "25.7%", netGex: "+498M" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", price: 655.24, change: 4.90, changePercent: 0.75, marketCap: 654963310495, volume: 95383076, dayLow: 653, dayHigh: 658.52, previousClose: 650.34, open: 653.90, pe: 25.99, eps: 25.21, gammaFlip: "$649", maxPain: "$648", callWall: "$650", putWall: "$645", gammaRegime: "Positive Gamma", atmIv: "21.0%", netGex: "-6.9B" },
  { symbol: "AMD", name: "Advanced Micro Devices", price: 210.21, change: 6.78, changePercent: 3.33, marketCap: 342728486100, volume: 40279250, dayLow: 205.84, dayHigh: 213.83, previousClose: 203.43, open: 207.59, pe: 80.54, eps: 2.61, gammaFlip: "$202", maxPain: "$205", callWall: "$200", putWall: "$200", gammaRegime: "Negative Gamma", atmIv: "51.6%", netGex: "-13.4M" },
  { symbol: "NFLX", name: "Netflix, Inc.", price: 95.55, change: -0.60, changePercent: -0.62, marketCap: 404876245137, volume: 28484038, dayLow: 94.26, dayHigh: 97.20, previousClose: 96.15, open: 96.52, pe: 37.77, eps: 2.53, gammaFlip: "$93", maxPain: "$92", callWall: "$100", putWall: "$90", gammaRegime: "Positive Gamma", atmIv: "34.2%", netGex: "+197.6M" },
  { symbol: "GOOG", name: "Alphabet Inc.", price: 294.90, change: 8.04, changePercent: 2.80, marketCap: 3567405141344, volume: 23001013, dayLow: 289.47, dayHigh: 297.99, previousClose: 286.86, open: 289.98, pe: 27.28, eps: 10.81, gammaFlip: "$295", maxPain: "$285", callWall: "$300", putWall: "$280", gammaRegime: "Negative Gamma", atmIv: "30.6%", netGex: "+102.6M" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", price: 210.57, change: 2.30, changePercent: 1.10, marketCap: 2260452287596, volume: 43846286, dayLow: 208.19, dayHigh: 213.58, previousClose: 208.27, open: 210.44, pe: 29.37, eps: 7.17, gammaFlip: "$200", maxPain: "$202", callWall: "$210", putWall: "$200", gammaRegime: "Positive Gamma", atmIv: "33.2%", netGex: "-117.4M" },
  { symbol: "PLTR", name: "Palantir Technologies", price: 146.49, change: 0.21, changePercent: 0.14, marketCap: 335677440300, volume: 34056743, dayLow: 144.47, dayHigh: 148.30, previousClose: 146.28, open: 147.08, pe: 232.52, eps: 0.63, gammaFlip: "$140", maxPain: "$150", callWall: "$150", putWall: "$140", gammaRegime: "Positive Gamma", atmIv: "50.2%", netGex: "+59.5M" },
  { symbol: "AVGO", name: "Broadcom Inc.", price: 313.49, change: 3.98, changePercent: 1.29, marketCap: 1486341905066, volume: 19093478, dayLow: 310.48, dayHigh: 315.79, previousClose: 309.51, open: 313.37, pe: 61.11, eps: 5.13, gammaFlip: "$312", maxPain: "$310", callWall: "$320", putWall: "$300", gammaRegime: "Negative Gamma", atmIv: "42.6%", netGex: "-31.0M" },
  { symbol: "SOXL", name: "Direxion Semiconductor 3X", price: 52.26, change: 4.35, changePercent: 9.08, marketCap: 15374337992, volume: 117438885, dayLow: 49.62, dayHigh: 54.09, previousClose: 47.91, open: 50.04, pe: 33.39, eps: 1.56, gammaFlip: "$60", maxPain: "$52", callWall: "$60", putWall: "$45", gammaRegime: "Negative Gamma", atmIv: "117.7%", netGex: "+5.1M" },
  { symbol: "USO", name: "United States Oil Fund", price: 124.09, change: -3.15, changePercent: -2.48, marketCap: 14779119372, volume: 44683717, dayLow: 122.48, dayHigh: 125.73, previousClose: 127.25, open: 124.86, pe: 37.55, eps: 3.31, gammaFlip: "$119", maxPain: "$117", callWall: "$130", putWall: "$100", gammaRegime: "Positive Gamma", atmIv: "95.2%", netGex: "+38.0M" },
  { symbol: "SLV", name: "iShares Silver Trust", price: 68.14, change: 0, changePercent: 0, marketCap: 36940490375, volume: 37539791, dayLow: 67.38, dayHigh: 68.91, previousClose: 68.14, open: 67.96, pe: -19.69, eps: -3.46, gammaFlip: "$63", maxPain: "$63", callWall: "$70", putWall: "$63", gammaRegime: "Negative Gamma", atmIv: "68.5%", netGex: "-131.8M" },
  { symbol: "GLD", name: "SPDR Gold Shares", price: 437.82, change: 7.53, changePercent: 1.75, marketCap: 160243592826, volume: 14047456, dayLow: 433.76, dayHigh: 440.19, previousClose: 430.29, open: 435, pe: -46.61, eps: -9.39, gammaFlip: "$409", maxPain: "$413", callWall: "$420", putWall: "$400", gammaRegime: "Negative Gamma", atmIv: "37.1%", netGex: "+946.9M" },
];

// ── Existing 12 news items ──
const existingNews = [
  { title: "MU surges 8.88% on strong memory demand outlook", summary: "Micron Technology jumped nearly 9% after analysts raised price targets citing robust HBM and AI-driven memory demand growth through 2026.", source: "Bloomberg", url: "#", relatedTicker: "MU", timestamp: new Date().toISOString(), sentiment: "bullish" },
  { title: "Tesla rises on Q2 delivery guidance optimism", summary: "TSLA gained 2.56% as investors bet on strong Q2 delivery numbers following China EV subsidy extensions and Cybertruck production ramp.", source: "Reuters", url: "#", relatedTicker: "TSLA", timestamp: new Date(Date.now() - 120000).toISOString(), sentiment: "bullish" },
  { title: "NVIDIA holds above gamma flip at $164, dealers dampening vol", summary: "NVDA trades in positive gamma territory with dealers long gamma, supporting mean-reverting price action between put wall $160 and call wall $180.", source: "FlashAlpha", url: "https://flashalpha.com/stock/nvda", relatedTicker: "NVDA", timestamp: new Date(Date.now() - 240000).toISOString(), sentiment: "neutral" },
  { title: "SPX call wall remains firm at $7,000 — strong resistance", summary: "S&P 500 options positioning shows massive call open interest at $7,000 creating a ceiling. Gamma flip at $5,795 keeps dealers in positive gamma.", source: "FlashAlpha", url: "https://flashalpha.com/stock/spx", relatedTicker: "SPX", timestamp: new Date(Date.now() - 360000).toISOString(), sentiment: "neutral" },
  { title: "QQQ reclaims $584 as tech rebounds", summary: "Invesco QQQ rose 1.24% led by semiconductor and cloud names. Options put wall at $585 providing strong support floor.", source: "MarketWatch", url: "#", relatedTicker: "QQQ", timestamp: new Date(Date.now() - 480000).toISOString(), sentiment: "bullish" },
  { title: "Microsoft dips slightly, negative gamma regime in play", summary: "MSFT slipped 0.22% with dealers in negative gamma below $362 flip level. Options expensive with VRP at +14.0.", source: "Barron's", url: "#", relatedTicker: "MSFT", timestamp: new Date(Date.now() - 600000).toISOString(), sentiment: "bearish" },
  { title: "Oracle drops 1.24% amid cloud spending concerns", summary: "ORCL fell as investors weighed mixed signals on enterprise cloud spending. Negative gamma regime below $141 could amplify further downside moves.", source: "CNBC", url: "#", relatedTicker: "ORCL", timestamp: new Date(Date.now() - 720000).toISOString(), sentiment: "bearish" },
  { title: "META up 1.24%, put wall shifts higher signaling bullish positioning", summary: "Meta gained as OPEX put wall shifted up 20 points. Institutional options flow shows bullish skew with Vanna Magnet at $700.", source: "TacticalDataDesk", url: "#", relatedTicker: "META", timestamp: new Date(Date.now() - 840000).toISOString(), sentiment: "bullish" },
  { title: "IWM finds support at $249 — gamma exposure concentrated at $240 put wall", summary: "Russell 2000 ETF held support near options put wall. Max negative gamma at $240 with $42M in put GEX creating a firm floor.", source: "SpotGamma", url: "#", relatedTicker: "IWM", timestamp: new Date(Date.now() - 960000).toISOString(), sentiment: "neutral" },
  { title: "DIA climbs 0.49%, positive gamma dampening volatility", summary: "Dow Jones ETF trades in positive gamma regime above $457 flip level. Call wall at $470 provides near-term resistance.", source: "MarketWatch", url: "#", relatedTicker: "DIA", timestamp: new Date(Date.now() - 1080000).toISOString(), sentiment: "bullish" },
  { title: "US market sentiment turns UPBEAT — tariff fears ease", summary: "Overall market sentiment shifted to upbeat as trade negotiation progress reduced recession fears. VIX declining supports positive gamma environments.", source: "Reuters", url: "#", relatedTicker: "SPX", timestamp: new Date(Date.now() - 1200000).toISOString(), sentiment: "bullish" },
  { title: "Options flow: HBM demand drives massive call buying in MU", summary: "Unusual options activity detected in Micron with heavy call volume at $380 strike. Analysts see upside to $400+ on AI memory cycle.", source: "Unusual Whales", url: "#", relatedTicker: "MU", timestamp: new Date(Date.now() - 1320000).toISOString(), sentiment: "bullish" },
];

// ── New news items for new tickers ──
const newNews = [
  { title: "Apple rallies ahead of Q2 earnings, iPhone 17 hype builds", summary: "AAPL gained 0.73% as Wall Street anticipates strong Q2 results driven by iPhone 17 pre-order momentum and Services revenue growth. Analysts at Morgan Stanley raised their price target to $280 citing AI integration across the ecosystem. Options positioning shows massive +498M net GEX supporting the rally.", source: "Bloomberg", url: "#", relatedTicker: "AAPL", timestamp: new Date(Date.now() - 180000).toISOString(), sentiment: "bullish" },
  { title: "SPY pushes toward all-time highs on broad market strength", summary: "The SPDR S&P 500 ETF rose 0.75% as breadth improved across sectors. Institutional flows show rotation into cyclicals with the put wall at $645 providing a strong support floor. The ETF is now within striking distance of its February highs as tariff concerns ease.", source: "CNBC", url: "#", relatedTicker: "SPY", timestamp: new Date(Date.now() - 300000).toISOString(), sentiment: "bullish" },
  { title: "AMD surges 3.33% on new MI400 AI accelerator announcement", summary: "Advanced Micro Devices jumped over 3% after unveiling the MI400 series targeting NVIDIA's data center dominance. The new chips offer 40% better performance per watt according to AMD benchmarks. However, the stock remains in negative gamma below $202 which could amplify moves in either direction.", source: "Reuters", url: "#", relatedTicker: "AMD", timestamp: new Date(Date.now() - 420000).toISOString(), sentiment: "bullish" },
  { title: "Netflix dips ahead of Q1 earnings on April 16", summary: "NFLX slipped 0.62% as investors take profits before the upcoming Q1 2026 earnings report. The stock trades in positive gamma with strong support at the $90 put wall. Analysts expect EPS of $0.76 with live sports content driving subscriber growth beyond estimates.", source: "Barron's", url: "#", relatedTicker: "NFLX", timestamp: new Date(Date.now() - 540000).toISOString(), sentiment: "bearish" },
  { title: "Alphabet jumps 2.8% on Gemini AI revenue surprise", summary: "GOOG surged after reports that Google Cloud revenue from Gemini AI products exceeded internal targets by 35% in March. The stock approaches its gamma flip at $295 — a decisive break above could shift dealers into positive gamma territory and dampen volatility. Q1 earnings on April 23 are the next catalyst.", source: "The Information", url: "#", relatedTicker: "GOOG", timestamp: new Date(Date.now() - 660000).toISOString(), sentiment: "bullish" },
  { title: "Amazon climbs 1.1% as AWS backlog hits record $200B", summary: "AMZN gained on reports that AWS committed backlog surpassed $200 billion for the first time, driven by enterprise AI workload migration. The stock sits in positive gamma above the $200 gamma flip with the call wall at $210 acting as near-term resistance. Q1 earnings on April 30 will be key.", source: "MarketWatch", url: "#", relatedTicker: "AMZN", timestamp: new Date(Date.now() - 780000).toISOString(), sentiment: "bullish" },
  { title: "Palantir flat as defense contract pipeline grows quietly", summary: "PLTR held steady at $146.49 as the company secured two new NATO AI contracts worth $340M combined. Despite the muted price action, options flow shows strong institutional call buying at the $150 strike. The stock's high P/E of 232x keeps value investors cautious while momentum traders eye the May 4 earnings.", source: "Defense One", url: "#", relatedTicker: "PLTR", timestamp: new Date(Date.now() - 900000).toISOString(), sentiment: "neutral" },
  { title: "Broadcom rises 1.29% on custom AI chip demand from hyperscalers", summary: "AVGO climbed after reports that custom ASIC orders from major cloud providers doubled quarter-over-quarter. The stock trades near its gamma flip at $312 in negative gamma territory, meaning dealer hedging could amplify directional moves. Q2 earnings on June 4 remain the major catalyst ahead.", source: "Semiconductor Engineering", url: "#", relatedTicker: "AVGO", timestamp: new Date(Date.now() - 1020000).toISOString(), sentiment: "bullish" },
  { title: "SOXL explodes 9% higher as semiconductor rally broadens", summary: "The 3x leveraged semiconductor ETF surged 9.08% as the chip sector rallied on strong MU earnings and AMD product launches. With implied volatility at 117.7%, options premiums remain extremely elevated. The negative gamma regime below $60 suggests this rally could continue with violent momentum.", source: "ETF Trends", url: "#", relatedTicker: "SOXL", timestamp: new Date(Date.now() - 1140000).toISOString(), sentiment: "bullish" },
  { title: "Crude oil drops 2.48% as OPEC+ signals production increase", summary: "USO fell sharply after OPEC+ members agreed to accelerate production increases starting May. The United States Oil Fund dropped to $124.09 with WTI crude testing $68 support. Despite the decline, the fund remains in positive gamma above $119, which may help stabilize prices near current levels.", source: "Reuters", url: "#", relatedTicker: "USO", timestamp: new Date(Date.now() - 1260000).toISOString(), sentiment: "bearish" },
  { title: "Silver flat as industrial demand offsets rate hike fears", summary: "SLV held unchanged at $68.14 as strong solar panel and electronics demand balanced concerns about BOJ rate hikes and their impact on precious metals. The ETF trades in negative gamma below $63 flip level with heavy put GEX at -131.8M suggesting dealers may sell into rallies.", source: "Kitco", url: "#", relatedTicker: "SLV", timestamp: new Date(Date.now() - 1380000).toISOString(), sentiment: "neutral" },
  { title: "Gold surges 1.75% to fresh highs as central bank buying accelerates", summary: "GLD rallied to $437.82 as global central banks continued aggressive gold accumulation amid geopolitical uncertainty. China and India led purchases with combined Q1 buying exceeding 300 tonnes. The +946.9M net GEX reflects massive institutional positioning, though the negative gamma regime below $409 means corrections could be sharp.", source: "World Gold Council", url: "#", relatedTicker: "GLD", timestamp: new Date(Date.now() - 1500000).toISOString(), sentiment: "bullish" },
];

// ── Earnings data for all 22 tickers ──
// Tickers without earnings data in v2_upgrade_data.json (ETFs/indices): SPX, QQQ, DIA, IWM, SPY, SOXL, USO, SLV, GLD
// These don't have earnings — only the stocks get earnings rows

const earningsData: Array<{ symbol: string; period: string; date: string; actualEps: number | null; estimatedEps: number | null; actualRevenue: number | null; estimatedRevenue: number | null; surprise: string | null; isUpcoming: number }> = [
  // TSLA
  { symbol: "TSLA", period: "Q4 2025", date: "2026-01-28", actualEps: 0.31, estimatedEps: 0.45, actualRevenue: 24901000000, estimatedRevenue: 24776440000, surprise: "miss", isUpcoming: 0 },
  { symbol: "TSLA", period: "Q3 2025", date: "2025-10-22", actualEps: 0.37, estimatedEps: 0.53, actualRevenue: 28095000000, estimatedRevenue: 26540367719, surprise: "mixed", isUpcoming: 0 },
  { symbol: "TSLA", period: "Q2 2025", date: "2025-07-23", actualEps: 0.27, estimatedEps: 0.39, actualRevenue: 22496000000, estimatedRevenue: 22279678348, surprise: "miss", isUpcoming: 0 },
  { symbol: "TSLA", period: "Q1 2026", date: "2026-04-21", actualEps: null, estimatedEps: 0.39, actualRevenue: null, estimatedRevenue: 22960000000, surprise: null, isUpcoming: 1 },

  // MSFT
  { symbol: "MSFT", period: "Q2 2026", date: "2026-01-28", actualEps: 4.14, estimatedEps: 3.88, actualRevenue: 81273000000, estimatedRevenue: 80308700000, surprise: "beat", isUpcoming: 0 },
  { symbol: "MSFT", period: "Q1 2026", date: "2025-10-29", actualEps: 4.13, estimatedEps: 3.65, actualRevenue: 77673000000, estimatedRevenue: 75494678452, surprise: "beat", isUpcoming: 0 },
  { symbol: "MSFT", period: "Q4 2025", date: "2025-07-30", actualEps: 3.65, estimatedEps: 3.35, actualRevenue: 76441000000, estimatedRevenue: 73926767276, surprise: "beat", isUpcoming: 0 },
  { symbol: "MSFT", period: "Q3 2026", date: "2026-04-29", actualEps: null, estimatedEps: 3.54, actualRevenue: null, estimatedRevenue: 70920000000, surprise: null, isUpcoming: 1 },

  // NVDA
  { symbol: "NVDA", period: "Q2 2026", date: "2025-08-27", actualEps: 0.99, estimatedEps: 1.00, actualRevenue: 46743000000, estimatedRevenue: 46048920689, surprise: "mixed", isUpcoming: 0 },
  { symbol: "NVDA", period: "Q1 2026", date: "2025-05-28", actualEps: 0.77, estimatedEps: 0.85, actualRevenue: 44062000000, estimatedRevenue: 43334160366, surprise: "mixed", isUpcoming: 0 },
  { symbol: "NVDA", period: "Q4 2025", date: "2025-02-26", actualEps: 0.85, estimatedEps: 0.84, actualRevenue: 39331000000, estimatedRevenue: 38101348563, surprise: "beat", isUpcoming: 0 },
  { symbol: "NVDA", period: "Q1 2027", date: "2026-05-20", actualEps: null, estimatedEps: null, actualRevenue: null, estimatedRevenue: null, surprise: null, isUpcoming: 1 },

  // MU
  { symbol: "MU", period: "Q2 2026", date: "2026-03-18", actualEps: 12.08, estimatedEps: 8.80, actualRevenue: 23860000000, estimatedRevenue: 19966650000, surprise: "beat", isUpcoming: 0 },
  { symbol: "MU", period: "Q1 2026", date: "2025-12-17", actualEps: 4.61, estimatedEps: 3.91, actualRevenue: 13643000000, estimatedRevenue: 12906739080, surprise: "beat", isUpcoming: 0 },
  { symbol: "MU", period: "Q4 2025", date: "2025-09-23", actualEps: 2.86, estimatedEps: 2.86, actualRevenue: 11315000000, estimatedRevenue: 11217035053, surprise: "inline", isUpcoming: 0 },
  { symbol: "MU", period: "Q3 2026", date: "2026-06-24", actualEps: null, estimatedEps: null, actualRevenue: null, estimatedRevenue: null, surprise: null, isUpcoming: 1 },

  // META
  { symbol: "META", period: "Q4 2025", date: "2026-01-28", actualEps: 8.88, estimatedEps: 8.21, actualRevenue: 59893000000, estimatedRevenue: 58330100000, surprise: "beat", isUpcoming: 0 },
  { symbol: "META", period: "Q3 2025", date: "2025-10-29", actualEps: 7.25, estimatedEps: 6.61, actualRevenue: 51242000000, estimatedRevenue: 49508128269, surprise: "beat", isUpcoming: 0 },
  { symbol: "META", period: "Q2 2025", date: "2025-07-30", actualEps: 7.14, estimatedEps: 5.83, actualRevenue: 47516000000, estimatedRevenue: 44821438597, surprise: "beat", isUpcoming: 0 },
  { symbol: "META", period: "Q1 2026", date: "2026-04-29", actualEps: null, estimatedEps: 6.67, actualRevenue: null, estimatedRevenue: 55358980000, surprise: null, isUpcoming: 1 },

  // ORCL
  { symbol: "ORCL", period: "Q2 2026", date: "2025-12-10", actualEps: 1.95, estimatedEps: 1.63, actualRevenue: 16058000000, estimatedRevenue: 16192737220, surprise: "mixed", isUpcoming: 0 },
  { symbol: "ORCL", period: "Q1 2026", date: "2025-09-09", actualEps: 1.20, estimatedEps: 1.47, actualRevenue: 14926000000, estimatedRevenue: 15039481792, surprise: "miss", isUpcoming: 0 },
  { symbol: "ORCL", period: "Q4 2025", date: "2025-06-11", actualEps: 1.35, estimatedEps: 1.64, actualRevenue: 15903000000, estimatedRevenue: 15581749411, surprise: "mixed", isUpcoming: 0 },
  { symbol: "ORCL", period: "Q4 2026", date: "2026-06-08", actualEps: null, estimatedEps: null, actualRevenue: null, estimatedRevenue: null, surprise: null, isUpcoming: 1 },

  // AAPL
  { symbol: "AAPL", period: "Q1 2026", date: "2026-01-29", actualEps: 2.84, estimatedEps: 2.65, actualRevenue: 143756000000, estimatedRevenue: 138391000000, surprise: "beat", isUpcoming: 0 },
  { symbol: "AAPL", period: "Q4 2025", date: "2025-10-30", actualEps: 1.85, estimatedEps: 1.73, actualRevenue: 102466000000, estimatedRevenue: 102227100000, surprise: "beat", isUpcoming: 0 },
  { symbol: "AAPL", period: "Q3 2025", date: "2025-07-31", actualEps: 1.57, estimatedEps: 1.42, actualRevenue: 94036000000, estimatedRevenue: 89562740000, surprise: "beat", isUpcoming: 0 },
  { symbol: "AAPL", period: "Q2 2026", date: "2026-04-30", actualEps: null, estimatedEps: 1.88, actualRevenue: null, estimatedRevenue: 108900000000, surprise: null, isUpcoming: 1 },

  // AMD
  { symbol: "AMD", period: "Q4 2025", date: "2026-02-03", actualEps: 1.24, estimatedEps: 1.32, actualRevenue: 10270000000, estimatedRevenue: 9668357000, surprise: "mixed", isUpcoming: 0 },
  { symbol: "AMD", period: "Q3 2025", date: "2025-11-04", actualEps: 0.97, estimatedEps: 1.17, actualRevenue: 9246000000, estimatedRevenue: 8756463065, surprise: "mixed", isUpcoming: 0 },
  { symbol: "AMD", period: "Q2 2025", date: "2025-08-05", actualEps: 0.27, estimatedEps: 0.47, actualRevenue: 7685000000, estimatedRevenue: 7414245177, surprise: "miss", isUpcoming: 0 },
  { symbol: "AMD", period: "Q1 2026", date: "2026-05-05", actualEps: null, estimatedEps: 1.27, actualRevenue: null, estimatedRevenue: 9843374000, surprise: null, isUpcoming: 1 },

  // NFLX
  { symbol: "NFLX", period: "Q4 2025", date: "2026-01-20", actualEps: 0.56, estimatedEps: 0.55, actualRevenue: 12051000000, estimatedRevenue: 11969860000, surprise: "beat", isUpcoming: 0 },
  { symbol: "NFLX", period: "Q3 2025", date: "2025-10-21", actualEps: 0.06, estimatedEps: 0.69, actualRevenue: 11510307000, estimatedRevenue: 11508430066, surprise: "miss", isUpcoming: 0 },
  { symbol: "NFLX", period: "Q2 2025", date: "2025-07-17", actualEps: 0.72, estimatedEps: 0.71, actualRevenue: 11079166000, estimatedRevenue: 11057365203, surprise: "beat", isUpcoming: 0 },
  { symbol: "NFLX", period: "Q1 2026", date: "2026-04-16", actualEps: null, estimatedEps: 0.76, actualRevenue: null, estimatedRevenue: 12172430000, surprise: null, isUpcoming: 1 },

  // GOOG
  { symbol: "GOOG", period: "Q4 2025", date: "2026-02-04", actualEps: 2.82, estimatedEps: 2.58, actualRevenue: 113828000000, estimatedRevenue: 111318400000, surprise: "beat", isUpcoming: 0 },
  { symbol: "GOOG", period: "Q3 2025", date: "2025-10-29", actualEps: 2.87, estimatedEps: 2.26, actualRevenue: 102346000000, estimatedRevenue: 99927409490, surprise: "beat", isUpcoming: 0 },
  { symbol: "GOOG", period: "Q2 2025", date: "2025-07-23", actualEps: 2.31, estimatedEps: 2.15, actualRevenue: 96428000000, estimatedRevenue: 94042223225, surprise: "beat", isUpcoming: 0 },
  { symbol: "GOOG", period: "Q1 2026", date: "2026-04-23", actualEps: null, estimatedEps: 2.76, actualRevenue: null, estimatedRevenue: 106668000000, surprise: null, isUpcoming: 1 },

  // AMZN
  { symbol: "AMZN", period: "Q4 2025", date: "2026-02-05", actualEps: 1.95, estimatedEps: 1.98, actualRevenue: 213386000000, estimatedRevenue: 211454800000, surprise: "mixed", isUpcoming: 0 },
  { symbol: "AMZN", period: "Q3 2025", date: "2025-10-30", actualEps: 1.95, estimatedEps: 1.58, actualRevenue: 180169000000, estimatedRevenue: 177913214900, surprise: "beat", isUpcoming: 0 },
  { symbol: "AMZN", period: "Q2 2025", date: "2025-07-31", actualEps: 1.68, estimatedEps: 1.33, actualRevenue: 167702000000, estimatedRevenue: 161776404970, surprise: "beat", isUpcoming: 0 },
  { symbol: "AMZN", period: "Q1 2026", date: "2026-04-30", actualEps: null, estimatedEps: null, actualRevenue: null, estimatedRevenue: null, surprise: null, isUpcoming: 1 },

  // PLTR
  { symbol: "PLTR", period: "Q4 2025", date: "2026-02-02", actualEps: 0.24, estimatedEps: 0.23, actualRevenue: 1406802000, estimatedRevenue: 1341029000, surprise: "beat", isUpcoming: 0 },
  { symbol: "PLTR", period: "Q3 2025", date: "2025-11-03", actualEps: 0.18, estimatedEps: 0.17, actualRevenue: 1181092000, estimatedRevenue: 1091837803, surprise: "beat", isUpcoming: 0 },
  { symbol: "PLTR", period: "Q2 2025", date: "2025-08-04", actualEps: 0.13, estimatedEps: 0.14, actualRevenue: 1003697000, estimatedRevenue: 937698232, surprise: "mixed", isUpcoming: 0 },
  { symbol: "PLTR", period: "Q1 2026", date: "2026-05-04", actualEps: null, estimatedEps: 0.29, actualRevenue: null, estimatedRevenue: 1538539000, surprise: null, isUpcoming: 1 },

  // AVGO
  { symbol: "AVGO", period: "Q1 2026", date: "2026-03-04", actualEps: 1.76, estimatedEps: 2.04, actualRevenue: 19311000000, estimatedRevenue: 19256160000, surprise: "mixed", isUpcoming: 0 },
  { symbol: "AVGO", period: "Q4 2025", date: "2025-12-11", actualEps: 1.61, estimatedEps: 1.87, actualRevenue: 18015000000, estimatedRevenue: 17465943054, surprise: "mixed", isUpcoming: 0 },
  { symbol: "AVGO", period: "Q3 2025", date: "2025-09-04", actualEps: 1.26, estimatedEps: 1.66, actualRevenue: 15952000000, estimatedRevenue: 15826050860, surprise: "mixed", isUpcoming: 0 },
  { symbol: "AVGO", period: "Q2 2026", date: "2026-06-04", actualEps: null, estimatedEps: 2.35, actualRevenue: null, estimatedRevenue: 22019050000, surprise: null, isUpcoming: 1 },
];

// ── Macro events ──
const macroEventsData = [
  { date: "2026-04-01", time: "10:00 AM ET", country: "US", event: "ISM Manufacturing PMI (Mar)", previous: "52.4", forecast: "52.5", actual: "52.7", importance: "high", notes: "Beat expectations. Strongest growth in factory activity since Aug 2022. Source: ISM / Trading Economics" },
  { date: "2026-04-01", time: "8:15 AM ET", country: "US", event: "ADP Non-Farm Employment Change (Mar)", previous: "66K", forecast: "39K", actual: "62K", importance: "high", notes: "Beat expectations. Source: ADP Media Center / CNBC" },
  { date: "2026-04-01", time: "11:50 PM ET (Mar 31 JST)", country: "JP", event: "Tankan Large Manufacturers Index Q1 2026", previous: "15", forecast: "16", actual: "17", importance: "high", notes: "Beat expectations. Source: BOJ Tankan / FXStreet / LiveSquawk" },
  { date: "2026-04-01", time: "11:50 PM ET (Mar 31 JST)", country: "JP", event: "Tankan Large Non-Manufacturing Index Q1 2026", previous: "33", forecast: "33", actual: "36", importance: "high", notes: "Significantly beat expectations. Source: VT Markets / BOJ" },
  { date: "2026-04-01", time: "11:50 PM ET (Mar 31 JST)", country: "JP", event: "Tankan Large All Industry Capex Q1 2026", previous: "12.6%", forecast: "13.0%", actual: "3.3%", importance: "high", notes: "Massive miss. Capex plans fell sharply. Source: LiveSquawk / VT Markets" },
  { date: "2026-04-03", time: "8:30 AM ET", country: "US", event: "Non-Farm Payrolls (Mar)", previous: "-92K", forecast: "59K", actual: null, importance: "high", notes: "Feb was revised to -92K (originally -92K reported). Consensus per CNBC ADP preview. Source: Trading Economics / CNBC" },
  { date: "2026-04-03", time: "8:30 AM ET", country: "US", event: "Unemployment Rate (Mar)", previous: "4.4%", forecast: "4.4%", actual: null, importance: "high", notes: "Source: Trading Economics / CNBC" },
  { date: "2026-04-03", time: "8:30 AM ET", country: "US", event: "Average Hourly Earnings m/m (Mar)", previous: null, forecast: null, actual: null, importance: "high", notes: "Released alongside NFP. Source: BLS / Equals Money calendar" },
  { date: "2026-04-03", time: "10:00 AM ET", country: "US", event: "ISM Services PMI (Mar)", previous: "56.1", forecast: null, actual: null, importance: "high", notes: "Released on 3rd business day (Apr 3). Previous: Feb 56.1. Source: ISM / YCharts / PR Newswire" },
  { date: "2026-04-08", time: "2:00 PM ET", country: "US", event: "FOMC Meeting Minutes (Mar 17-18 meeting)", previous: null, forecast: null, actual: null, importance: "high", notes: "Minutes from March FOMC meeting where Fed held rates at 4.25%-4.50%. Source: Federal Reserve Board" },
  { date: "2026-04-09", time: "8:30 AM ET", country: "US", event: "Final GDP q/q Q4 2025", previous: "0.7%", forecast: null, actual: null, importance: "high", notes: "Third/final estimate for Q4 2025 GDP. Source: Trading Economics / Equals Money" },
  { date: "2026-04-09", time: "8:30 AM ET", country: "US", event: "Core PCE Price Index m/m (Feb)", previous: null, forecast: "0.4%", actual: null, importance: "high", notes: "Fed's preferred inflation gauge. Released with GDP revision package. Source: Trading Economics" },
  { date: "2026-04-10", time: "8:30 AM ET", country: "US", event: "CPI m/m (Mar)", previous: "0.8%", forecast: "0.3%", actual: null, importance: "high", notes: "Source: Trading Economics" },
  { date: "2026-04-10", time: "8:30 AM ET", country: "US", event: "CPI y/y (Mar)", previous: "3.0%", forecast: "2.4%", actual: null, importance: "high", notes: "Source: Trading Economics" },
  { date: "2026-04-10", time: "8:30 AM ET", country: "US", event: "Core CPI m/m (Mar)", previous: "0.2%", forecast: "0.2%", actual: null, importance: "high", notes: "Source: Trading Economics / Equals Money" },
  { date: "2026-04-10", time: "8:30 AM ET", country: "US", event: "Core CPI y/y (Mar)", previous: "2.6%", forecast: "2.5%", actual: null, importance: "high", notes: "Source: Trading Economics" },
  { date: "2026-04-14", time: "8:30 AM ET", country: "US", event: "Core PPI m/m (Mar)", previous: null, forecast: null, actual: null, importance: "high", notes: "ForexFactory shows red (high) impact for Core PPI m/m on April 14. Source: ForexFactory week of Apr 13" },
  { date: "2026-04-14", time: "8:30 AM ET", country: "US", event: "PPI m/m (Mar)", previous: null, forecast: null, actual: null, importance: "high", notes: "ForexFactory shows red (high) impact for PPI m/m on April 14. Source: ForexFactory week of Apr 13" },
  { date: "2026-04-17", time: "8:30 AM ET", country: "JP", event: "Japan CPI y/y (Mar)", previous: "1.5%", forecast: "1.3%", actual: null, importance: "high", notes: "National CPI release. Schedule confirmed by Japan Statistics Bureau. Source: stat.go.jp / Trading Economics" },
  { date: "2026-04-17", time: "8:30 AM ET", country: "JP", event: "Japan Core CPI y/y (Mar)", previous: "2.0%", forecast: "1.6%", actual: null, importance: "high", notes: "Excludes fresh food. Previous: Feb 2.0%. Source: Trading Economics Japan Calendar" },
  { date: "2026-04-21", time: "7:50 PM ET (Apr 20)", country: "JP", event: "Japan Trade Balance (Mar)", previous: "¥470B", forecast: "¥57.3B", actual: null, importance: "high", notes: "Released Monday Apr 20 in JST, evening US ET. Source: Trading Economics / forex.tradingcharts.com" },
  { date: "2026-04-24", time: "11:30 PM ET (Apr 24 JST)", country: "JP", event: "Tokyo Core CPI y/y (Mar)", previous: "1.7%", forecast: "1.7%", actual: null, importance: "high", notes: "Leading indicator of national CPI trend. Source: Trading Economics / stat.go.jp" },
  { date: "2026-04-24", time: "11:30 PM ET (Apr 24 JST)", country: "JP", event: "Tokyo CPI y/y (Mar)", previous: "1.4%", forecast: "1.4%", actual: null, importance: "high", notes: "Source: Trading Economics" },
  { date: "2026-04-27", time: "Tentative (early morning ET)", country: "JP", event: "BOJ Policy Rate Decision (Apr 27-28 meeting)", previous: "0.75%", forecast: "1.00%", actual: null, importance: "high", notes: "BOJ meeting April 27-28. Market pricing 63% probability of 25bp hike to 1.00% (Polymarket). BOJ held in March. Source: Polymarket / Trading Economics / ForexFactory" },
  { date: "2026-04-27", time: "Tentative (early morning ET)", country: "JP", event: "BOJ Monetary Policy Statement & Outlook Report", previous: null, forecast: null, actual: null, importance: "high", notes: "Quarterly Outlook Report released alongside rate decision. Source: macenews.com / ForexFactory" },
  { date: "2026-04-27", time: "7:30 PM ET (Apr 27 JST)", country: "JP", event: "Japan Unemployment Rate (Mar)", previous: "2.6%", forecast: null, actual: null, importance: "high", notes: "Source: forex.tradingcharts.com / Trading Economics" },
  { date: "2026-04-28", time: "Tentative (morning ET)", country: "JP", event: "BOJ Press Conference", previous: null, forecast: null, actual: null, importance: "high", notes: "Governor Ueda press conference following rate decision. Source: ForexFactory week of Apr 27" },
  { date: "2026-04-29", time: "2:00 PM ET", country: "US", event: "FOMC Rate Decision (Federal Funds Rate)", previous: "4.25%-4.50%", forecast: "4.25%-4.50% (hold)", actual: null, importance: "high", notes: "94.8% probability of hold per CME FedWatch (as of Mar 26). Two-day meeting Apr 28-29. Source: MEXC/CME FedWatch / Federal Reserve Board / Business Insider" },
  { date: "2026-04-29", time: "2:30 PM ET", country: "US", event: "FOMC Press Conference (Powell)", previous: null, forecast: null, actual: null, importance: "high", notes: "Source: Federal Reserve Board calendar" },
  { date: "2026-04-30", time: "8:30 AM ET", country: "US", event: "Advance GDP q/q Q1 2026", previous: null, forecast: null, actual: null, importance: "high", notes: "First estimate of Q1 2026 GDP growth. Source: Equals Money / BEA" },
  { date: "2026-04-30", time: "8:30 AM ET", country: "US", event: "Core PCE Price Index m/m (Mar)", previous: null, forecast: null, actual: null, importance: "high", notes: "Fed's preferred inflation measure. Released with GDP package on Apr 30. Source: Equals Money" },
  { date: "2026-04-30", time: "8:30 AM ET", country: "US", event: "Employment Cost Index q/q Q1 2026", previous: null, forecast: null, actual: null, importance: "high", notes: "Key Fed wage inflation monitor. Released with Apr 30 data package. Source: Equals Money" },
];

// ── Seed everything ──

// Tickers
existingTickers.forEach((t) => storage.upsertTicker(t));
newTickers.forEach((t) => storage.upsertTicker(t));
console.log("Seeded", existingTickers.length + newTickers.length, "tickers");

// News
[...existingNews, ...newNews].forEach((n) => storage.addNews(n));
console.log("Seeded", existingNews.length + newNews.length, "news items");

// Earnings
earningsData.forEach((e) => storage.addEarning(e));
console.log("Seeded", earningsData.length, "earnings records");

// Macro events
macroEventsData.forEach((m) => storage.addMacroEvent(m));
console.log("Seeded", macroEventsData.length, "macro events");
