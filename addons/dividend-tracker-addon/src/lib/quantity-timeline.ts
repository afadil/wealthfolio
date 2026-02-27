import type { ActivityDetails } from "@wealthfolio/addon-sdk";

/** Activity types that affect share quantity in a position */
export const POSITION_ACTIVITY_TYPES = ["BUY", "SELL", "SPLIT", "TRANSFER_IN", "TRANSFER_OUT"];

export interface QuantityCheckpoint {
  date: string; // YYYY-MM-DD
  quantity: number;
}

/**
 * Builds a running quantity timeline from position-affecting activities.
 * Activities must be sorted ascending by date.
 */
export function buildQuantityTimeline(
  activities: ActivityDetails[],
  accountId: string,
): QuantityCheckpoint[] {
  const checkpoints: QuantityCheckpoint[] = [];
  let quantity = 0;

  for (const a of activities) {
    if (a.accountId !== accountId) continue;

    const date = new Date(a.date).toISOString().slice(0, 10);
    const qty = parseFloat(a.quantity ?? "0");
    const amt = parseFloat(a.amount ?? "0");

    switch (a.activityType) {
      case "BUY":
      case "TRANSFER_IN":
        quantity += qty;
        break;
      case "SELL":
      case "TRANSFER_OUT":
        quantity -= qty;
        break;
      case "SPLIT":
        // amount field holds the split ratio (e.g. 4 for a 4:1 split)
        if (amt > 0) quantity *= amt;
        break;
    }

    checkpoints.push({ date, quantity: Math.max(0, quantity) });
  }

  return checkpoints;
}

/**
 * Returns the quantity held at (just before) a given date from the timeline.
 * If no activity exists before the date, returns 0.
 */
export function getQuantityAtDate(timeline: QuantityCheckpoint[], targetDate: string): number {
  if (timeline.length === 0) return 0;

  // Binary search for the last checkpoint at or before targetDate
  let lo = 0;
  let hi = timeline.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (timeline[mid].date <= targetDate) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result >= 0 ? timeline[result].quantity : 0;
}
