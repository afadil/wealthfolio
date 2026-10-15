import type { ActivityDetails } from "@/lib/types";
import { toDateKey } from "@/pages/account/cash-audit";

/**
 * Ids of the rows whose balance the list shows. A row balance shows on its
 * row. A day-end balance, which every posted row of the day carries, shows
 * once: on the day's latest row.
 */
export function shownCashBalanceIds(activities: ActivityDetails[], timezone?: string): Set<string> {
  const shown = new Set<string>();
  const latestOfDay = new Map<string, ActivityDetails>();
  for (const activity of activities) {
    if (activity.cashBalance == null) continue;
    if (activity.cashBalanceScope !== "DAY") {
      shown.add(activity.id);
      continue;
    }
    const day = `${activity.accountId}|${toDateKey(activity.date, timezone)}`;
    const latest = latestOfDay.get(day);
    if (!latest || new Date(activity.date).getTime() > new Date(latest.date).getTime()) {
      latestOfDay.set(day, activity);
    }
  }
  for (const activity of latestOfDay.values()) {
    shown.add(activity.id);
  }
  return shown;
}
