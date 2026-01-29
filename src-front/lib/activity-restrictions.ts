import type { Account } from "@/lib/types";
import { getTrackingMode } from "@/lib/types";
import { ActivityType, ACTIVITY_TYPES } from "@/lib/constants";

/**
 * Activity types allowed for manual HOLDINGS tracking mode accounts.
 * These are cash-only activities that don't affect positions directly.
 */
const HOLDINGS_MODE_ACTIVITY_TYPES: ActivityType[] = [
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.INTEREST,
];

/**
 * Returns the list of activity types allowed for manual entry on the given account.
 *
 * - TRANSACTIONS mode: all activity types
 * - HOLDINGS mode (manual): only cash activities (DEPOSIT, WITHDRAWAL, FEE, TAX, INTEREST)
 * - HOLDINGS mode (connected): no manual entry allowed (empty array)
 */
export function getAllowedActivityTypes(account: Account | undefined): ActivityType[] {
  if (!account) {
    // No account selected - return all types
    return [...ACTIVITY_TYPES] as ActivityType[];
  }

  const trackingMode = getTrackingMode(account);

  // TRANSACTIONS mode or NOT_SET (defaults to TRANSACTIONS) - all types allowed
  if (trackingMode === "TRANSACTIONS" || trackingMode === "NOT_SET") {
    return [...ACTIVITY_TYPES] as ActivityType[];
  }

  // HOLDINGS mode
  if (trackingMode === "HOLDINGS") {
    // Connected account - no manual entry
    if (account.providerAccountId) {
      return [];
    }
    // Manual HOLDINGS - only cash activities
    return HOLDINGS_MODE_ACTIVITY_TYPES;
  }

  return [...ACTIVITY_TYPES] as ActivityType[];
}

/**
 * Returns true if the account supports adding holdings directly.
 * This is only true for manual HOLDINGS tracking mode accounts.
 */
export function canAddHoldings(account: Account | undefined): boolean {
  if (!account) {
    return false;
  }

  const trackingMode = getTrackingMode(account);
  return trackingMode === "HOLDINGS" && !account.providerAccountId;
}

/**
 * Returns true if CSV import is allowed for the given account.
 * CSV import is disabled for connected HOLDINGS accounts.
 */
export function canImportCSV(account: Account | undefined): boolean {
  if (!account) {
    return true;
  }

  const trackingMode = getTrackingMode(account);

  // Connected HOLDINGS accounts don't support CSV import
  if (trackingMode === "HOLDINGS" && account.providerAccountId) {
    return false;
  }

  return true;
}

/**
 * Describes the restriction level for an account's activity entry.
 */
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

  const trackingMode = getTrackingMode(account);

  if (trackingMode === "HOLDINGS") {
    if (account.providerAccountId) {
      return "blocked"; // Connected HOLDINGS - no manual entry
    }
    return "limited"; // Manual HOLDINGS - only cash activities
  }

  return "none";
}
