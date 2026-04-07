/**
 * discordSender.ts
 * Sends formatted trading signals to Discord channels via webhooks.
 */

import https from "https";
import http  from "http";
import FormData from "form-data";
import { generateSignalImage } from "./signalScreenshot";

// ── Webhook URLs ─────────────────────────────────────────────────────────────
const WEBHOOKS = {
  signals:   "https://discord.com/api/webhooks/1489609049770299586/QylJJXZpRdlHVeD2JT9Rwdx9hvH3RWjh7-DU0cJ73fbNk-P7sy6a16xeyEWkUPltKva_",
  critical:  "https://discord.com/api/webhooks/1489609228573216870/htJVmImOI105fhn6Sg38TXku2mH8XwCwaz_MLmDT1HpmtH0wPZnxfIBjNl_Lou1_KO-d",
  macro:     "https://discord.com/api/webhooks/1489609298987188294/rLrA7PDQCplnSCa64xHNicD9jZQ5bgjzwRCiDzu5b-ivl11PnLRxc4gHfVNVfOhJOV6G",
  flowIntel: "https://discord.com/api/webhooks/1490001362153508988/sXbdbHaw27vfuChrJn72eW2pZT6Fb6hw6l-auG6OK5Mnhw9-iue3A34EK9reer9MnWRT",
  newsFeed:  "https://discord.com/api/webhooks/1490040085197099130/Kii8EhadGEsS9s146sQtriACp8l9gnF8yViNQpnbnebu7jfvvAP8YPtDtwvDum_2ae4R",
  xFeed:     "https://discord.com/api/webhooks/1490040283793195050/-YQx_x23QEYPK6K598aNYQv8_nVxCU3wjM83z8E3t6hPbwptW5HOA3V1wRsiYKukUDMn",
};

export type SignalType = "ALCISTA" | "BAJISTA" | "NEUTRAL";

export interface DiscordSignal {
  ticker:       string;
  signal:       SignalType;
  confidence:   number;        // 0-100
  score:        number;        // 0-4
  price:        number;
  gammaFlip:    number;
  maxPain:      number;
  callWall:     number;
  putWall:      number;
  flowSummary:  string;        // e.g. "$42M CALL sweep BUY 91%"
  topNews:      string[];      // up to 3 headlines
  macroEvent:   string;        // e.g. "NFP 8:30am ET — alta volatilidad esperada"
  aiReason:     string;        // AI-generated explanation in Spanish
  isCritical:   boolean;       // score=4 or GF cross
  session:      string;        // "PRE-MARKET" | "MERCADO" | "POST-MARKET" | "CERRADO"
}

// ── HTTP helper (with browser-like User-Agent to avoid 403) ──────────────────
function postToDiscord(url: string, payload: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent":    "Mozilla/5.0 OptionFlowBot/1.0",
      },
    };
    const req = https.request(url, options, (res) => {
      res.resume();
      res.on("end", () => resolve());
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── HTTP helper for multipart/form-data (image uploads) ──────────────────────
function postImageToDiscord(webhookUrl: string, imgBuffer: Buffer, payload: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", imgBuffer, { filename: "signal.png", contentType: "image/png" });
    form.append("payload_json", JSON.stringify(payload));

    const parsed = new URL(webhookUrl);
    const lib    = parsed.protocol === "https:" ? https : http;

    const options = {
      method:   "POST",
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      headers:  {
        ...form.getHeaders(),
        "User-Agent": "Mozilla/5.0 OptionFlowBot/1.0",
      },
    };

    const req = lib.request(options, (res) => {
      res.resume();
      res.on("end", resolve);
    });
    req.on("error", reject);
    form.pipe(req);
  });
}

// ── Emoji helpers ────────────────────────────────────────────────────────────
function signalEmoji(s: SignalType)  { return s === "ALCISTA" ? "🟢" : s === "BAJISTA" ? "🔴" : "🟡"; }
function signalColor(s: SignalType)  { return s === "ALCISTA" ? 0x00C9A7 : s === "BAJISTA" ? 0xFF4444 : 0xFFCC00; }

