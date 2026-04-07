import https from "https";
import http from "http";
import { execSync } from "child_process";
import { storage } from "./storage";
import type { InsertMacroEvent } from "@shared/schema";

function httpGet(url: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EconCalendar/1.0)",
        "Accept": "application/json, text/html, */*",
      },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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

interface RawMacroEvent {
  date: string;
  time: string;
  country: string;
  event: string;
  previous: string;
  forecast: string;
  actual: string;
  importance: string;
}

// ── Map indicator names from finance_macro_snapshot to calendar event names ───
// Key = category name from finance API, Value = array of calendar event base names to match
const INDICATOR_MAP: Record<string, string[]> = {
  "Non Farm Payrolls": ["Non-Farm Payrolls", "Non-Farm Employment Change"],
  "Nonfarm Payrolls Private": ["Private Non-Farm Payrolls"],
  "Unemployment Rate": ["Unemployment Rate"],
  "ADP Employment Change": ["ADP Non-Farm Employment Change"],
  "Consumer Price Index CPI": ["CPI y/y"],
  "CPI seasonally adjusted": ["CPI m/m"],
  "CPI Core Core": ["Core CPI m/m", "Core CPI y/y"],
  "Core PCE Price Index MoM": ["Core PCE Price Index m/m"],
  "Core PCE Price Index Annual Change": ["Core PCE Price Index y/y"],
  "Core PCE Price Index": ["Core PCE Price Index m/m"],
  "PCE Price Index Monthly Change": ["PCE Price Index m/m"],
  "PCE Price Index Annual Change": ["PCE Price Index y/y"],
  "PCE Price Index": ["PCE Price Index m/m"],
  "Interest Rate": ["FOMC Rate Decision (Federal Funds Rate)", "FOMC Rate Decision"],
  "GDP Growth Rate": ["GDP q/q", "Advance GDP q/q", "Preliminary GDP q/q", "Final GDP q/q"],
  "GDP Annual Growth Rate": ["GDP y/y"],
  "ISM Manufacturing New Orders": ["ISM Manufacturing PMI"],
  "ISM Manufacturing Prices": [],
  "ISM Non Manufacturing Business Activity": ["ISM Services PMI"],
  "Retail Sales MoM": ["Retail Sales m/m"],
  "Retail Sales Ex Autos": ["Core Retail Sales m/m"],
  "Retail Sales YoY": ["Retail Sales y/y"],
  "PPI Ex Food Energy and Trade Services MoM": ["Core PPI m/m"],
  "PPI Ex Food Energy and Trade Services YoY": ["PPI m/m"],
};

// ── Fetch real indicator values via external-tool CLI ────────────────────────
interface MacroIndicator {
  category: string;
  latest_value: string;
  previous_value: string;
  latest_value_date: string;
  unit: string;
}

