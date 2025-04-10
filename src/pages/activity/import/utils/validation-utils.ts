import {
  ImportMappingData,
  ActivityImport,
  ImportFormat,
  ActivityType,
  CsvRowData,
  ImportValidationResult,
} from '@/lib/types';
import { importActivitySchema } from '@/lib/schemas';
import { isCashActivity, isIncomeActivity, isTradeActivity } from '@/lib/activity-utils';
import { tryParseDate } from '@/lib/utils';
import { logger } from '@/adapters';

// Ticker symbol validation regex
const tickerRegex = /^(\$CASH-[A-Z]{3}|[A-Z0-9]{1,10}([\.-][A-Z0-9]+){0,2})$/;

// Helper to validate ticker symbol format
export function validateTickerSymbol(symbol: string): boolean {
  return tickerRegex.test(symbol.trim());
}

// Use the importValidationResult from types.ts
export type ValidationResult = ImportValidationResult;

/**
 * Calculates the amount for cash activities based on quantity and unit price
 * Priority:
 * 1. If both quantity and unit price are > 0, use their product
 * 2. If only unit price is > 0, use unit price
 * 3. Otherwise, use quantity
 *
 * @param quantity The quantity value, if available
 * @param unitPrice The unit price value, if available
 * @returns The calculated amount
 */
export function calculateCashActivityAmount(
  quantity: number | undefined,
  unitPrice: number | undefined,
): number {
  // Type guard - convert undefined to 0 for safe calculations
  const safeQuantity = quantity !== undefined && !isNaN(quantity) ? quantity : 0;
  const safeUnitPrice = unitPrice !== undefined && !isNaN(unitPrice) ? unitPrice : 0;

  // Both quantity and unit price are positive
  if (safeQuantity > 0 && safeUnitPrice > 0) {
    return safeQuantity * safeUnitPrice;
  }

  // Only unit price is positive
  if (safeUnitPrice > 0) {
    return safeUnitPrice;
  }

  // Fallback to quantity
  return safeQuantity;
}

// Define types for the calculation functions
type SymbolCalculator = (activity: Partial<ActivityImport>, accountCurrency: string) => string | undefined;
type AmountCalculator = (activity: Partial<ActivityImport>) => number | undefined;
type FeeCalculator = (activity: Partial<ActivityImport>) => number | undefined;

// Define the configuration structure
interface ActivityLogicConfig {
  calculateSymbol: SymbolCalculator;
  calculateAmount: AmountCalculator;
  calculateFee: FeeCalculator;
}

// Create the configuration map
const activityLogicMap: Partial<Record<ActivityType, ActivityLogicConfig>> = {
  [ActivityType.BUY]: {
    calculateSymbol: (activity) => activity.symbol, // Keep original symbol
    calculateAmount: (activity) => {
      // Calculate amount = quantity * price if both positive
      if (activity.quantity && activity.quantity > 0 && activity.unitPrice && activity.unitPrice > 0) {
        return activity.quantity * activity.unitPrice;
      }
      return activity.amount; // Fallback to provided amount
    },
    calculateFee: (activity) => activity.fee ?? 0, // Use provided fee or 0
  },
  [ActivityType.SELL]: {
    // Similar logic to BUY
    calculateSymbol: (activity) => activity.symbol,
    calculateAmount: (activity) => {
       if (activity.quantity && activity.quantity > 0 && activity.unitPrice && activity.unitPrice > 0) {
        return activity.quantity * activity.unitPrice;
      }
      return activity.amount;
    },
    calculateFee: (activity) => activity.fee ?? 0,
  },
  [ActivityType.DEPOSIT]: {
    calculateSymbol: (activity, accountCurrency) => `$CASH-${(activity.currency || accountCurrency).toUpperCase()}`,
    calculateAmount: (activity) => activity.amount ?? calculateCashActivityAmount(activity.quantity, activity.unitPrice),
    calculateFee: (activity) => activity.fee ?? 0,
  },
  [ActivityType.WITHDRAWAL]: {
     calculateSymbol: (activity, accountCurrency) => `$CASH-${(activity.currency || accountCurrency).toUpperCase()}`,
     calculateAmount: (activity) => activity.amount ?? calculateCashActivityAmount(activity.quantity, activity.unitPrice),
     calculateFee: (activity) => activity.fee ?? 0,
  },
   [ActivityType.INTEREST]: {
     calculateSymbol: (activity, accountCurrency) => `$CASH-${(activity.currency || accountCurrency).toUpperCase()}`,
     calculateAmount: (activity) => activity.amount ?? calculateCashActivityAmount(activity.quantity, activity.unitPrice),
     calculateFee: (activity) => activity.fee ?? 0,
   },
   [ActivityType.DIVIDEND]: {
     calculateSymbol: (activity) => activity.symbol, // Usually associated with a stock
     calculateAmount: (activity) => activity.amount ?? calculateCashActivityAmount(activity.quantity, activity.unitPrice),
     calculateFee: (activity) => activity.fee ?? 0,
   },
   [ActivityType.FEE]: {
     calculateSymbol: (activity, accountCurrency) => `$CASH-${(activity.currency || accountCurrency).toUpperCase()}`,
     calculateAmount: (activity) => activity.amount ?? 0, // Fees usually don't have a separate 'amount'
     calculateFee: (activity) => activity.fee ?? activity.amount ?? calculateCashActivityAmount(activity.quantity, activity.unitPrice),
   },
  // ... Add configurations for other ActivityTypes (TAX, TRANSFER_IN, TRANSFER_OUT, etc.)
};