// Map signal + score to OptionWhales-style label
function signalLabel(s: SignalType, score: number): string {
  if (s === "ALCISTA") return score >= 4 ? "Gamma Bull 🔥" : "Gamma Bull";
  if (s === "BAJISTA") return score >= 4 ? "Gamma Bear 🔥" : "Gamma Bear";
  return "Gamma Neutral";
}

// Confidence label — OptionWhales style
function confidenceLabel(c: number): string {
  if (c >= 80) return "High ↑Accel";
  if (c >= 60) return "Medium →Stable";
  return "Low ↓Fade";
}

// NY time string HH:MM ET
function nyTime(): string {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  }) + " ET";
}

// ── Get current NY session label ─────────────────────────────────────────────
export function getNYSession(): string {
  const now = new Date();
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const h = ny.getHours(), m = ny.getMinutes();
  const mins = h * 60 + m;
  const day = ny.getDay();
  if (day === 0 || day === 6) return "CERRADO";
  if (mins >= 240  && mins < 570)  return "PRE-MARKET";   // 4:00am - 9:30am
  if (mins >= 570  && mins < 960)  return "MERCADO";       // 9:30am - 4:00pm
  if (mins >= 960  && mins < 1200) return "POST-MARKET";   // 4:00pm - 8:00pm
  return "CERRADO";
}

// ── Main send function — OptionWhales style ──────────────────────────────────
export async function sendSignal(sig: DiscordSignal): Promise<void> {
  const emoji  = signalEmoji(sig.signal);
  const color  = signalColor(sig.signal);
  const label  = signalLabel(sig.signal, sig.score);
  const conf   = confidenceLabel(sig.confidence);
  const time   = nyTime();

  // ── Detect expiry context (0DTE = today) ──────────────────────────────────
  const now    = new Date();
  const ny     = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mm     = String(ny.getMonth() + 1).padStart(2, "0");
  const dd     = String(ny.getDate()).padStart(2, "0");
  const expiry = `${mm}/${dd}`; // 0DTE expiry

  // ── Build flow line (OptionWhales contract style) ─────────────────────────
  // Example: "SPY 4/17 $622P 12,000×$1.83 $2.2M"
  const flowLine = sig.flowSummary
    ? sig.flowSummary.split("\n")[0]   // take first flow line
    : `${sig.ticker} ${expiry} — sin flujo disponible`;

  // ── News summary (compact) ─────────────────────────────────────────────────
  const newsLine = sig.topNews.length > 0
    ? sig.topNews[0].substring(0, 90)
    : "";

  // ── Gamma levels line ─────────────────────────────────────────────────────
  const gfArrow = sig.price > sig.gammaFlip ? "↑ SOBRE GF" : "↓ BAJO GF";
  const levelsLine =
    `GF $${sig.gammaFlip}  •  Call Wall $${sig.callWall}  •  Put Wall $${sig.putWall}  •  Max Pain $${sig.maxPain}`;

  // ── Build description (OptionWhales clean style) ──────────────────────────
  const lines: string[] = [
    `Live intraday pulse  •  Score ${sig.score}/4  •  ${sig.session}`,
    "",
    `${emoji} **$${sig.ticker}** — ${label}`,
    `Confidence: **${conf}**`,
    `Price: **$${sig.price}** (${gfArrow})`,
    `\`${flowLine}\``,
  ];

  if (newsLine) lines.push(`📰 ${newsLine}`);
  if (sig.macroEvent) lines.push(`⚠️ Macro: ${sig.macroEvent}`);
  lines.push("");
  lines.push(`📍 ${levelsLine}`);
  if (sig.aiReason) lines.push("", `> ${sig.aiReason}`);

  const embed = {
    title:       `⚡ Option Flow Intent — ${time}`,
    color,
    description: lines.join("\n"),
    footer: {
      text: `OptionFlow  •  ${time}`,
    },
    timestamp: new Date().toISOString(),
  };

  if (false) await postToDiscord(WEBHOOKS.signals, { embeds: [embed] });

  // Critical alert
  if (sig.isCritical) {
    const critEmbed = {
      ...embed,
      title: `🚨 ALERTA CRÍTICA — $${sig.ticker}  |  Score ${sig.score}/4`,
      color: sig.signal === "ALCISTA" ? 0x00FF00 : 0xFF0000,
    };
    if (false) await postToDiscord(WEBHOOKS.critical, {
      content: `@here — **Confluencia crítica detectada en $${sig.ticker}**`,
      embeds:  [critEmbed],
    });
  }
}

