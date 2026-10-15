import type { ActivityDetails } from "@/lib/types";
import { toDateKey } from "@/pages/account/cash-audit";

/**
 * Whether `a` comes after `b` in the engine's application order, which the
 * search's date sort follows: timestamp, then created_at, then id. Date-only
 * imports share a timestamp, so the tie-breaks decide the day's last row.
 */
function appliedAfter(a: ActivityDetails, b: ActivityDetails): boolean {
  const byInstant = new Date(a.date).getTime() - new Date(b.date).getTime();
  if (byInstant !== 0) return byInstant > 0;
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
 */
export function shownCashBalanceIds(activities: ActivityDetails[], timezone?: string): Set<string> {
  const shown = new Set<string>();
  const lastOfDay = new Map<string, ActivityDetails>();
  for (const activity of activities) {
    if (activity.cashBalance == null) continue;
    if (activity.cashBalanceScope !== "DAY") {
      shown.add(activity.id);
      continue;
    }
    const day = `${activity.accountId}|${toDateKey(activity.date, timezone)}`;
    const last = lastOfDay.get(day);
    if (!last || appliedAfter(activity, last)) {
      lastOfDay.set(day, activity);
    }
  }
  for (const activity of lastOfDay.values()) {
    shown.add(activity.id);
  }
  return shown;
}
