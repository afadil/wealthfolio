import type { ActivityDetails } from "@wealthfolio/addon-sdk";

export const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function getEffectiveDateMs(a: ActivityDetails): number {
  // If saved with a pay-date override, the ex-date is stored in comment as "ex-date:YYYY-MM-DD"
  const match =
    typeof a.comment === "string" ? a.comment.match(/^ex-date:(\d{4}-\d{2}-\d{2})$/) : null;
  if (match) return new Date(match[1] + "T00:00:00").getTime();
  return new Date(a.date).getTime();
}

export function isDuplicate(
  symbol: string,
  dateMs: number,
  accountId: string,
  existing: ActivityDetails[],
): boolean {
  return existing.some((a) => {
    if ((a.assetSymbol ?? "").toUpperCase() !== symbol.toUpperCase()) return false;
    if (a.accountId !== accountId) return false;
    const actMs = getEffectiveDateMs(a);
    return Math.abs(actMs - dateMs) <= THREE_DAYS_MS;
  });
}