// ── Send macro/news alert ─────────────────────────────────────────────────────
export async function sendMacroAlert(event: {
  name: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  impact: string;
  analysis: string;
}): Promise<void> {
  const embed = {
    title:  `📅 EVENTO MACRO — ${event.name}`,
    color:  0xFF9800,
    fields: [
      { name: "Actual",   value: event.actual   || "Pendiente", inline: true },
      { name: "Est.",     value: event.forecast || "—",         inline: true },
      { name: "Anterior", value: event.previous || "—",         inline: true },
      { name: "Impacto al Mercado", value: event.impact,   inline: false },
      { name: "Análisis",           value: event.analysis, inline: false },
    ],
    footer:    { text: `OptionFlow Agent  •  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET` },
    timestamp: new Date().toISOString(),
  };
  if (false) await postToDiscord(WEBHOOKS.macro, { embeds: [embed] });
}

// ── Send Dark Pool vs Price divergence alert ──────────────────────────────────
export interface DarkPoolDivergenceSignal {
  ticker:             string;
  price:              number;
  changePercent:      number;   // negative = price dropping
  darkPoolBullPct:    number;   // % of DP prints above VWAP
  darkPoolBlocksBuy:  number;   // # of large block buys above VWAP
  darkPoolBlocksSell: number;   // # of large block sells
  totalDPNotional:    string;   // formatted total notional
  netDelta:           string;   // formatted net $ above VWAP
  topPrints:          string;   // top 3 prints description
  aiReason:           string;   // AI explanation
  session:            string;
}

export async function sendDarkPoolDivergence(sig: DarkPoolDivergenceSignal): Promise<void> {
  const time   = nyTime();
  const pctStr = `${sig.changePercent > 0 ? "+" : ""}${sig.changePercent.toFixed(2)}%`;

  const lines: string[] = [
    `Live intraday pulse  •  Divergencia Institucional  •  ${sig.session}`,
    "",
    `🟣 **$${sig.ticker}** — Dark Pool Accumulation`,
    `Confidence: **High ↑Accel**`,
    `Price: **$${sig.price}** (${pctStr}) ↓ BAJANDO`,
    `\`DP Above VWAP: ${sig.darkPoolBullPct.toFixed(0)}%  •  Blocks buy: ${sig.darkPoolBlocksBuy}  •  Notional: ${sig.totalDPNotional}\``,
    "",
    `🏦 **Top Prints:**`,
    `\`${sig.topPrints || "Sin prints destacados"}\``,
  ];

  if (sig.aiReason) lines.push("", `> ${sig.aiReason}`);
  lines.push("", `> ⚠️ Cuando el precio baja PERO el Dark Pool muestra compra agresiva (ABOVE VWAP), las instituciones están acumulando en el dip.`);

  const embed = {
    title:       `⚡ Option Flow Intent — ${time}`,
    color:       0x7B61FF,
    description: lines.join("\n"),
    footer: {
      text: `OptionFlow  •  ${time}`,
    },
    timestamp: new Date().toISOString(),
  };

  if (false) await postToDiscord(WEBHOOKS.signals, { embeds: [embed] });

  const critEmbed = {
    ...embed,
    title: `🚨 ACUMULACIÓN INSTITUCIONAL — $${sig.ticker}  |  Dark Pool Divergencia`,
  };
  if (false) await postToDiscord(WEBHOOKS.critical, {
    content: `@here — **🏦 Dark Pool: acumulación agresiva en $${sig.ticker} mientras el precio cae ${pctStr}**`,
    embeds: [critEmbed],
  });
}

