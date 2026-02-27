import type { ActivityDetails } from "@wealthfolio/addon-sdk";

export const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function isDuplicate(
  symbol: string,
  dateMs: number,
  accountId: string,
  existing: ActivityDetails[],
): boolean {
  return existing.some((a) => {
    if ((a.assetSymbol ?? "").toUpperCase() !== symbol.toUpperCase()) return false;
    if (a.accountId !== accountId) return false;
    const actMs = new Date(a.date).getTime();
    return Math.abs(actMs - dateMs) <= THREE_DAYS_MS;
  });
}
