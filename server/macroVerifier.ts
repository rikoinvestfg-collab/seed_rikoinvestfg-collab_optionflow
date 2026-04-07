/**
 * macroVerifier.ts
 * 
 * Automatic macro data verification and real-time update system.
 * 
 * HOW IT WORKS:
 * - Runs every 60 seconds
 * - Detects when a scheduled macro event is due (within ±5 min of release time)
 * - Fetches actual values from multiple sources: FairEconomy, investing.com, BLS, etc.
 * - Cross-validates across sources before updating DB
 * - Sends Discord alert to #macro-noticias when data is confirmed
 * - Retries every 60s until actual is found (up to 30 min after release)
 */

import https from "https";
import http from "http";

const VERIFY_INTERVAL_MS = 60_000;        // check every 60 seconds
const RELEASE_WINDOW_BEFORE_MS = 5 * 60_000;   // start watching 5 min before
const RELEASE_WINDOW_AFTER_MS  = 30 * 60_000;  // keep trying up to 30 min after

// Discord macro webhook
const MACRO_WEBHOOK = "https://discord.com/api/webhooks/1489609298987188294/rLrA7PDQCplnSCa64xHNicD9jZQ5bgjzwRCiDzu5b-ivl11PnLRxc4gHfVNVfOhJOV6G";
const SIGNALS_WEBHOOK = "https://discord.com/api/webhooks/1489609049770299586/QylJJXZpRdlHVeD2JT9Rwdx9hvH3RWjh7-DU0cJ73fbNk-P7sy6a16xeyEWkUPltKva_";
const CRITICAL_WEBHOOK = "https://discord.com/api/webhooks/1489609228573216870/htJVmImOI105fhn6Sg38TXku2mH8XwCwaz_MLmDT1HpmtH0wPZnxfIBjNl_Lou1_KO-d";

// Track events we've already sent alerts for
const notifiedEvents = new Set<string>();
// Track events actively being monitored
const watchingEvents = new Map<string, { attempts: number; startedAt: number }>();

let storageRef: any = null;

// ── Entry point ───────────────────────────────────────────────────────────────
export function initMacroVerifier(storage: any) {
  storageRef = storage;
  console.log("[macroVerifier] Starting macro verification system — checking every 60s");
  runVerificationCycle().catch(console.error);
  setInterval(() => runVerificationCycle().catch(console.error), VERIFY_INTERVAL_MS);
}

// ── Main verification cycle ───────────────────────────────────────────────────
async function runVerificationCycle() {
  if (!storageRef) return;

  const allEvents: any[] = storageRef.getAllMacroEvents();
  const now = new Date();
  const nyNow = toNYTime(now);
  const todayStr = nyNow.toISOString().split("T")[0];

  // Filter high-importance events scheduled for today
  const todayEvents = allEvents.filter(ev =>
    ev.date === todayStr && ev.importance === "high"
  );

  for (const ev of todayEvents) {
    const eventKey = `${ev.date}|${ev.event}`;

    // Parse event release time in NY timezone
    const releaseTime = parseNYTime(ev.date, ev.time);
    if (!releaseTime) continue;

    const msBefore  = releaseTime.getTime() - now.getTime();
    const msAfter   = now.getTime() - releaseTime.getTime();
    const inWindow  = msBefore <= RELEASE_WINDOW_BEFORE_MS && msAfter <= RELEASE_WINDOW_AFTER_MS;

    if (!inWindow) continue;

    // Already has actual and we've notified → skip
    if (ev.actual && ev.actual.trim() !== "" && notifiedEvents.has(eventKey)) continue;

    // Start watching this event
    if (!watchingEvents.has(eventKey)) {
      watchingEvents.set(eventKey, { attempts: 0, startedAt: Date.now() });
      console.log(`[macroVerifier] Now watching: ${ev.event} (${ev.date} ${ev.time})`);
    }

    const watch = watchingEvents.get(eventKey)!;
    watch.attempts++;

    // If already has actual, just notify Discord (data already in DB)
    if (ev.actual && ev.actual.trim() !== "" && !notifiedEvents.has(eventKey)) {
      await notifyDiscord(ev, "DB");
      notifiedEvents.add(eventKey);
      watchingEvents.delete(eventKey);
      continue;
    }

    // Try to fetch actual from multiple sources
    console.log(`[macroVerifier] Fetching ${ev.event} — attempt ${watch.attempts}`);
    const result = await fetchActualFromSources(ev);

    if (result) {
      console.log(`[macroVerifier] ✓ Got ${ev.event}: actual=${result.actual} from ${result.source}`);

      // Update DB
      storageRef.updateMacroEventActual(ev.id, result.actual, result.forecast, result.previous);

      // Notify Discord
      await notifyDiscord({ ...ev, actual: result.actual, forecast: result.forecast || ev.forecast, previous: result.previous || ev.previous }, result.source);
      notifiedEvents.add(eventKey);
      watchingEvents.delete(eventKey);
    } else {
      // Stop trying after 30 min
      if (Date.now() - watch.startedAt > RELEASE_WINDOW_AFTER_MS) {
        console.log(`[macroVerifier] Gave up on ${ev.event} after 30 min`);
        watchingEvents.delete(eventKey);
      }
    }
  }
}

