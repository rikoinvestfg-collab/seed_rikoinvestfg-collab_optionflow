/**
 * discordSender.ts
 * Sends formatted trading signals to Discord channels via webhooks.
 */

import https from "https";

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

// ── Emoji helpers ────────────────────────────────────────────────────────────
function signalEmoji(s: SignalType)  { return s === "ALCISTA" ? "🟢" : s === "BAJISTA" ? "🔴" : "🟡"; }
function signalColor(s: SignalType)  { return s === "ALCISTA" ? 0x00FF88 : s === "BAJISTA" ? 0xFF3333 : 0xFFCC00; }
function confidenceBar(c: number)    {
  const filled = Math.round(c / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${c}%`;
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

// ── Main send function ────────────────────────────────────────────────────────
export async function sendSignal(sig: DiscordSignal): Promise<void> {
  const emoji    = signalEmoji(sig.signal);
  const color    = signalColor(sig.signal);
  const sessionBadge = sig.session === "MERCADO" ? "🔔 MERCADO ABIERTO" :
                       sig.session === "PRE-MARKET" ? "🌅 PRE-MARKET" :
                       sig.session === "POST-MARKET" ? "🌙 POST-MARKET" : "💤 CERRADO";

  const priceVsGF = sig.price > sig.gammaFlip
    ? `${sig.price} > GF ${sig.gammaFlip} ✅ SOBRE`
    : `${sig.price} < GF ${sig.gammaFlip} ⛔ BAJO`;

  const newsLines = sig.topNews.length > 0
    ? sig.topNews.slice(0, 3).map((n, i) => `> ${i + 1}. ${n}`).join("\n")
    : "> Sin noticias relevantes";

  const embed = {
    title:       `${emoji} ${sig.signal} — ${sig.ticker}  |  Score ${sig.score}/4`,
    color,
    description: `**${sessionBadge}**\n\n${sig.aiReason}`,
    fields: [
      {
        name:   "📊 Precio vs Niveles",
        value:  `\`\`\`\nPrecio:     ${sig.price}\nGamma Flip: ${sig.gammaFlip}  →  ${priceVsGF.split("→")[1]?.trim()}\nMax Pain:   ${sig.maxPain}\nCall Wall:  ${sig.callWall}\nPut Wall:   ${sig.putWall}\n\`\`\``,
        inline: false,
      },
      {
        name:   "🌊 Options Flow",
        value:  `\`\`\`\n${sig.flowSummary || "Sin flujos significativos"}\n\`\`\``,
        inline: false,
      },
      {
        name:   "📰 Noticias Relevantes",
        value:  newsLines,
        inline: false,
      },
      {
        name:   "📅 Macro",
        value:  sig.macroEvent ? `> ⚠️ ${sig.macroEvent}` : "> Sin eventos macro de alto impacto",
        inline: false,
      },
      {
        name:   "🎯 Confianza",
        value:  `\`${confidenceBar(sig.confidence)}\``,
        inline: false,
      },
    ],
    footer: {
      text: `OptionFlow Agent  •  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET`,
    },
    timestamp: new Date().toISOString(),
  };

  // Always send to #señales-generales
  await postToDiscord(WEBHOOKS.signals, { embeds: [embed] });

  // Send to #alertas-criticas only if critical (score=4 or GF cross)
  if (sig.isCritical) {
    const critEmbed = {
      ...embed,
      title: `🚨 CRÍTICO — ${sig.signal}  ${sig.ticker}  |  Score ${sig.score}/4`,
      color: sig.signal === "ALCISTA" ? 0x00FF00 : 0xFF0000,
    };
    await postToDiscord(WEBHOOKS.critical, {
      content: `@here — **Confluencia crítica detectada en ${sig.ticker}**`,
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
  await postToDiscord(WEBHOOKS.macro, { embeds: [embed] });
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
  const sessionBadge = sig.session === "MERCADO" ? "\u{1F514} MERCADO ABIERTO" :
                       sig.session === "PRE-MARKET" ? "\u{1F305} PRE-MARKET" :
                       sig.session === "POST-MARKET" ? "\u{1F319} POST-MARKET" : "\u{1F4A4} CERRADO";

  const embed = {
    title:       `\u{1F3E6} DARK POOL vs PRECIO \u2014 ${sig.ticker}  |  Acumulaci\u00F3n Detectada`,
    color:       0x7B61FF, // purple for contrarian
    description: `**${sessionBadge}**\n\n${sig.aiReason}`,
    fields: [
      {
        name:   "\u{1F4C9} Precio",
        value:  `\`\`\`\nPrecio: $${sig.price}  (${sig.changePercent > 0 ? "+" : ""}${sig.changePercent.toFixed(2)}%)\nEl precio BAJA pero las instituciones COMPRAN\n\`\`\``,
        inline: false,
      },
      {
        name:   "\u{1F3E6} Dark Pool Activity",
        value:  `\`\`\`\nPrints ABOVE VWAP: ${sig.darkPoolBullPct.toFixed(0)}%\nBlocks compra:     ${sig.darkPoolBlocksBuy}\nBlocks venta:      ${sig.darkPoolBlocksSell}\nNotional total:    ${sig.totalDPNotional}\nNet Delta:         ${sig.netDelta}\n\`\`\``,
        inline: false,
      },
      {
        name:   "\u{1F4CB} Top Dark Pool Prints",
        value:  `\`\`\`\n${sig.topPrints || "Sin prints destacados"}\n\`\`\``,
        inline: false,
      },
      {
        name:   "\u{26A0}\u{FE0F} Se\u00F1al Contraria",
        value:  "> Cuando el precio baja PERO el Dark Pool muestra compra agresiva (ABOVE VWAP, blocks grandes), las instituciones est\u00E1n acumulando en el dip. Es una de las se\u00F1ales contrarias m\u00E1s fiables.",
        inline: false,
      },
    ],
    footer: {
      text: `OptionFlow Agent  \u2022  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET`,
    },
    timestamp: new Date().toISOString(),
  };

  // Send to #se\u00F1ales-generales
  await postToDiscord(WEBHOOKS.signals, { embeds: [embed] });

  // Also send to #alertas-criticas since this is high-value contrarian signal
  const critEmbed = {
    ...embed,
    title: `\u{1F6A8} ACUMULACI\u00D3N INSTITUCIONAL \u2014 ${sig.ticker}  |  Dark Pool Divergencia`,
    color: 0x7B61FF,
  };
  await postToDiscord(WEBHOOKS.critical, {
    content: `@here \u2014 **\u{1F3E6} Dark Pool muestra acumulaci\u00F3n agresiva en ${sig.ticker} mientras el precio cae ${sig.changePercent.toFixed(2)}%**`,
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
  await postToDiscord(WEBHOOKS.macro, { embeds: [embed] });
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

export async function sendFlowIntelSignal(sig: FlowIntelSignal): Promise<void> {
  const sessionBadge = sig.session === "MERCADO" ? "\u{1F514} MERCADO ABIERTO" :
                       sig.session === "PRE-MARKET" ? "\u{1F305} PRE-MARKET" :
                       sig.session === "POST-MARKET" ? "\u{1F319} POST-MARKET" : "\u{1F4A4} CERRADO";

  const biasEmoji = sig.bias.includes("Alcista") ? "\u{1F7E2}" :
                    sig.bias.includes("Bajista") ? "\u{1F534}" : "\u{26AA}";
  const setupEmoji = sig.setup === "Long" ? "\u{2B06}\u{FE0F}" :
                     sig.setup === "Short" ? "\u{2B07}\u{FE0F}" : "\u{26D4}";
  const confEmoji = sig.confidence === "Alta" ? "\u{1F525}" :
                    sig.confidence === "Media" ? "\u{26A0}\u{FE0F}" : "\u{2744}\u{FE0F}";

  const color = sig.setup === "Long" ? 0x00FF88 :
                sig.setup === "Short" ? 0xFF4444 : 0x888888;

  const embed = {
    title: `\u{1F9E0} FLOW INTELLIGENCE \u2014 ${sig.symbol}  |  ${setupEmoji} ${sig.setup.toUpperCase()}`,
    color,
    description: `**${sessionBadge}**\n\n${sig.reasoning}`,
    fields: [
      {
        name: "\u{1F4CA} Market Mode",
        value: `\`\`\`\n${sig.marketMode}\n\`\`\``,
        inline: true,
      },
      {
        name: `${biasEmoji} Bias`,
        value: `\`\`\`\n${sig.bias}\n\`\`\``,
        inline: true,
      },
      {
        name: `${confEmoji} Confianza`,
        value: `\`\`\`\n${sig.confidence}\n\`\`\``,
        inline: true,
      },
      {
        name: "\u{1F4CD} Niveles Clave",
        value: `\`\`\`\nGamma Flip: ${sig.keyLevels.gammaFlip}\nCall Wall:  ${sig.keyLevels.callWall}\nPut Wall:   ${sig.keyLevels.putWall}\nMax Pain:   ${sig.keyLevels.maxPain}\n\`\`\``,
        inline: false,
      },
      {
        name: `${setupEmoji} Setup`,
        value: `\`\`\`\nEntrada:     ${sig.entry}\nStop Loss:   ${sig.stopLoss}\nTake Profit: ${sig.takeProfit}\n\`\`\``,
        inline: false,
      },
      {
        name: "\u{2705} Confirmaciones",
        value: sig.confirmations.map(c => `> \u{2022} ${c}`).join("\n") || "> Sin confirmaciones",
        inline: false,
      },
      {
        name: "\u{1F4C8} Flujo Institucional",
        value: `\`\`\`\n${sig.flowSummary}\n\`\`\``,
        inline: false,
      },
      {
        name: "\u{1F4A7} Liquidez",
        value: `\`\`\`\n${sig.liquiditySummary}\n\`\`\``,
        inline: false,
      },
    ],
    footer: {
      text: `OptionFlow Agent  \u2022  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET  \u2022  No es asesor\u00EDa financiera`,
    },
    timestamp: new Date().toISOString(),
  };

  // Send to #flow-intelligence
  await postToDiscord(WEBHOOKS.flowIntel, { embeds: [embed] });

  // If HIGH confidence and actionable (Long/Short), also send to #alertas-criticas
  if (sig.confidence === "Alta" && sig.setup !== "No Trade") {
    const critEmbed = { ...embed, title: `\u{1F6A8} FLOW INTEL HIGH CONF \u2014 ${sig.symbol}  |  ${setupEmoji} ${sig.setup.toUpperCase()}` };
    await postToDiscord(WEBHOOKS.critical, {
      content: `@here \u2014 **\u{1F9E0} Flow Intelligence: ${sig.symbol} ${sig.setup.toUpperCase()} con confianza ALTA**`,
      embeds: [critEmbed],
    });
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
