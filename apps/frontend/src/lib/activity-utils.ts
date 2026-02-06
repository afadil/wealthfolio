import { ActivityType, CASH_ACTIVITY_TYPES, INCOME_ACTIVITY_TYPES } from "./constants";
import { ActivityDetails } from "./types";

const roundCurrency = (value: number, precision = 6) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

/**
 * Determines if an activity is a cash activity based on its type
 * @param activityType The activity type to check
 * @returns True if the activity is a cash activity
 */
export const isCashActivity = (activityType: string): boolean => {
  return (CASH_ACTIVITY_TYPES as readonly string[]).includes(activityType);
};

/**
 * Determines if an activity is an income activity based on its type
 * @param activityType The activity type to check
 * @returns True if the activity is an income activity
 */
export const isIncomeActivity = (activityType: string): boolean => {
  return (INCOME_ACTIVITY_TYPES as readonly string[]).includes(activityType);
};

/**
 * Recognizes cash symbol patterns from brokers/exports (e.g. $CASH-CAD, CASH:USD).
 */
export const isCashSymbol = (symbol?: string): boolean => {
  if (!symbol?.trim()) return false;
  return /^\$?CASH[-_:][A-Z]{3}$/i.test(symbol.trim());
};

const SYMBOL_NEVER_NEEDED = new Set<string>([
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.INTEREST,
  ActivityType.TAX,
  ActivityType.FEE,
  ActivityType.CREDIT,
]);

/**
 * Whether a symbol is required for this activity+symbol combination.
 * Pure cash types → never. Cash symbols (e.g. $CASH-CAD) → never. Otherwise → yes.
 */
export const isSymbolRequired = (activityType: string, symbol?: string): boolean => {
  if (SYMBOL_NEVER_NEEDED.has(activityType)) return false;
  if (isCashSymbol(symbol)) return false;
  return true;
};

/**
 * Determines if an activity is a cash transfer based on its type and symbol
 * @param activityType The activity type to check
 * @param assetSymbol The asset symbol to check
 * @returns True if the activity is a cash transfer
 */
export const isCashTransfer = (activityType: string, assetSymbol: string): boolean => {
  if (activityType !== ActivityType.TRANSFER_IN && activityType !== ActivityType.TRANSFER_OUT) {
    return false;
  }
  // Recognize cash transfers by symbol:
  // - CASH:{currency} (e.g., CASH:USD)
  // - Display value: "CASH" (set by applyCashDefaults)
  const upperSymbol = assetSymbol.toUpperCase();

  if (upperSymbol === "CASH") {
    return true;
  }

  if (upperSymbol.startsWith("CASH:")) {
    const currency = upperSymbol.slice("CASH:".length);
    return /^[A-Z]{3}$/.test(currency);
  }

  return false;
};

// Helper to check if activity is a trade type
export const isTradeActivity = (type: string): boolean => {
  return type === ActivityType.BUY || type === ActivityType.SELL;
};

// Helper to check if activity is a fee type
export const isFeeActivity = (activityType: string): boolean => {
  return activityType === ActivityType.FEE;
};

// Helper to check if activity is a tax type
export const isTaxActivity = (activityType: string): boolean => {
  return activityType === ActivityType.TAX;
};

// Helper to check if activity is a split type
export const isSplitActivity = (activityType: string): boolean => {
  return activityType === ActivityType.SPLIT;
};

/**
 * Gets the fee amount from an activity
 * @param activity The activity to get the fee from
 * @returns The fee amount
 */
export const getFee = (activity: ActivityDetails): number => {
  return Number(activity.fee);
};

/**
 * Gets the amount from an activity, with a fallback to 0 if not provided
 * @param activity The activity to get the amount from
 * @returns The amount or 0 if not provided
 */
export const getAmount = (activity: ActivityDetails): number => {
  return Number(activity.amount ?? 0);
};

/**
 * Gets the quantity from an activity
 * @param activity The activity to get the quantity from
 * @returns The quantity
 */
export const getQuantity = (activity: ActivityDetails): number => {
  return Number(activity.quantity);
};

/**
 * Gets the unit price from an activity
 * @param activity The activity to get the unit price from
 * @returns The unit price
 */
export const getUnitPrice = (activity: ActivityDetails): number => {
  return Number(activity.unitPrice);
};

/**
 * Calculates the total value of an activity based on its type and data
 * @param activity The activity to calculate the value for
 * @returns The calculated value
 */
export const calculateActivityValue = (activity: ActivityDetails): number => {
  const { activityType, assetSymbol } = activity;

  // Handle special cases first
  if (activityType === ActivityType.SPLIT) {
    return 0; // Split activities don't have a monetary value
  }

  if (activityType === ActivityType.FEE || activityType === ActivityType.TAX) {
    return roundCurrency(Number(getFee(activity)));
  }

  // Handle cash activities
  if (
    isCashActivity(activityType) ||
    isCashTransfer(activityType, assetSymbol) ||
    isIncomeActivity(activityType)
  ) {
    const amount = getAmount(activity);
    const fee = getFee(activity);

    // For outgoing cash activities, subtract fee from amount
    if (activityType === ActivityType.WITHDRAWAL || activityType === ActivityType.TRANSFER_OUT) {
      return roundCurrency(Number(amount) + Number(fee));
    }

    // For incoming cash activities, subtract fee from amount
    return roundCurrency(Number(amount) - Number(fee));
  }

  // Handle trading activities
  const quantity = getQuantity(activity);
  const unitPrice = getUnitPrice(activity);
  const fee = getFee(activity);
  const activityAmount = roundCurrency(Number(quantity) * Number(unitPrice));

  if (activityType === ActivityType.BUY) {
    return roundCurrency(Number(activityAmount) + Number(fee)); // Total cost including fees
  }

  if (activityType === ActivityType.SELL) {
    return roundCurrency(Number(activityAmount) - Number(fee)); // Net proceeds after fees
  }

  // Default case - just return the activity amount
  return roundCurrency(Number(activityAmount));
};

/**
 * Determines if the value should be displayed as positive or negative
 * @param activityType The activity type
 * @returns True if the value should be displayed as negative
 */
export const isNegativeValueActivity = (activityType: string): boolean => {
  return (
    activityType === ActivityType.BUY ||
    activityType === ActivityType.WITHDRAWAL ||
    activityType === ActivityType.TRANSFER_OUT ||
    activityType === ActivityType.FEE ||
    activityType === ActivityType.TAX
  );
};