// ── Send news alert ───────────────────────────────────────────────────────────
export async function sendNewsAlert(news: {
  title:     string;
  summary:   string;
  ticker:    string;
  sentiment: string;
  url:       string;
}): Promise<void> {
  const sentEmoji = news.sentiment === "bullish" ? "🟢" : news.sentiment === "bearish" ? "🔴" : "🟡";
  const embed = {
    title:       `${sentEmoji} NOTICIA RELEVANTE — ${news.ticker}`,
    color:       news.sentiment === "bullish" ? 0x00FF88 : news.sentiment === "bearish" ? 0xFF3333 : 0xFFCC00,
    description: `**${news.title}**\n\n${news.summary}`,
    fields: [
      { name: "Sentimiento", value: news.sentiment.toUpperCase(), inline: true },
      { name: "Ticker",      value: news.ticker,                  inline: true },
      { name: "Fuente",      value: `[Ver artículo](${news.url})`, inline: false },
    ],
    footer:    { text: `OptionFlow Agent  •  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET` },
    timestamp: new Date().toISOString(),
  };
  if (false) await postToDiscord(WEBHOOKS.macro, { embeds: [embed] });
}

// ── Flow Intelligence Signal to Discord ──────────────────────────────────────
export interface FlowIntelSignal {
  symbol:         string;
  marketMode:     string;   // "Gamma Positivo" | "Gamma Negativo"
  bias:           string;   // "Alcista" | "Bajista" | "Neutral"
  setup:          string;   // "Long" | "Short" | "No Trade"
  entry:          string;
  confirmations:  string[];
  stopLoss:       string;
  takeProfit:     string;
  confidence:     string;   // "Alta" | "Media" | "Baja"
  reasoning:      string;
  keyLevels: {
    gammaFlip: string;
    callWall:  string;
    putWall:   string;
    maxPain:   string;
  };
  flowSummary:    string;
  liquiditySummary: string;
  session:        string;
  timestamp:      string;
}

export async function sendFlowIntelSignal(sig: FlowIntelSignal & { contractRec?: string; technicals?: any }): Promise<void> {
  const time       = nyTime();
  const setupEmoji = sig.setup === "Long" ? "⬆️" : sig.setup === "Short" ? "⬇️" : "⛔";
  const color      = sig.setup === "Long" ? 0x00C9A7 : sig.setup === "Short" ? 0xFF4444 : 0x888888;

  // ── Try to generate card image ─────────────────────────────────────────
  let imgBuffer: Buffer | null = null;
  try {
    imgBuffer = await generateSignalImage(sig);
  } catch (err: any) {
    console.error("[discord] Screenshot failed, falling back to text embed:", err.message?.substring(0, 100));
  }

  if (imgBuffer) {
    // ── Send image card ─────────────────────────────────────────────────
    const embed = {
      color,
      image: { url: "attachment://signal.png" },
      footer: { text: `OptionFlow • ${time} • No es asesoría financiera` },
      timestamp: new Date().toISOString(),
    };
    try {
      await postImageToDiscord(WEBHOOKS.flowIntel, imgBuffer, { embeds: [embed] });
    } catch (err: any) {
      console.error("[discord] Image upload failed:", err.message?.substring(0, 100));
      // Fall through to text fallback below
      imgBuffer = null;
    }
  }

  if (!imgBuffer) {
    // ── Fallback: text embed ────────────────────────────────────────────
    const confLines = sig.confirmations.slice(0, 3).map(c => `• ${c}`).join("\n");
    const lines: string[] = [
      `${sig.session}  •  ${time}`,
      "",
      `**$${sig.symbol}** — ${sig.marketMode}`,
      `Confidence: **${sig.confidence}**`,
      "",
      `${setupEmoji} **Setup: ${sig.setup.toUpperCase()}**`,
      `\`Entry: ${sig.entry}  •  SL: ${sig.stopLoss}  •  TP: ${sig.takeProfit}\``,
      "",
      `📍 GF ${sig.keyLevels.gammaFlip}  •  Call Wall ${sig.keyLevels.callWall}  •  Put Wall ${sig.keyLevels.putWall}`,
      "",
      confLines,
    ];
    const embed = {
      title: `⚡ Flow Intel — ${time}`,
      color,
      description: lines.join("\n"),
      footer: { text: `OptionFlow • ${time} • No es asesoría financiera` },
      timestamp: new Date().toISOString(),
    };
    await postToDiscord(WEBHOOKS.flowIntel, { embeds: [embed] });
  }
}

