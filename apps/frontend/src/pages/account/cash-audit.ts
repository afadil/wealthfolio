import { calculateActivityCashImpact } from "@/lib/activity-utils";
import type { AccountValuation, ActivityDetails } from "@/lib/types";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface CashAuditLedgerRow {
  activity: ActivityDetails;
  cashImpact: number;
  dateKey: string;
  runningBalance?: number;
  crossesNegative: boolean;
}

export interface CashAuditReviewTarget {
  valuationDate: string;
  activityDate: string;
  endingCashBalance: number;
  cashCurrency: string;
  firstNegativeCashBalance: number;
  crossingActivityId?: string;
  hasExplainingActivity: boolean;
  isCarryForwardDate: boolean;
}

export interface CashAuditNegativeRun {
  firstNegativeValuation: AccountValuation;
  previousNonNegativeValuation: AccountValuation | null;
}

export function toDateKey(
  value: Date | string | null | undefined,
  timezone?: string,
): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatDateInTimezone(value, timezone) || null;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const datePart = trimmed.split("T")[0];
  if (DATE_KEY_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateInTimezone(parsed, timezone) || null;
  }

  if (DATE_KEY_PATTERN.test(datePart)) {
    return datePart;
  }

  return null;
}

export function offsetDateKey(
  dateKey: string | null | undefined,
  days: number,
): string | undefined {
  if (!dateKey || !DATE_KEY_PATTERN.test(dateKey)) return undefined;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getCurrentNegativeCashRun(
  valuationHistory: AccountValuation[] | null | undefined,
  timezone?: string,
): CashAuditNegativeRun | null {
  if (!valuationHistory || valuationHistory.length === 0) return null;

  const sortedHistory = [...valuationHistory].sort((a, b) =>
    compareDateKeys(toDateKey(a.valuationDate, timezone), toDateKey(b.valuationDate, timezone)),
  );
  const latestValuation = sortedHistory[sortedHistory.length - 1];
  if (!latestValuation || latestValuation.cashBalance >= 0) return null;

  let firstNegativeIndex = sortedHistory.length - 1;
  while (firstNegativeIndex > 0 && (sortedHistory[firstNegativeIndex - 1]?.cashBalance ?? 0) < 0) {
    firstNegativeIndex -= 1;
  }

  return {
    firstNegativeValuation: sortedHistory[firstNegativeIndex],
    previousNonNegativeValuation: sortedHistory[firstNegativeIndex - 1] ?? null,
  };
}

export function buildCashAuditReviewTarget(
  negativeRun: CashAuditNegativeRun | null | undefined,
  activities: ActivityDetails[],
  timezone?: string,
  isCreditCardAccount = false,
): CashAuditReviewTarget | null {
  if (!negativeRun) return null;

  const { firstNegativeValuation, previousNonNegativeValuation } = negativeRun;
  const valuationDate =
    toDateKey(firstNegativeValuation.valuationDate, timezone) ??
    firstNegativeValuation.valuationDate;
  const previousValuationDate = toDateKey(previousNonNegativeValuation?.valuationDate, timezone);
  const ledgerRows = buildCashAuditLedgerRows(
    activities.filter((activity) => {
      const activityDate = toDateKey(activity.date, timezone);
      return (
        activityDate !== null &&
        activityDate <= valuationDate &&
        (!previousValuationDate || activityDate > previousValuationDate)
      );
    }),
    firstNegativeValuation.cashBalance,
    previousNonNegativeValuation?.cashBalance,
    timezone,
    isCreditCardAccount,
  );

  const crossingRow = ledgerRows.find((row) => row.crossesNegative);
  const activityDate = crossingRow?.dateKey ?? valuationDate;
  const endingCashBalance =
    crossingRow === undefined
      ? firstNegativeValuation.cashBalance
      : (getEndingBalanceForDate(ledgerRows, activityDate) ?? firstNegativeValuation.cashBalance);

  return {
    valuationDate,
    activityDate,
    endingCashBalance,
    cashCurrency: firstNegativeValuation.accountCurrency,
    firstNegativeCashBalance: firstNegativeValuation.cashBalance,
    crossingActivityId: crossingRow?.activity.id,
    hasExplainingActivity: crossingRow !== undefined,
    isCarryForwardDate: activityDate !== valuationDate,
  };
}

function buildCashAuditLedgerRows(
  activities: ActivityDetails[],
  endingCashBalance: number,
  startingCashBalance: number | undefined,
  timezone?: string,
  isCreditCardAccount = false,
): CashAuditLedgerRow[] {
  const datedActivities = activities
    .map((activity) => ({ activity, dateKey: toDateKey(activity.date, timezone) }))
    .filter((item): item is { activity: ActivityDetails; dateKey: string } => item.dateKey !== null)
    .sort((a, b) => compareActivitiesForCashAudit(a.activity, b.activity));
  const impacts = datedActivities.map(({ activity }) =>
    calculateActivityCashImpact(activity, isCreditCardAccount),
  );
  const totalCashImpact = impacts.reduce((sum, impact) => sum + impact, 0);
  let runningBalance = startingCashBalance ?? endingCashBalance - totalCashImpact;

  return datedActivities.map(({ activity, dateKey }, index) => {
    const cashImpact = impacts[index] ?? 0;
    const previousBalance = runningBalance;
    runningBalance += cashImpact;

    return {
      activity,
      cashImpact,
      dateKey,
      runningBalance,
      crossesNegative: previousBalance >= 0 && runningBalance < 0,
    };
  });
}

function getEndingBalanceForDate(rows: CashAuditLedgerRow[], dateKey: string) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.dateKey === dateKey) {
      return row.runningBalance;
    }
  }
  return undefined;
}

function compareActivitiesForCashAudit(a: ActivityDetails, b: ActivityDetails) {
  const dateDiff = toTimestamp(a.date) - toTimestamp(b.date);
  if (dateDiff !== 0) return dateDiff;
  const createdDiff = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

function toTimestamp(value: Date | string | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareDateKeys(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

function formatDateInTimezone(date: Date, timezone?: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone?.trim() || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return partsToDateKey(formatter.formatToParts(date));
  } catch {
    const fallbackFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return partsToDateKey(fallbackFormatter.formatToParts(date));
  }
}

function partsToDateKey(parts: Intl.DateTimeFormatPart[]) {
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}
