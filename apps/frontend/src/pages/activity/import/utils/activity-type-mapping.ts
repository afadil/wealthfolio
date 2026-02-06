import { ActivityType } from "@/lib/constants";

/**
 * Maps common CSV activity type labels to canonical Wealthfolio activity types.
 * Used for auto-detection during CSV import mapping.
 * Keys must be UPPERCASE.
 */
export const ACTIVITY_TYPE_SMART_DEFAULTS: Record<string, ActivityType> = {
  // BUY
  BUY: ActivityType.BUY,
  PURCHASE: ActivityType.BUY,
  BOUGHT: ActivityType.BUY,
  COVER: ActivityType.BUY,

  // SELL
  SELL: ActivityType.SELL,
  SOLD: ActivityType.SELL,

  // DIVIDEND
  DIVIDEND: ActivityType.DIVIDEND,
  DIV: ActivityType.DIVIDEND,
  REINVEST: ActivityType.DIVIDEND,
  REINVESTMENT: ActivityType.DIVIDEND,

  // DEPOSIT
  DEPOSIT: ActivityType.DEPOSIT,
  CONTRIBUTION: ActivityType.DEPOSIT,

  // WITHDRAWAL
  WITHDRAWAL: ActivityType.WITHDRAWAL,
  WITHDRAW: ActivityType.WITHDRAWAL,

  // FEE
  FEE: ActivityType.FEE,
  COMMISSION: ActivityType.FEE,

  // TAX
  TAX: ActivityType.TAX,
  WITHHOLDING: ActivityType.TAX,

  // TRANSFER
  TRANSFER_IN: ActivityType.TRANSFER_IN,
  TRANSFER: ActivityType.TRANSFER_IN,
  JOURNAL: ActivityType.TRANSFER_IN,
  TRANSFER_OUT: ActivityType.TRANSFER_OUT,

  // INTEREST
  INTEREST: ActivityType.INTEREST,
  INT: ActivityType.INTEREST,

  // SPLIT
  SPLIT: ActivityType.SPLIT,

  // CREDIT
  CREDIT: ActivityType.CREDIT,
  BONUS: ActivityType.CREDIT,
  REFUND: ActivityType.CREDIT,
  REBATE: ActivityType.CREDIT,

  // ADJUSTMENT
  ADJUSTMENT: ActivityType.ADJUSTMENT,
};

function normalizeActivityLabel(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

const SMART_DEFAULT_ENTRIES = Object.entries(ACTIVITY_TYPE_SMART_DEFAULTS);
const PARTIAL_SMART_DEFAULT_ENTRIES = [...SMART_DEFAULT_ENTRIES].sort(
  ([a], [b]) => b.length - a.length,
);

/**
 * Find the best activity type match for a CSV value.
 * Priority: explicit user mappings -> exact smart default -> partial smart default.
 */
export function findMappedActivityType(
  csvValue: string,
  activityMappings: Record<string, string[]>,
): ActivityType | null {
  const normalized = normalizeActivityLabel(csvValue);

  // 1. Check explicit user mappings first
  for (const [activityType, csvValues] of Object.entries(activityMappings)) {
    if (csvValues?.some((v) => normalized.startsWith(normalizeActivityLabel(v)))) {
      return activityType as ActivityType;
    }
  }

  // 2. Exact smart default match
  if (ACTIVITY_TYPE_SMART_DEFAULTS[normalized]) {
    return ACTIVITY_TYPE_SMART_DEFAULTS[normalized];
  }

  // 3. Partial smart default match (e.g., "BUY - MARKET" contains "BUY")
  for (const [key, value] of PARTIAL_SMART_DEFAULT_ENTRIES) {
    if (normalized.startsWith(key) || normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Find activity type using only smart defaults (no explicit mappings).
 * Useful for auto-detection UI where you want to distinguish
 * "auto-detected" from "explicitly mapped".
 */
export function getSmartDefault(csvValue: string): ActivityType | null {
  const normalized = normalizeActivityLabel(csvValue);

  if (ACTIVITY_TYPE_SMART_DEFAULTS[normalized]) {
    return ACTIVITY_TYPE_SMART_DEFAULTS[normalized];
  }

  for (const [key, value] of PARTIAL_SMART_DEFAULT_ENTRIES) {
    if (normalized.startsWith(key) || normalized.includes(key)) {
      return value;
    }
  }

  return null;
}
