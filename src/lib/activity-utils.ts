import { ActivityType, CASH_ACTIVITY_TYPES, INCOME_ACTIVITY_TYPES } from './constants';
import { ActivityDetails } from './types';

/**
 * Determines if an activity is a cash activity based on its type
 * @param activityType The activity type to check
 * @returns True if the activity is a cash activity
 */
export const isCashActivity = (activityType: string): boolean => {
  return (CASH_ACTIVITY_TYPES as readonly string[]).includes(activityType) ;
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
 * Determines if an activity is a cash transfer based on its type and symbol
 * @param activityType The activity type to check
 * @param assetSymbol The asset symbol to check
 * @returns True if the activity is a cash transfer
 */
export const isCashTransfer = (activityType: string, assetSymbol: string): boolean => {
  return (activityType === ActivityType.TRANSFER_IN || 
          activityType === ActivityType.TRANSFER_OUT) && 
         assetSymbol.startsWith('$CASH');
};

/**
 * Gets the fee amount from an activity
 * @param activity The activity to get the fee from
 * @returns The fee amount
 */
export const getFee = (activity: ActivityDetails): number => {
  return activity.fee;
};

/**
 * Gets the amount from an activity, with a fallback to 0 if not provided
 * @param activity The activity to get the amount from
 * @returns The amount or 0 if not provided
 */
export const getAmount = (activity: ActivityDetails): number => {
  return activity.amount ?? 0;
};

/**
 * Gets the quantity from an activity
 * @param activity The activity to get the quantity from
 * @returns The quantity
 */
export const getQuantity = (activity: ActivityDetails): number => {
  return activity.quantity;
};

/**
 * Gets the unit price from an activity
 * @param activity The activity to get the unit price from
 * @returns The unit price
 */
export const getUnitPrice = (activity: ActivityDetails): number => {
  return activity.unitPrice;
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
    return getFee(activity);
  }
  
  // Handle cash activities
  if (isCashActivity(activityType) || isCashTransfer(activityType, assetSymbol) || isIncomeActivity(activityType)) {
    const amount = getAmount(activity);
    const fee = getFee(activity);
    
    // For outgoing cash activities, subtract fee from amount
    if (activityType === ActivityType.WITHDRAWAL || 
        activityType === ActivityType.CONVERSION_OUT || 
        activityType === ActivityType.TRANSFER_OUT) {
      return amount + fee; // Fee is already negative in the UI display
    }
    
    // For incoming cash activities, subtract fee from amount
    return amount - fee;
  }
  
  // Handle trading activities
  const quantity = getQuantity(activity);
  const unitPrice = getUnitPrice(activity);
  const fee = getFee(activity);
  const activityAmount = quantity * unitPrice;
  
  if (activityType === ActivityType.BUY) {
    return activityAmount + fee; // Total cost including fees
  }
  
  if (activityType === ActivityType.SELL) {
    return activityAmount - fee; // Net proceeds after fees
  }
  
  // Default case - just return the activity amount
  return activityAmount;
};

/**
 * Determines if the value should be displayed as positive or negative
 * @param activityType The activity type
 * @returns True if the value should be displayed as negative
 */
export const isNegativeValueActivity = (activityType: string): boolean => {
  return activityType === ActivityType.BUY || 
         activityType === ActivityType.WITHDRAWAL || 
         activityType === ActivityType.TRANSFER_OUT || 
         activityType === ActivityType.CONVERSION_OUT || 
         activityType === ActivityType.FEE || 
         activityType === ActivityType.TAX;
};