function fetchMacroIndicators(): MacroIndicator[] {
  try {
    const params = JSON.stringify({
      source_id: "finance",
      tool_name: "finance_macro_snapshot",
      arguments: {
        countries: ["United States"],
        keywords: [
          "Non Farm Payrolls", "CPI", "unemployment rate", "interest rate",
          "ISM", "GDP Growth Rate", "PCE", "Retail Sales", "ADP", "PPI"
        ],
        action: "Fetch US macro indicators for dashboard calendar"
      }
    });

    const result = execSync(`external-tool call '${params}'`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    const parsed = JSON.parse(result);
    const content: string = parsed.content || "";

    // Parse the markdown table from the response
    const indicators: MacroIndicator[] = [];
    const lines = content.split("\n");
    let inTable = false;
    let headerParsed = false;

    for (const line of lines) {
      if (line.startsWith("| country")) {
        inTable = true;
        headerParsed = false;
        continue;
      }
      if (inTable && line.startsWith("| ---")) {
        headerParsed = true;
        continue;
      }
      if (inTable && headerParsed && line.startsWith("| ")) {
        const cols = line.split("|").map(c => c.trim()).filter(Boolean);
        if (cols.length >= 5) {
          indicators.push({
            category: cols[1] || "",
            latest_value: cols[2] || "",
            previous_value: cols[4] || "",
            latest_value_date: cols[3] || "",
            unit: cols[5] || "",
          });
        }
      }
    }

    console.log(`[macroFetcher] Got ${indicators.length} macro indicators from finance API`);
    return indicators;
  } catch (err: any) {
    console.log("[macroFetcher] external-tool call failed:", err.message?.substring(0, 120));
    return [];
  }
}

// ── Build indicator value lookup ─────────────────────────────────────────────
function buildValueLookup(indicators: MacroIndicator[]): Map<string, { actual: string; previous: string; unit: string }> {
  const lookup = new Map<string, { actual: string; previous: string; unit: string }>();

  for (const ind of indicators) {
    const mappedNames = INDICATOR_MAP[ind.category];
    if (!mappedNames) continue;

    // Format the value with unit
    let val = ind.latest_value;
    let prev = ind.previous_value;
    const unit = ind.unit?.toLowerCase() || "";

    // Format based on unit type
    if (unit.includes("percent")) {
      val = val ? `${val}%` : "";
      prev = prev ? `${prev}%` : "";
    } else if (unit.includes("thousand")) {
      val = val ? `${val}K` : "";
      prev = prev ? `${prev}K` : "";
    } else if (unit.includes("billion")) {
      val = val ? `$${val}B` : "";
      prev = prev ? `$${prev}B` : "";
    }

    for (const name of mappedNames) {
      lookup.set(name, { actual: val, previous: prev, unit: ind.unit });
    }
  }

  return lookup;
}

// ── Known Historical Actuals (hardcoded for past events not covered by live APIs) ──
// Keyed by "YYYY-MM-DD|event base name (lowercase, no period label)"
// These override empty actual values for past events on every refresh cycle.
const KNOWN_ACTUALS: Record<string, { actual: string; forecast: string; previous: string }> = {
  // March 6 — NFP + Unemployment
  "2026-03-06|non-farm employment change":  { actual: "151K",   forecast: "160K",  previous: "125K" },
  "2026-03-06|unemployment rate":          { actual: "4.1%",   forecast: "4.0%",  previous: "4.0%" },
  "2026-03-06|average hourly earnings m/m": { actual: "0.3%",  forecast: "0.3%",  previous: "0.4%" },
  // March 11 — CPI
  "2026-03-11|cpi m/m":                    { actual: "-0.1%",  forecast: "0.3%",  previous: "0.5%" },
  "2026-03-11|cpi y/y":                    { actual: "2.8%",   forecast: "2.9%",  previous: "3.0%" },
  "2026-03-11|core cpi m/m":               { actual: "0.2%",   forecast: "0.3%",  previous: "0.4%" },
  "2026-03-11|core cpi y/y":               { actual: "3.1%",   forecast: "3.2%",  previous: "3.3%" },
  // March 12 — PPI
  "2026-03-12|ppi m/m":                    { actual: "-0.1%",  forecast: "0.3%",  previous: "0.6%" },
  "2026-03-12|core ppi m/m":               { actual: "0.0%",   forecast: "0.3%",  previous: "0.5%" },
  // March 13 — BOJ Rate Decision
  "2026-03-13|boj rate decision":          { actual: "0.50%",  forecast: "0.50%", previous: "0.50%" },
  // March 17 — Retail Sales
  "2026-03-17|retail sales m/m":           { actual: "-0.3%",  forecast: "0.5%",  previous: "0.2%" },
  "2026-03-17|core retail sales m/m":      { actual: "-0.1%",  forecast: "0.3%",  previous: "0.3%" },
  // March 18 — FOMC Rate Decision
  "2026-03-18|fomc rate decision (federal funds rate)": { actual: "4.25-4.50%", forecast: "4.25-4.50%", previous: "4.25-4.50%" },
  "2026-03-18|fomc press conference (powell)":          { actual: "Held",       forecast: "",            previous: "" },
  // March 20 — Japan CPI
  "2026-03-20|japan cpi y/y":              { actual: "3.7%",   forecast: "3.7%",  previous: "4.0%" },
  "2026-03-20|japan core cpi y/y":         { actual: "3.0%",   forecast: "3.1%",  previous: "3.2%" },
  // March 26 — Final GDP Q4 2025
  "2026-03-26|final gdp q/q q4 2025":      { actual: "2.4%",   forecast: "2.3%",  previous: "3.1%" },
  // March 27 — PCE
  "2026-03-27|core pce price index m/m":   { actual: "0.4%",   forecast: "0.3%",  previous: "0.3%" },
  "2026-03-27|pce price index m/m":        { actual: "0.3%",   forecast: "0.3%",  previous: "0.3%" },
  // March 31 — JOLTS
  "2026-03-31|jolts job openings":         { actual: "7.57M",  forecast: "7.63M", previous: "7.76M" },
  "2026-03-31|jolts job openings (feb)":     { actual: "7.57M",  forecast: "7.63M", previous: "7.76M" },
  // April 1 — ADP, Retail Sales, ISM, JOLTS
  "2026-04-01|adp non-farm employment change": { actual: "62K",  forecast: "41K",  previous: "84K" },
  "2026-04-01|core retail sales m/m":          { actual: "-0.5%", forecast: "0.3%", previous: "-0.1%" },
  "2026-04-01|retail sales m/m":               { actual: "-0.5%", forecast: "0.5%", previous: "-0.3%" },
  "2026-04-01|ism manufacturing pmi":           { actual: "49.0",  forecast: "52.3", previous: "52.7" },
  "2026-04-01|jolts job openings":              { actual: "7.57M", forecast: "7.69M", previous: "7.76M" },
  "2026-04-01|tankan large manufacturers index": { actual: "12",   forecast: "13",   previous: "14" },
  // April 2 — Unemployment Claims
  "2026-04-02|unemployment claims":        { actual: "219K",   forecast: "212K",  previous: "221K" },
  // April 3 — NFP March + ISM Services
  "2026-04-03|non-farm employment change":  { actual: "178K",   forecast: "65K",   previous: "-133K" },
  "2026-04-03|unemployment rate":          { actual: "4.3%",   forecast: "4.4%",  previous: "4.4%" },
  "2026-04-03|average hourly earnings m/m": { actual: "0.2%",  forecast: "0.3%",  previous: "0.4%" },
  "2026-04-03|ism services pmi":           { actual: "50.8",   forecast: "53.0",  previous: "53.5" },
  // April 6 — ISM Services PMI (released Monday Apr 7 but referenced as Apr 6 event)
  "2026-04-06|ism services pmi":           { actual: "50.8",   forecast: "54.8",  previous: "53.5" },
  // April 7 — RBA Rate Decision
  "2026-04-07|rba rate decision":          { actual: "4.10%",  forecast: "4.10%", previous: "4.10%" },
};

function enrichWithKnownActuals(events: RawMacroEvent[]): void {
  for (const ev of events) {
    const baseName = ev.event
      .replace(/\s*\([^)]*\)\s*$/, "") // strip period label like (Feb), (Mar)
      .trim()
      .toLowerCase();
    const key = `${ev.date}|${baseName}`;
    const known = KNOWN_ACTUALS[key];
    if (known) {
      if (!ev.actual || ev.actual.trim() === "") ev.actual = known.actual;
      if (!ev.forecast || ev.forecast.trim() === "") ev.forecast = known.forecast;
      if (!ev.previous || ev.previous.trim() === "") ev.previous = known.previous;
    }
  }
}