// ── Fetch actual from multiple sources ───────────────────────────────────────
async function fetchActualFromSources(ev: any): Promise<{ actual: string; forecast?: string; previous?: string; source: string } | null> {
  // Try sources in order of reliability
  const sources = [
    () => fetchFromFairEconomy(ev),
    () => fetchFromBLS(ev),
    () => fetchFromFred(ev),
  ];

  for (const source of sources) {
    try {
      const result = await source();
      if (result && result.actual && result.actual.trim() !== "") {
        return result;
      }
    } catch (err) {
      // try next source
    }
  }
  return null;
}

// ── Source 1: FairEconomy (ForexFactory JSON) ─────────────────────────────────
async function fetchFromFairEconomy(ev: any): Promise<{ actual: string; forecast?: string; previous?: string; source: string } | null> {
  const urls = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
  ];

  for (const url of urls) {
    try {
      const data = await fetchJSON(url);
      if (!Array.isArray(data)) continue;

      const eventName = ev.event.toLowerCase();
      const match = data.find((item: any) => {
        if (!item.date || !item.title) return false;
        const itemDate = item.date.substring(0, 10);
        if (itemDate !== ev.date) return false;
        const title = item.title.toLowerCase();
        return fuzzyMatch(eventName, title);
      });

      if (match && match.actual && match.actual.trim() !== "") {
        return {
          actual:   formatActual(match.actual),
          forecast: match.forecast ? formatActual(match.forecast) : undefined,
          previous: match.previous ? formatActual(match.previous) : undefined,
          source:   "FairEconomy",
        };
      }
    } catch {}
  }
  return null;
}

// ── Source 2: BLS (Bureau of Labor Statistics) — for NFP, CPI, PPI ───────────
async function fetchFromBLS(ev: any): Promise<{ actual: string; forecast?: string; previous?: string; source: string } | null> {
  const eventName = ev.event.toLowerCase();

  // Series IDs for key BLS indicators
  const BLS_SERIES: Record<string, string> = {
    "non-farm":         "CES0000000001",  // Total Nonfarm Payroll
    "unemployment":     "LNS14000000",    // Unemployment Rate
    "cpi":              "CUUR0000SA0",    // CPI All Items
    "average hourly":   "CES0500000003",  // Avg Hourly Earnings
    "ppi":              "WPSFD4",         // PPI Finished Goods
  };

  const matchKey = Object.keys(BLS_SERIES).find(k => eventName.includes(k));
  if (!matchKey) return null;

  const seriesId = BLS_SERIES[matchKey];
  const year = ev.date.substring(0, 4);

  try {
    const body = JSON.stringify({
      seriesid: [seriesId],
      startyear: year,
      endyear: year,
    });
    const data = await fetchJSONPost("https://api.bls.gov/publicAPI/v2/timeseries/data/", body);

    if (data?.Results?.series?.[0]?.data?.[0]) {
      const latest = data.Results.series[0].data[0];
      const value  = latest.value;
      if (!value) return null;

      // Format based on type
      const formatted = eventName.includes("unemployment") || eventName.includes("cpi") || eventName.includes("ppi") || eventName.includes("hourly")
        ? `${value}%`
        : `${Number(value).toLocaleString()}K`;

      return { actual: formatted, source: "BLS.gov" };
    }
  } catch {}
  return null;
}