// Default logic if type-specific logic isn't found
const defaultLogic: ActivityLogicConfig = {
  calculateSymbol: (activity) => activity.symbol,
  calculateAmount: (activity) => activity.amount,
  calculateFee: (activity) => activity.fee ?? 0,
};

// Helper function to transform a CSV row into an Activity object
function transformRowToActivity(
  row: CsvRowData,
  mapping: ImportMappingData,
  accountId: string,
  accountCurrency: string,
): Partial<ActivityImport> {
  const activity: Partial<ActivityImport> = { accountId, isDraft: true, isValid: false };

  // Helper to get mapped value
  const getMappedValue = (field: ImportFormat): string | undefined => {
      const headerName = mapping.fieldMappings[field];
      if (!headerName) return undefined;
      const value = row[headerName];
      return typeof value === 'string' ? value.trim() : undefined;
  };

  // 1. Map Raw Values & Basic Parsing
  const rawDate = getMappedValue(ImportFormat.DATE);
  activity.date = rawDate ? tryParseDate(rawDate)?.toISOString().split('T')[0] : undefined;
  activity.symbol = getMappedValue(ImportFormat.SYMBOL);
  const csvActivityType = getMappedValue(ImportFormat.ACTIVITY_TYPE);
  // Store raw parsed values temporarily before applying logic
  const rawQuantity = getMappedValue(ImportFormat.QUANTITY) ? parseFloat(getMappedValue(ImportFormat.QUANTITY)!) : undefined;
  const rawUnitPrice = getMappedValue(ImportFormat.UNIT_PRICE) ? parseFloat(getMappedValue(ImportFormat.UNIT_PRICE)!) : undefined;
  const rawFee = getMappedValue(ImportFormat.FEE) ? parseFloat(getMappedValue(ImportFormat.FEE)!) : undefined;
  const rawAmount = getMappedValue(ImportFormat.AMOUNT) ? parseFloat(getMappedValue(ImportFormat.AMOUNT)!) : undefined;

  // Assign potentially NaN values first, they will be cleaned up later
  activity.quantity = rawQuantity;
  activity.unitPrice = rawUnitPrice;
  activity.currency = getMappedValue(ImportFormat.CURRENCY) || accountCurrency;
  activity.fee = rawFee;
  activity.amount = rawAmount;
  activity.lineNumber = parseInt(row.lineNumber);

  // Apply Symbol Mapping BEFORE determining activity type logic
  if (activity.symbol && mapping.symbolMappings[activity.symbol]) {
    activity.symbol = mapping.symbolMappings[activity.symbol];
  }

  // 2. Determine Activity Type
  if (csvActivityType) {
      const trimmedCsvType = csvActivityType.trim().toUpperCase();
      for (const [appType, csvTypes] of Object.entries(mapping.activityMappings)) {
          if (csvTypes?.some((ct) => trimmedCsvType.startsWith(ct.trim().toUpperCase()))) {
              activity.activityType = appType as ActivityType;
              break;
          }
      }
  }

  // 3. Apply Logic from Configuration
  const logic = activity.activityType ? (activityLogicMap[activity.activityType] ?? defaultLogic) : defaultLogic;

  // Calculate final symbol, amount, and fee using the config
  // Pass a *copy* of the activity so far to avoid premature mutation within calc functions
  const currentActivityState = { ...activity };
  activity.symbol = logic.calculateSymbol(currentActivityState, accountCurrency);
  activity.amount = logic.calculateAmount(currentActivityState);
  activity.fee = logic.calculateFee(currentActivityState);

  // 4. Final Cleanup & Defaulting
  // Handle NaN values resulting from calculations or initial parsing
  if (activity.quantity !== undefined && isNaN(activity.quantity)) activity.quantity = undefined;
  if (activity.unitPrice !== undefined && isNaN(activity.unitPrice)) activity.unitPrice = undefined;
  if (activity.fee !== undefined && isNaN(activity.fee)) activity.fee = 0; // Ensure fee is 0 if NaN
  if (activity.amount !== undefined && isNaN(activity.amount)) activity.amount = undefined;

  // If amount is validly set (not undefined and not NaN), default quantity/unitPrice to 0 if they are undefined/NaN
  if (activity.amount !== undefined && !isNaN(activity.amount)) {
    if (activity.quantity === undefined || isNaN(activity.quantity)) {
      activity.quantity = 0;
    }
    if (activity.unitPrice === undefined || isNaN(activity.unitPrice)) {
      activity.unitPrice = 0;
    }
  } else {
    // If amount is still undefined/NaN, ensure quantity/unitPrice remain undefined if they started as NaN
    if (activity.quantity !== undefined && isNaN(activity.quantity)) activity.quantity = undefined;
    if (activity.unitPrice !== undefined && isNaN(activity.unitPrice)) activity.unitPrice = undefined;
  }

   // Ensure fee is always a number (default to 0 if undefined)
   activity.fee = activity.fee ?? 0;

  return activity;
}

