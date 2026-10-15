import type { ActivityDetails } from "@/lib/types";
import { toDateKey } from "@/pages/account/cash-audit";

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

/**
 * A row's stored timestamp read as the backend reads it (core's
 * `parse_stored_instant`): a bare date is midnight UTC and SQLite's
 * `YYYY-MM-DD HH:MM:SS[.fff]` is UTC, where `Date` would read either as local
 * time and put the row on another day than its balance.
 */
function storedInstant(value: unknown): Date {
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (BARE_DATE.test(text)) return new Date(`${text}T00:00:00Z`);
  if (SQLITE_TIMESTAMP.test(text)) return new Date(`${text.replace(" ", "T")}Z`);
  return new Date(text);
}

/**
 * A timestamp's fraction of a second past the millisecond, which `Date`
 * drops: up to six digits, padded so two compare as text.
 */
function beyondMillis(value: unknown): string {
  return (/\.\d{3}(\d{1,6})/.exec(String(value))?.[1] ?? "").padEnd(6, "0");
}

/**
 * Whether `a` comes after `b` in the engine's application order, which the
 * search's date sort follows: timestamp, then created_at, then id. Date-only
 * imports share a timestamp, so the tie-breaks decide the day's last row.
 */
function appliedAfter(a: ActivityDetails, b: ActivityDetails): boolean {
  const byInstant = storedInstant(a.date).getTime() - storedInstant(b.date).getTime();
  if (byInstant !== 0) return byInstant > 0;
  const aBeyondMillis = beyondMillis(a.date);
  const bBeyondMillis = beyondMillis(b.date);
  if (aBeyondMillis !== bBeyondMillis) return aBeyondMillis > bBeyondMillis;
  // The stored text the search orders by.
  const aCreated = String(a.createdAt);
  const bCreated = String(b.createdAt);
  if (aCreated !== bCreated) return aCreated > bCreated;
  return a.id > b.id;
}

/**
 * Ids of the rows whose balance the list shows. A row balance shows on its
 * row. A day-end balance, which every posted row of the day carries, shows
 * once: on the day's last row in application order.
 *
 * `hasMoreRows` says further pages may follow. Newest first, a day's last
 * row comes first, so it is always loaded; oldest first, the last loaded day
 * may continue on the next page, so its balance waits for that page.
 */
export function shownCashBalanceIds(
  activities: ActivityDetails[],
  timezone?: string,
  hasMoreRows = false,
): Set<string> {
  const first = activities[0];
  const last = activities[activities.length - 1];
  const unfinishedDay =
    hasMoreRows && first && last && appliedAfter(last, first)
      ? toDateKey(storedInstant(last.date), timezone)
      : null;

  const shown = new Set<string>();
  const lastOfDay = new Map<string, ActivityDetails>();
  for (const activity of activities) {
    if (activity.cashBalance == null) continue;
    if (activity.cashBalanceScope !== "DAY") {
      shown.add(activity.id);
      continue;
    }
    const dayKey = toDateKey(storedInstant(activity.date), timezone);
    if (dayKey === unfinishedDay) continue;
    const day = `${activity.accountId}|${dayKey}`;
    const lastSoFar = lastOfDay.get(day);
    if (!lastSoFar || appliedAfter(activity, lastSoFar)) {
      lastOfDay.set(day, activity);
    }
  }
  for (const activity of lastOfDay.values()) {
    shown.add(activity.id);
  }
  return shown;
}