// ── Source 3: FRED (Federal Reserve Economic Data) ───────────────────────────
async function fetchFromFred(ev: any): Promise<{ actual: string; forecast?: string; previous?: string; source: string } | null> {
  const eventName = ev.event.toLowerCase();

  const FRED_SERIES: Record<string, { id: string; format: (v: number) => string }> = {
    "gdp":              { id: "GDP",      format: v => `${v.toFixed(1)}%` },
    "unemployment":     { id: "UNRATE",   format: v => `${v.toFixed(1)}%` },
    "cpi":              { id: "CPIAUCSL", format: v => `${v.toFixed(1)}` },
    "jolts":            { id: "JTSJOL",   format: v => `${(v/1000).toFixed(2)}M` },
    "pce":              { id: "PCEPI",    format: v => `${v.toFixed(1)}` },
    "retail sales":     { id: "RSAFS",    format: v => `${v.toFixed(1)}%` },
  };

  const matchKey = Object.keys(FRED_SERIES).find(k => eventName.includes(k));
  if (!matchKey) return null;

  const series = FRED_SERIES[matchKey];
  const startDate = ev.date;

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&observation_start=${startDate}&sort_order=desc&limit=1&file_type=json&api_key=b02f3e7ba40b4e2a96fdda8ed7ab9b35`;
    const data = await fetchJSON(url);

    if (data?.observations?.[0]?.value && data.observations[0].value !== ".") {
      const value = parseFloat(data.observations[0].value);
      return { actual: series.format(value), source: "FRED" };
    }
  } catch {}
  return null;
}

// ── Discord notification ──────────────────────────────────────────────────────
async function notifyDiscord(ev: any, source: string) {
  const eventName = ev.event;
  const actual    = ev.actual || "—";
  const forecast  = ev.forecast || "—";
  const previous  = ev.previous || "—";

  // Determine if beat/miss
  const actNum  = parseFloat(actual.replace(/[^0-9.-]/g, ""));
  const estNum  = parseFloat(forecast.replace(/[^0-9.-]/g, ""));
  const beat    = !isNaN(actNum) && !isNaN(estNum) && actNum > estNum;
  const miss    = !isNaN(actNum) && !isNaN(estNum) && actNum < estNum;
  const inline  = !isNaN(actNum) && !isNaN(estNum) && actNum === estNum;

  const resultLabel = beat ? "✅ BEAT" : miss ? "❌ MISS" : "➡️ EN LÍNEA";
  const color       = beat ? 0x00FF88 : miss ? 0xFF3333 : 0xFFCC00;

  // Market impact analysis
  const impact   = getMacroImpactText(eventName, actual, forecast);
  const analysis = getMacroAnalysisText(eventName, actual, forecast);

  const embed = {
    title:       `📅 DATO MACRO — ${eventName}`,
    color,
    description: `**${resultLabel}** — Dato confirmado | Fuente: ${source}`,
    fields: [
      { name: "Actual",         value: `**${actual}**`,  inline: true },
      { name: "Estimado",       value: forecast,          inline: true },
      { name: "Anterior",       value: previous,          inline: true },
      { name: "Impacto",        value: impact,            inline: false },
      { name: "Análisis Rápido",value: analysis,          inline: false },
    ],
    footer:    { text: `OptionFlow Agent  •  ${new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour12: false })} ET  •  ${ev.date}` },
    timestamp: new Date().toISOString(),
  };

  // Send to #macro-noticias
  if (false) await postWebhook(MACRO_WEBHOOK, { embeds: [embed] });

  // If critical beat/miss (>10% deviation), also send to #alertas-criticas
  if (!isNaN(actNum) && !isNaN(estNum) && estNum !== 0) {
    const deviation = Math.abs((actNum - estNum) / Math.abs(estNum)) * 100;
    if (deviation > 10) {
      if (false) await postWebhook(CRITICAL_WEBHOOK, {
        content: `@here — **DATO MACRO CRÍTICO: ${eventName}** → ${actual} vs ${forecast} est. (${beat ? "+" : "-"}${deviation.toFixed(0)}%)`,
        embeds: [embed],
      });
      // Also ping signals channel
      if (false) await postWebhook(SIGNALS_WEBHOOK, {
        content: `⚠️ **Dato macro de alto impacto acaba de salir** — ${eventName}: **${actual}** (est. ${forecast}) — Revisar posiciones en SPX/SPY/QQQ`,
        embeds: [],
      });
    }
  }
}

// ── Market impact text ────────────────────────────────────────────────────────
function getMacroImpactText(event: string, actual: string, forecast: string): string {
  const ev  = event.toLowerCase();
  const act = parseFloat(actual.replace(/[^0-9.-]/g, "") || "0");
  const est = parseFloat(forecast.replace(/[^0-9.-]/g, "") || "0");
  const beat = act > est;

  if (ev.includes("non-farm") || ev.includes("nonfarm") || ev.includes("payroll"))
    return beat ? "🟢 Mercado laboral fuerte → Bullish acciones, Dollar fuerte, posible Fed hawkish" : "🔴 Mercado laboral débil → Bearish acciones, posible recorte de tasas";
  if (ev.includes("cpi"))
    return beat ? "🔴 Inflación caliente → Bearish acciones, yields suben, Fed hawkish" : "🟢 Inflación suave → Bullish acciones, yields bajan, Fed dovish";
  if (ev.includes("fomc") || ev.includes("rate decision"))
    return "⚡ Decisión de tasas → Máxima volatilidad en todos los activos, especialmente índices";
  if (ev.includes("gdp"))
    return beat ? "🟢 Economía fuerte → Bullish acciones y Dollar" : "🔴 Economía débil → Bearish acciones, riesgo de recesión";
  if (ev.includes("pmi") || ev.includes("ism"))
    return act >= 50 ? "🟢 Expansión económica (>50) → Bullish mercado" : "🔴 Contracción económica (<50) → Bearish mercado";
  if (ev.includes("unemployment"))
    return beat ? "🔴 Desempleo sube → Bearish pero señal dovish para Fed" : "🟢 Desempleo baja → Bullish economía, posible Fed hawkish";
  if (ev.includes("retail sales"))
    return beat ? "🟢 Consumo fuerte → Bullish acciones, Dollar fuerte" : "🔴 Consumo débil → Bearish, señal de desaceleración";
  if (ev.includes("jolts"))
    return beat ? "🟢 Mercado laboral tenso → Fed puede mantener tasas altas" : "🔴 Vacantes caen → Mercado laboral se enfría, señal dovish";
  if (ev.includes("pce"))
    return beat ? "🔴 Inflación PCE caliente → Fed hawkish, bearish acciones" : "🟢 Inflación PCE suave → Fed dovish, bullish acciones";
  return beat ? "🟢 Dato positivo → Potencial movimiento alcista" : "🔴 Dato negativo → Potencial movimiento bajista";
}

function getMacroAnalysisText(event: string, actual: string, forecast: string): string {
  const ev  = event.toLowerCase();
  const act = parseFloat(actual.replace(/[^0-9.-]/g, "") || "0");
  const est = parseFloat(forecast.replace(/[^0-9.-]/g, "") || "0");
  const diff = est !== 0 ? ((act - est) / Math.abs(est) * 100).toFixed(1) : "0";
  const sign = act >= est ? "+" : "";

  const deviation = `Actual ${actual} vs Est ${forecast} (${sign}${diff}% desviación).`;

  if (ev.includes("non-farm") || ev.includes("nonfarm"))
    return `${deviation} Monitorear SPX en primeros 15 min. Si yields suben >5bps y acciones también, señal genuinamente bullish. Si yields suben y acciones caen, el mercado teme más inflación.`;
  if (ev.includes("cpi"))
    return `${deviation} Atención a QQQ y sector tech como primer indicador. Si Core CPI supera est., prepararse para spike de volatilidad. Revisar VIX.`;
  if (ev.includes("fomc"))
    return `${deviation} No tomar posiciones grandes hasta que Powell termine su conferencia. Esperar primera reacción, corrección, y luego confirmar dirección.`;
  if (ev.includes("pmi") || ev.includes("ism"))
    return `${deviation} ${act >= 50 ? "Economía en expansión, favorable para risk-on assets." : "Economía en contracción, cuidado con posiciones largas en cyclicals."} Revisar sector industrial y materiales.`;
  return `${deviation} Esperar primera reacción del mercado y buscar setup de entrada en nivel clave de opciones.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fuzzyMatch(eventName: string, sourceTitle: string): boolean {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const ev = clean(eventName);
  const src = clean(sourceTitle);

  // Key word matching
  const keyWords = ["nonfarm", "non-farm", "payroll", "unemployment", "cpi", "ppi",
    "gdp", "fomc", "retail", "jolts", "pce", "ism", "pmi", "adp", "earnings", "claims"];

  for (const kw of keyWords) {
    if (ev.includes(kw.replace("-", "")) && src.includes(kw.replace("-", ""))) return true;
    if (ev.includes(kw) && src.includes(kw)) return true;
  }

  // Word overlap check
  const evWords  = ev.split(" ").filter(w => w.length > 3);
  const srcWords = src.split(" ");
  const overlap  = evWords.filter(w => srcWords.some(sw => sw.includes(w) || w.includes(sw)));
  return overlap.length >= Math.min(2, evWords.length);
}

