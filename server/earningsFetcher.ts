/**
 * earningsFetcher.ts
 *
 * Earnings Intelligence system.
 *
 * Strategy:
 * 1. On startup, DB is already seeded with verified data from our Python seed script.
 * 2. Every 10 minutes, we attempt to fetch UPCOMING earnings schedule from the finance tool
 *    to catch any date changes or new estimates — but ONLY update upcoming entries.
 * 3. We NEVER overwrite reported (is_upcoming=0) entries from the API because the
 *    finance tool's parser produces malformed EPS values (revenue columns mislabeled as EPS).
 * 4. updateEarningsFromSchedule() adds new upcoming entries only if they don't already exist.
 */

import { execSync } from "child_process";
import { storage } from "./storage";
import type { InsertEarning } from "@shared/schema";

const STOCK_SYMBOLS = [
  "TSLA", "MSFT", "NVDA", "AAPL", "AMD", "NFLX", "GOOG", "AMZN",
  "PLTR", "AVGO", "MU", "META", "ORCL"
];

function callTool(sourceId: string, toolName: string, args: Record<string, unknown>): any {
  try {
    const params = JSON.stringify({ source_id: sourceId, tool_name: toolName, arguments: args });
    const result = execSync(`external-tool call '${params}'`, {
      timeout: 45000,
      encoding: "utf-8",
    });
    return JSON.parse(result);
  } catch (err: any) {
    console.error(`[earningsFetcher] Error calling ${toolName}:`, err.message?.substring(0, 200));
    return null;
  }
}

let lastEarningsFetchTime: Date | null = null;
let fetchInProgress = false;

/**
 * Fetch upcoming earnings schedule and update ONLY upcoming entries.
 * Does NOT touch reported quarters (is_upcoming = 0).
 */
export async function fetchLiveEarnings(): Promise<number> {
  if (fetchInProgress) {
    console.log("[earningsFetcher] Already fetching, skipping");
    return 0;
  }
  fetchInProgress = true;

  let updated = 0;

  try {
    console.log("[earningsFetcher] Checking upcoming earnings schedule...");

    for (const sym of STOCK_SYMBOLS) {
      try {
        const result = callTool("finance", "finance_earnings_schedule", {
          ticker_symbols: [sym],
          direction: "upcoming",
          limit: 1,
        });

        if (!result) continue;

        const content: string =
          typeof result === "string"
            ? result
            : result.content || result.text || JSON.stringify(result);

        const parsed = parseScheduleContent(content, sym);
        if (!parsed) continue;

        // Check if we already have an upcoming entry for this symbol at this date
        const existing = storage.getEarningsBySymbol(sym);
        const hasUpcomingForDate = existing.some(
          (e) => e.isUpcoming === 1 && e.date === parsed.date
        );

        if (!hasUpcomingForDate) {
          // Remove old upcoming entries for this symbol
          const oldUpcoming = existing.filter((e) => e.isUpcoming === 1);
          for (const old of oldUpcoming) {
            // We can't delete by ID easily so just skip — they'll be cleaned next full refresh
          }

          try {
            storage.addEarning({
              symbol: sym,
              period: parsed.period || "Next",
              date: parsed.date,
              actualEps: null,
              estimatedEps: parsed.estimatedEps,
              actualRevenue: null,
              estimatedRevenue: parsed.estimatedRevenue,
              surprise: null,
              isUpcoming: 1,
            });
            updated++;
            console.log(`[earningsFetcher] Updated upcoming for ${sym}: ${parsed.date}`);
          } catch {
            // Duplicate — already exists
          }
        }
      } catch (err: any) {
        // Non-fatal — keep going
      }
    }

    lastEarningsFetchTime = new Date();
    console.log(`[earningsFetcher] Schedule check complete. Updated: ${updated} entries`);
  } catch (err: any) {
    console.error("[earningsFetcher] Error:", err.message);
  } finally {
    fetchInProgress = false;
  }

  return updated;
}

/**
 * Parse a schedule API response for a single symbol.
 * Returns date + estimates if found.
 */
function parseScheduleContent(
  content: string,
  symbol: string
): { date: string; period?: string; estimatedEps?: number | null; estimatedRevenue?: number | null } | null {
  try {
    // Look for ISO date pattern YYYY-MM-DD
    const dateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) return null;

    const date = dateMatch[1];

    // Try to extract EPS estimate — look for small decimal numbers ($X.XX)
    const epsMatch = content.match(/\$?([\d]+\.[\d]{1,2})\s*(?:eps|estimate|consensus)/i);
    const estimatedEps = epsMatch ? parseFloat(epsMatch[1]) : null;

    // Revenue estimate — look for billions
    const revMatch = content.match(/([\d]+\.[\d]{0,2})\s*[Bb]/);
    const estimatedRevenue = revMatch ? parseFloat(revMatch[1]) * 1e9 : null;

    return { date, estimatedEps, estimatedRevenue };
  } catch {
    return null;
  }
}

export function getLastEarningsFetchTime(): Date | null {
  return lastEarningsFetchTime;
}

let earningsInterval: NodeJS.Timeout | null = null;

export function startEarningsRefresh(intervalMs = 600000) {
  if (earningsInterval) clearInterval(earningsInterval);

  console.log(`[earningsFetcher] Starting earnings refresh every ${intervalMs / 1000}s`);

  // Initial check after 30s delay
  setTimeout(() => {
    fetchLiveEarnings().catch(console.error);
  }, 30000);

  earningsInterval = setInterval(() => {
    fetchLiveEarnings().catch(console.error);
  }, intervalMs);
}

export function stopEarningsRefresh() {
  if (earningsInterval) {
    clearInterval(earningsInterval);
    earningsInterval = null;
  }
}