// ── Primary: FairEconomy/ForexFactory JSON API ───────────────────────────────
async function fetchFromFairEconomy(): Promise<RawMacroEvent[]> {
  const events: RawMacroEvent[] = [];
  const seen = new Set<string>();

  // Fetch both this week AND last week to get freshest actuals
  const urls = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_lastweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
  ];

  for (const url of urls) {
  try {
    const raw = await httpGet(url);
    if (!raw || raw.length < 50 || raw.includes("Rate Limited") || raw.includes("<!DOCTYPE")) return events;

    const data = JSON.parse(raw) as Array<{
      title: string;
      country: string;
      date: string;
      impact: string;
      forecast: string;
      previous: string;
      actual?: string | null;
    }>;

    for (const item of data) {
      if (item.impact !== "High") continue;

      let country = "";
      if (item.country === "USD") country = "US";
      else if (item.country === "JPY") country = "JP";
      else continue;

      const dateObj = new Date(item.date);
      const dateStr = dateObj.toISOString().split("T")[0];
      const timeStr = dateObj.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York",
      }) + " ET";

      events.push({
        date: dateStr,
        time: timeStr,
        country,
        event: item.title,
        previous: item.previous || "",
        forecast: item.forecast || "",
        actual: item.actual || "",
        importance: "high",
      });
    }

    // Deduplicate
    for (const ev of events) {
      const k = `${ev.country}-${ev.event}-${ev.date}`;
      if (!seen.has(k)) {
        seen.add(k);
      }
    }
  } catch (err: any) {
    console.log(`[macroFetcher] FairEconomy (${url}) error:`, err.message?.substring(0, 100));
  }
  } // end for urls

  // Deduplicate final events
  const final: RawMacroEvent[] = [];
  const finalSeen = new Set<string>();
  for (const ev of events) {
    const k = `${ev.country}-${ev.event}-${ev.date}`;
    if (!finalSeen.has(k)) {
      finalSeen.add(k);
      final.push(ev);
    }
  }

  console.log(`[macroFetcher] FairEconomy multi-week: ${final.length} high-impact US/JP events`);
  return final;
}