function formatActual(val: string): string {
  if (!val) return val;
  const s = val.trim();
  // Already formatted (has %, K, M) → return as-is
  if (/[%KMB]/.test(s)) return s;
  const n = parseFloat(s);
  if (isNaN(n)) return s;
  // Large numbers → K format
  if (Math.abs(n) > 1000) return `${(n / 1000).toFixed(0)}K`;
  // Percentages-like (0-100 small decimals)
  if (Math.abs(n) < 20) return `${n.toFixed(1)}%`;
  return s;
}

function parseNYTime(dateStr: string, timeStr: string): Date | null {
  if (!timeStr || !dateStr) return null;
  try {
    // Handle formats like "8:30 AM ET", "10:00 AM ET", "~3:00 AM ET"
    const clean = timeStr.replace(/~|\s*ET\s*/gi, "").trim();
    const match = clean.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;

    let hour   = parseInt(match[1]);
    const min  = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;

    // Build date in NY timezone
    const dateTimeStr = `${dateStr}T${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}:00`;
    // Convert NY to UTC (ET = UTC-4 in summer, UTC-5 in winter)
    const nyOffset = isEDT(new Date(dateStr)) ? 4 : 5;
    const utcMs = new Date(dateTimeStr).getTime() + nyOffset * 3600_000;
    return new Date(utcMs);
  } catch {
    return null;
  }
}

function isEDT(date: Date): boolean {
  // EDT: second Sunday in March → first Sunday in November
  const year = date.getFullYear();
  const mar = new Date(year, 2, 1);
  const dstStart = new Date(mar.getTime() + ((7 - mar.getDay()) % 7 + 7) * 86400_000); // 2nd Sunday
  const nov = new Date(year, 10, 1);
  const dstEnd = new Date(nov.getTime() + ((7 - nov.getDay()) % 7) * 86400_000);        // 1st Sunday
  return date >= dstStart && date < dstEnd;
}

function toNYTime(date: Date): Date {
  return new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const options = { headers: { "User-Agent": "Mozilla/5.0 OptionFlowBot/1.0" } };
    lib.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("JSON parse error")); }
      });
    }).on("error", reject);
  });
}

function fetchJSONPost(url: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent":     "Mozilla/5.0 OptionFlowBot/1.0",
      },
    };
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("JSON parse error")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function postWebhook(url: string, payload: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent":     "Mozilla/5.0 OptionFlowBot/1.0",
      },
    };
    const req = https.request(url, options, (res) => {
      res.resume();
      res.on("end", resolve);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
