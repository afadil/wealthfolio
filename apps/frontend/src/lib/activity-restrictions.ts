import type { Account } from "@/lib/types";
import { ActivityType, ACTIVITY_TYPES } from "@/lib/constants";

/**
 * Picker-friendly activity type that maps TRANSFER_IN/OUT to a single TRANSFER option.
 * Used by ActivityTypePicker component.
 */
const PICKER_TRANSFER_TYPE = "TRANSFER";

/**
 * All activity types in picker-compatible format.
 * Includes TRANSFER as UI alias for TRANSFER_IN/TRANSFER_OUT.
 */
const ALL_PICKER_TYPES: readonly string[] = [...ACTIVITY_TYPES, PICKER_TRANSFER_TYPE];

/**
 * Activity types allowed for manual HOLDINGS tracking mode accounts.
 * These are income/cash activities that don't affect positions directly.
 */
const HOLDINGS_MODE_ALLOWED_TYPES: readonly string[] = [
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.INTEREST,
  ActivityType.DIVIDEND, // Income activity - doesn't change positions
];

/**
 * Returns the list of activity types allowed for manual entry on the given account.
 * Returns picker-compatible types (includes "TRANSFER" alias).
 *
 * - No account selected: all types
 * - TRANSACTIONS mode: all types
 * - HOLDINGS mode (manual): income/cash activities only
 * - HOLDINGS mode (connected): none (sync-only)
 */
export function getAllowedActivityTypes(account: Account | undefined): readonly string[] {
  if (!account) {
    return ALL_PICKER_TYPES;
  }

  const { trackingMode, providerAccountId } = account;

  if (trackingMode === "HOLDINGS") {
    // Connected accounts are sync-only
    if (providerAccountId) {
      return [];
    }
    return HOLDINGS_MODE_ALLOWED_TYPES;
  }

  // TRANSACTIONS or NOT_SET - all types allowed
  return ALL_PICKER_TYPES;
}

/**
 * Returns true if the account supports the given activity type.
 */
export function accountSupportsActivityType(account: Account, activityType: string): boolean {
  return getAllowedActivityTypes(account).includes(activityType);
}

/**
 * Returns true if the account supports adding holdings directly.
 * Only true for manual HOLDINGS tracking mode accounts.
 */
export function canAddHoldings(account: Account | undefined): boolean {
  if (!account) {
    return false;
  }
  return account.trackingMode === "HOLDINGS" && !account.providerAccountId;
}

/**
 * Returns true if CSV import is allowed for the given account.
 * Disabled for connected HOLDINGS accounts.
 */
export function canImportCSV(account: Account | undefined): boolean {
  if (!account) {
    return true;
  }
  return !(account.trackingMode === "HOLDINGS" && account.providerAccountId);
}

export type ActivityRestrictionLevel = "none" | "limited" | "blocked";

/**
 * Returns the restriction level for an account's activity entry.
 */
export function getActivityRestrictionLevel(
  account: Account | undefined,
): ActivityRestrictionLevel {
  if (!account) {
    return "none";
  }

  if (account.trackingMode === "HOLDINGS") {
    return account.providerAccountId ? "blocked" : "limited";
  }

  return "none";
}