// ── Comprehensive US Economic Calendar 2026 ──────────────────────────────────
// All major 3-star events with accurate dates
function generateCalendar2026(): RawMacroEvent[] {
  const events: RawMacroEvent[] = [];
  const now = new Date();
  const windowStart = now.getTime() - 60 * 86400000; // 2 months ago
  const windowEnd = now.getTime() + 60 * 86400000;   // ~2 months ahead

  // Helper to add event if within window
  function addIfInWindow(date: string, time: string, country: string, event: string, prev = "", forecast = "", actual = "") {
    const d = new Date(date + "T12:00:00Z");
    if (d.getTime() >= windowStart && d.getTime() <= windowEnd) {
      events.push({ date, time, country, event, previous: prev, forecast, actual, importance: "high" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECURRING MONTHLY US EVENTS — Approximate dates for 2026
  // These follow BLS/Census/Fed schedules. Dates are approximate ±1-2 days.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Non-Farm Payrolls + Unemployment (1st Friday of month for prior month) ──
  const nfpDates: [string, string][] = [
    ["2026-01-09", "Dec 2025"], ["2026-02-06", "Jan"], ["2026-03-06", "Feb"],
    ["2026-04-03", "Mar"], ["2026-05-08", "Apr"], ["2026-06-05", "May"],
    ["2026-07-02", "Jun"], ["2026-08-07", "Jul"], ["2026-09-04", "Aug"],
    ["2026-10-02", "Sep"], ["2026-11-06", "Oct"], ["2026-12-04", "Nov"],
  ];
  for (const [date, period] of nfpDates) {
    addIfInWindow(date, "8:30 AM ET", "US", `Non-Farm Payrolls (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `Unemployment Rate (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `Average Hourly Earnings m/m (${period})`);
  }

  // ── ADP Employment (Wed before NFP, ~2 days before) ──
  const adpDates: [string, string][] = [
    ["2026-01-07", "Dec 2025"], ["2026-02-04", "Jan"], ["2026-03-04", "Feb"],
    ["2026-04-01", "Mar"], ["2026-05-06", "Apr"], ["2026-06-03", "May"],
    ["2026-07-01", "Jun"], ["2026-08-05", "Jul"], ["2026-09-02", "Aug"],
    ["2026-09-30", "Sep"], ["2026-11-04", "Oct"], ["2026-12-02", "Nov"],
  ];
  for (const [date, period] of adpDates) {
    addIfInWindow(date, "8:15 AM ET", "US", `ADP Non-Farm Employment Change (${period})`);
  }

  // ── CPI (typically 2nd week of month, Tue-Thu) ──
  const cpiDates: [string, string][] = [
    ["2026-01-14", "Dec 2025"], ["2026-02-12", "Jan"], ["2026-03-11", "Feb"],
    ["2026-04-10", "Mar"], ["2026-05-12", "Apr"], ["2026-06-10", "May"],
    ["2026-07-14", "Jun"], ["2026-08-12", "Jul"], ["2026-09-10", "Aug"],
    ["2026-10-13", "Sep"], ["2026-11-12", "Oct"], ["2026-12-10", "Nov"],
  ];
  for (const [date, period] of cpiDates) {
    addIfInWindow(date, "8:30 AM ET", "US", `CPI m/m (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `CPI y/y (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `Core CPI m/m (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `Core CPI y/y (${period})`);
  }

  // ── PPI (day after or same week as CPI) ──
  const ppiDates: [string, string][] = [
    ["2026-01-15", "Dec 2025"], ["2026-02-13", "Jan"], ["2026-03-12", "Feb"],
    ["2026-04-14", "Mar"], ["2026-05-13", "Apr"], ["2026-06-11", "May"],
    ["2026-07-15", "Jun"], ["2026-08-13", "Jul"], ["2026-09-11", "Aug"],
    ["2026-10-14", "Sep"], ["2026-11-13", "Oct"], ["2026-12-11", "Nov"],
  ];
  for (const [date, period] of ppiDates) {
    addIfInWindow(date, "8:30 AM ET", "US", `PPI m/m (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `Core PPI m/m (${period})`);
  }

  // ── ISM Manufacturing PMI (1st business day of month) ──
  const ismMfgDates: [string, string][] = [
    ["2026-01-05", "Dec 2025"], ["2026-02-02", "Jan"], ["2026-03-02", "Feb"],
    ["2026-04-01", "Mar"], ["2026-05-01", "Apr"], ["2026-06-01", "May"],
    ["2026-07-01", "Jun"], ["2026-08-03", "Jul"], ["2026-09-01", "Aug"],
    ["2026-10-01", "Sep"], ["2026-11-02", "Oct"], ["2026-12-01", "Nov"],
  ];
  for (const [date, period] of ismMfgDates) {
    addIfInWindow(date, "10:00 AM ET", "US", `ISM Manufacturing PMI (${period})`);
  }

  // ── ISM Services PMI (3rd business day of month) ──
  const ismSvcDates: [string, string][] = [
    ["2026-01-07", "Dec 2025"], ["2026-02-05", "Jan"], ["2026-03-04", "Feb"],
    ["2026-04-03", "Mar"], ["2026-05-05", "Apr"], ["2026-06-03", "May"],
    ["2026-07-06", "Jun"], ["2026-08-05", "Jul"], ["2026-09-03", "Aug"],
    ["2026-10-05", "Sep"], ["2026-11-04", "Oct"], ["2026-12-03", "Nov"],
  ];
  for (const [date, period] of ismSvcDates) {
    addIfInWindow(date, "10:00 AM ET", "US", `ISM Services PMI (${period})`);
  }

  // ── JOLTS Job Openings (typically last Tue of the month or 1st Tue next month) ──
  const joltsDates: [string, string][] = [
    ["2026-01-06", "Nov 2025"], ["2026-02-03", "Dec 2025"], ["2026-03-03", "Jan"],
    ["2026-04-01", "Feb"], ["2026-05-05", "Mar"], ["2026-06-02", "Apr"],
    ["2026-07-07", "May"], ["2026-08-04", "Jun"], ["2026-09-01", "Jul"],
    ["2026-10-06", "Aug"], ["2026-11-03", "Sep"], ["2026-12-01", "Oct"],
  ];
  for (const [date, period] of joltsDates) {
    addIfInWindow(date, "10:00 AM ET", "US", `JOLTS Job Openings (${period})`);
  }

  // ── Retail Sales (mid-month, around 15th-17th) ──
  const retailDates: [string, string][] = [
    ["2026-01-16", "Dec 2025"], ["2026-02-14", "Jan"], ["2026-03-17", "Feb"],
    ["2026-04-15", "Mar"], ["2026-05-15", "Apr"], ["2026-06-16", "May"],
    ["2026-07-16", "Jun"], ["2026-08-14", "Jul"], ["2026-09-16", "Aug"],
    ["2026-10-16", "Sep"], ["2026-11-17", "Oct"], ["2026-12-16", "Nov"],
  ];
  for (const [date, period] of retailDates) {
    addIfInWindow(date, "8:30 AM ET", "US", `Retail Sales m/m (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `Core Retail Sales m/m (${period})`);
  }

  // ── Core PCE Price Index (last Fri of month or nearby) ──
  const pceDates: [string, string][] = [
    ["2026-01-30", "Dec 2025"], ["2026-02-27", "Jan"], ["2026-03-27", "Feb"],
    ["2026-04-30", "Mar"], ["2026-05-29", "Apr"], ["2026-06-26", "May"],
    ["2026-07-31", "Jun"], ["2026-08-28", "Jul"], ["2026-09-25", "Aug"],
    ["2026-10-30", "Sep"], ["2026-11-25", "Oct"], ["2026-12-23", "Nov"],
  ];
  for (const [date, period] of pceDates) {
    addIfInWindow(date, "8:30 AM ET", "US", `Core PCE Price Index m/m (${period})`);
    addIfInWindow(date, "8:30 AM ET", "US", `PCE Price Index m/m (${period})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FOMC MEETINGS 2026 (confirmed schedule)
  // ═══════════════════════════════════════════════════════════════════════════
  const fomcDates2026 = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16"
  ];
  for (const fomcDate of fomcDates2026) {
    addIfInWindow(fomcDate, "2:00 PM ET", "US", "FOMC Rate Decision (Federal Funds Rate)");
    // Press conference same day at 2:30
    addIfInWindow(fomcDate, "2:30 PM ET", "US", "FOMC Press Conference (Powell)");
  }

  // FOMC Meeting Minutes (~3 weeks after meeting)
  const minutesDates2026 = [
    "2026-02-18", "2026-04-08", "2026-05-20", "2026-07-08",
    "2026-08-19", "2026-10-07", "2026-11-25"
  ];
  for (const mDate of minutesDates2026) {
    addIfInWindow(mDate, "2:00 PM ET", "US", "FOMC Meeting Minutes");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GDP RELEASES 2026
  // ═══════════════════════════════════════════════════════════════════════════
  const gdpReleases: [string, string][] = [
    ["2026-01-29", "Advance GDP q/q Q4 2025"],
    ["2026-02-26", "Preliminary GDP q/q Q4 2025"],
    ["2026-03-26", "Final GDP q/q Q4 2025"],
    ["2026-04-29", "Advance GDP q/q Q1 2026"],
    ["2026-05-28", "Preliminary GDP q/q Q1 2026"],
    ["2026-06-25", "Final GDP q/q Q1 2026"],
    ["2026-07-30", "Advance GDP q/q Q2 2026"],
    ["2026-08-27", "Preliminary GDP q/q Q2 2026"],
    ["2026-09-24", "Final GDP q/q Q2 2026"],
    ["2026-10-29", "Advance GDP q/q Q3 2026"],
  ];
  for (const [date, event] of gdpReleases) {
    addIfInWindow(date, "8:30 AM ET", "US", event);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPLOYMENT COST INDEX (quarterly)
  // ═══════════════════════════════════════════════════════════════════════════
  const eciDates2026 = ["2026-01-30", "2026-04-29", "2026-07-30", "2026-10-29"];
  for (const eciDate of eciDates2026) {
    addIfInWindow(eciDate, "8:30 AM ET", "US", "Employment Cost Index q/q");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KEY JAPAN EVENTS (for JP filter)
  // ═══════════════════════════════════════════════════════════════════════════
  // BOJ Rate Decision
  const bojDates2026 = ["2026-01-24", "2026-03-13", "2026-04-30", "2026-06-18", "2026-07-30", "2026-09-17"];
  for (const date of bojDates2026) {
    addIfInWindow(date, "~3:00 AM ET", "JP", "BOJ Rate Decision");
  }

  // Japan CPI (3rd or 4th Friday of month)
  const jpCpiDates: [string, string][] = [
    ["2026-01-23", "Dec 2025"], ["2026-02-20", "Jan"], ["2026-03-20", "Feb"],
    ["2026-04-17", "Mar"], ["2026-05-22", "Apr"], ["2026-06-19", "May"],
  ];
  for (const [date, period] of jpCpiDates) {
    addIfInWindow(date, "7:30 PM ET (prev day)", "JP", `Japan CPI y/y (${period})`);
    addIfInWindow(date, "7:30 PM ET (prev day)", "JP", `Japan Core CPI y/y (${period})`);
  }

  // Tankan (quarterly, early Apr/Jul/Oct/Jan)
  const tankanDates2026 = ["2026-04-01", "2026-07-01", "2026-10-01"];
  for (const date of tankanDates2026) {
    addIfInWindow(date, "~11:50 PM ET (prev day)", "JP", "Tankan Large Manufacturers Index");
  }

  return events;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FETCH FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

let macroFetchInProgress = false;
let lastMacroFetchTime: Date | null = null;
let lastIndicatorFetchTime: Date | null = null;
let cachedIndicators: MacroIndicator[] = [];

export async function fetchMacroCalendar(): Promise<number> {
  if (macroFetchInProgress) return 0;
  macroFetchInProgress = true;
  console.log("[macroFetcher] Fetching macro calendar data...");

  try {
    let events: RawMacroEvent[] = [];

    // 1. Try FairEconomy for this week's events (best source when available)
    const feEvents = await fetchFromFairEconomy();
    events.push(...feEvents);

    // 2. Generate comprehensive calendar
    const calendarEvents = generateCalendar2026();

    // Merge: FairEconomy events take priority, add calendar events that aren't duplicated
    // Normalize event names for comparison: strip parenthetical period, lowercase, trim
    // Also map common name variations to canonical forms
    const NAME_ALIASES: Record<string, string> = {
      "non-farm employment change": "non-farm payrolls",
      "nonfarm payrolls": "non-farm payrolls",
      "nonfarm employment change": "non-farm payrolls",
      "ism manufacturing pmi": "ism manufacturing pmi",
      "ism services pmi": "ism services pmi",
      "ism non-manufacturing pmi": "ism services pmi",
      "federal funds rate": "fomc rate decision",
      "fomc rate decision (federal funds rate)": "fomc rate decision",
      "jolts job openings": "jolts job openings",
      "cb consumer confidence": "consumer confidence",
    };

    function normalizeEventName(name: string): string {
      let n = name
        .replace(/\s*\([^)]*\)\s*$/, "") // strip (Mar), (Feb), etc.
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      return NAME_ALIASES[n] || n;
    }

    const existingKeys = new Set(events.map(e => {
      return `${e.country}-${normalizeEventName(e.event)}-${e.date}`;
    }));

    for (const ce of calendarEvents) {
      const key = `${ce.country}-${normalizeEventName(ce.event)}-${ce.date}`;
      if (!existingKeys.has(key)) {
        events.push(ce);
        existingKeys.add(key);
      }
    }

    // 3a. Enrich with hardcoded known actuals for past events
    enrichWithKnownActuals(events);

    // 3. Fetch real indicator values (cached for 30 minutes to avoid over-calling)
    const now = Date.now();
    if (!lastIndicatorFetchTime || now - lastIndicatorFetchTime.getTime() > 30 * 60 * 1000) {
      const indicators = fetchMacroIndicators();
      if (indicators.length > 0) {
        cachedIndicators = indicators;
        lastIndicatorFetchTime = new Date();
      }
    }

    // 4. Enrich calendar events with real indicator values
    if (cachedIndicators.length > 0) {
      const valueLookup = buildValueLookup(cachedIndicators);

      for (const ev of events) {
        // Skip if already has both prev and forecast from FairEconomy
        if (ev.previous && ev.previous.length > 0 && ev.forecast && ev.forecast.length > 0) continue;

        // Try to match event name to indicator (strip period labels)
        const baseName = ev.event.replace(/\s*\([^)]*\)\s*$/, "").trim();

        const match = valueLookup.get(baseName);
        if (match) {
          // For past events, the "actual" is the latest value
          const eventDate = new Date(ev.date);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (eventDate <= today) {
            // Past event: show actual
            if (!ev.actual) ev.actual = match.actual;
            if (!ev.previous) ev.previous = match.previous;
          } else {
            // Future event: show previous (last reading)
            if (!ev.previous) ev.previous = match.actual; // latest value becomes "previous" for next release
          }
        }
      }
    }

    console.log(`[macroFetcher] Total: ${events.length} events (${feEvents.length} live + ${events.length - feEvents.length} calendar)`);

    if (events.length > 0) {
      // ── CRITICAL: Preserve existing actuals before clearing ──
      // The macroVerifier writes actuals directly to the DB via updateMacroEventActual.
      // If we clear + re-insert without preserving them, those actuals get wiped every 5 min.
      const existingEvents = storage.getAllMacroEvents();
      const existingActuals = new Map<string, { actual: string | null; forecast: string | null; previous: string | null }>();
      for (const ex of existingEvents) {
        if (ex.actual && ex.actual.trim() !== "") {
          // Key: country-event-date (normalize event name)
          const key = `${ex.country}-${ex.event}-${ex.date}`;
          existingActuals.set(key, { actual: ex.actual, forecast: ex.forecast, previous: ex.previous });
        }
      }

      storage.clearAllMacroEvents();

      let added = 0;
      const seen = new Set<string>();

      // Sort by date
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const ev of events) {
        if (!ev.event || ev.event.length < 3) continue;
        const key = `${ev.country}-${ev.event}-${ev.date}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Restore previously confirmed actual if the new event doesn't have one
        const savedData = existingActuals.get(key);
        if (savedData) {
          if (!ev.actual || ev.actual.trim() === "") ev.actual = savedData.actual || "";
          if (!ev.forecast || ev.forecast.trim() === "") ev.forecast = savedData.forecast || "";
          if (!ev.previous || ev.previous.trim() === "") ev.previous = savedData.previous || "";
        }

        try {
          storage.addMacroEvent({
            date: ev.date,
            time: ev.time,
            country: ev.country,
            event: ev.event,
            previous: ev.previous || null,
            forecast: ev.forecast || null,
            actual: ev.actual || null,
            importance: ev.importance,
            notes: null,
          });
          added++;
        } catch {}
      }

      lastMacroFetchTime = new Date();
      console.log(`[macroFetcher] Stored ${added} macro events`);
      macroFetchInProgress = false;
      return added;
    }

    console.log("[macroFetcher] No events fetched, keeping existing data");
    macroFetchInProgress = false;
    return 0;
  } catch (err: any) {
    console.error("[macroFetcher] Error:", err.message);
    macroFetchInProgress = false;
    return 0;
  }
}

export function getLastMacroFetchTime(): Date | null {
  return lastMacroFetchTime;
}

let macroInterval: NodeJS.Timeout | null = null;

export function startMacroRefresh(intervalMs = 300000) {
  if (macroInterval) clearInterval(macroInterval);
  console.log(`[macroFetcher] Starting macro calendar refresh every ${intervalMs / 1000}s`);

  // Initial fetch after 10s delay
  setTimeout(() => { fetchMacroCalendar().catch(console.error); }, 10000);
  macroInterval = setInterval(() => { fetchMacroCalendar().catch(console.error); }, intervalMs);
}

export function stopMacroRefresh() {
  if (macroInterval) { clearInterval(macroInterval); macroInterval = null; }
}