/**
 * Validates CSV data against import mapping rules and business logic
 *
 * @param data The parsed CSV data to validate
 * @param mapping The mapping configuration for interpreting CSV data
 * @param accountId The account ID to associate with the activities
 * @returns Validation results with valid activities and error information
 */
export function validateActivityImport(
  data: CsvRowData[],
  mapping: ImportMappingData,
  accountId: string,
  accountCurrency: string,
): ValidationResult {
  if (!data || data.length === 0) {
    throw new Error('CSV data is required and must have at least one row');
  }

  if (!accountId) {
    throw new Error('Account ID is required for validation');
  }

  try {
    // Initialize results
    const allActivities: ActivityImport[] = [];

    // Process each data row
    data.forEach((row) => {
      try {
        // Transform row to activity object
        const transformedActivity = transformRowToActivity(
          row,
          mapping,
          accountId,
          accountCurrency,
        );

        // Validate against schema (type safety, required fields, business rules)
        const schemaValidation = importActivitySchema.safeParse(transformedActivity);

        if (schemaValidation.success) {
          const activity = schemaValidation.data as ActivityImport;
          activity.isValid = true;
          allActivities.push(activity);
        } else {
          // Collect schema validation errors
          const allValidationErrors: Record<string, string[]> = {};

          schemaValidation.error.issues.forEach((issue) => {
            const field = issue.path.join('.') || 'general';
            if (!allValidationErrors[field]) {
              allValidationErrors[field] = [];
            }
            allValidationErrors[field].push(issue.message);
          });

          // Create activity with schema validation errors
          const activity = {
            ...transformedActivity,
            isValid: false,
            errors: allValidationErrors,
          } as ActivityImport;

          allActivities.push(activity);
        }
      } catch (error) {
        // Handle unexpected errors
        logger.error(`Error processing row to activity: ${String(error)}`);
        const lineNumber = parseInt(row.lineNumber);

        // Create a minimal activity with error information
        const activity = {
          accountId,
          isDraft: true,
          isValid: false,
          lineNumber,
          errors: {
            general: ['Failed to process row data'],
          },
        } as unknown as ActivityImport;

        allActivities.push(activity);
      }
    });

    // Calculate summary metrics
    const validationSummary = {
      totalRows: data.length,
      validCount: allActivities.filter((a) => a.isValid).length,
      invalidCount: allActivities.filter((a) => !a.isValid).length,
    };

    return {
      activities: allActivities,
      validationSummary,
    };
  } catch (error) {
    logger.error(`Validation process error: ${String(error)}`);
    throw error;
  }
}