// ── Send Live News to Discord #news-feed ─────────────────────────────────────
export async function sendNewsToDiscord(article: {
  title:     string;
  summary:   string;
  source:    string;
  url:       string;
  ticker:    string;
  sentiment: string;
  timestamp: string;
}): Promise<void> {
  const sentEmoji = article.sentiment === "bullish" ? "\u{1F7E2}" :
                    article.sentiment === "bearish" ? "\u{1F534}" : "\u{1F7E1}";
  const sentLabel = article.sentiment === "bullish" ? "BULLISH" :
                    article.sentiment === "bearish" ? "BEARISH" : "NEUTRAL";
  const color = article.sentiment === "bullish" ? 0x00C9A7 :
                article.sentiment === "bearish" ? 0xFF6B6B : 0xFFCC00;

  const timeStr = article.timestamp
    ? new Date(article.timestamp).toLocaleString("en-US", { timeZone: "America/New_York", hour12: true, hour: "numeric", minute: "2-digit" })
    : "";

  const embed = {
    title:       `${sentEmoji} ${article.ticker}  \u2014  ${sentLabel}`,
    color,
    description: `**${article.title}**\n\n${article.summary || ""}`.substring(0, 2000),
    fields: [
      { name: "\u{1F4F0} Fuente",     value: `[${article.source}](${article.url})`, inline: true },
      { name: "\u{1F4C8} Ticker",      value: article.ticker,                         inline: true },
      { name: "\u{1F551} Hora",        value: timeStr || "Reciente",                  inline: true },
    ],
    footer: {
      text: `OptionFlow Live News  \u2022  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET`,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await postToDiscord(WEBHOOKS.newsFeed, { embeds: [embed] });
  } catch (err: any) {
    console.error("[discord] Error sending news to Discord:", err.message?.substring(0, 200));
  }
}

// ── Send X/Twitter post to Discord #x-feed ───────────────────────────────────
export async function sendTweetToDiscord(tweet: {
  username:    string;
  displayName: string;
  text:        string;
  timestamp:   string;
  url:         string;
  ticker:      string;
  sentiment:   string;
}): Promise<void> {
  const sentEmoji = tweet.sentiment === "bullish" ? "\u{1F7E2}" :
                    tweet.sentiment === "bearish" ? "\u{1F534}" : "\u{1F7E1}";
  const sentLabel = tweet.sentiment === "bullish" ? "BULLISH" :
                    tweet.sentiment === "bearish" ? "BEARISH" : "NEUTRAL";
  const color = tweet.sentiment === "bullish" ? 0x00C9A7 :
                tweet.sentiment === "bearish" ? 0xFF6B6B : 0x1DA1F2;

  const timeStr = tweet.timestamp
    ? new Date(tweet.timestamp).toLocaleString("en-US", { timeZone: "America/New_York", hour12: true, hour: "numeric", minute: "2-digit" })
    : "";

  const embed = {
    author: {
      name: `${tweet.displayName} (@${tweet.username})`,
      url:  `https://x.com/${tweet.username}`,
    },
    title:       tweet.ticker ? `${sentEmoji} ${tweet.ticker}  \u2014  ${sentLabel}` : undefined,
    color,
    description: tweet.text.substring(0, 2000),
    fields: [
      ...(tweet.ticker ? [{ name: "\u{1F4C8} Ticker", value: tweet.ticker, inline: true }] : []),
      { name: "\u{1F517} Link",  value: `[Ver en X](${tweet.url})`, inline: true },
      { name: "\u{1F551} Hora",  value: timeStr || "Reciente",       inline: true },
    ],
    footer: {
      text: `OptionFlow X Feed  \u2022  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET`,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await postToDiscord(WEBHOOKS.xFeed, { embeds: [embed] });
  } catch (err: any) {
    console.error("[discord] Error sending tweet to Discord:", err.message?.substring(0, 200));
  }
}
