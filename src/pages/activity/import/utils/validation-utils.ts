import {
  ImportMappingData,
  ActivityImport,
  ImportFormat,
  ActivityType,
  CsvRowData,
  ImportValidationResult,
} from '@/lib/types';
import { importActivitySchema } from '@/lib/schemas';
import { isCashActivity, isIncomeActivity } from '@/lib/activity-utils';
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

// Helper function to transform a CSV row into an Activity object
function transformRowToActivity(
  row: CsvRowData,
  mapping: ImportMappingData,
  accountId: string,
): Partial<ActivityImport> {
  const activity: Partial<ActivityImport> = { accountId, isDraft: true, isValid: false }; // Start with defaults

  // Helper to get a value from a row based on the mapped header
  const getMappedValue = (field: ImportFormat): string | undefined => {
    const headerName = mapping.fieldMappings[field];
    if (!headerName) return undefined;

    // Safe property access
    const value = row[headerName];
    return typeof value === 'string' ? value.trim() : undefined;
  };

  // --- Map Fields ---
  const rawDate = getMappedValue(ImportFormat.DATE);
  activity.date = rawDate ? tryParseDate(rawDate)?.toISOString().split('T')[0] : undefined;
  activity.symbol = getMappedValue(ImportFormat.SYMBOL);
  const csvActivityType = getMappedValue(ImportFormat.ACTIVITY_TYPE);

  // Parse numeric fields
  const quantityStr = getMappedValue(ImportFormat.QUANTITY);
  activity.quantity = quantityStr ? parseFloat(quantityStr) : undefined;

  const unitPriceStr = getMappedValue(ImportFormat.UNIT_PRICE);
  activity.unitPrice = unitPriceStr ? parseFloat(unitPriceStr) : undefined;

  activity.currency = getMappedValue(ImportFormat.CURRENCY);

  const feeStr = getMappedValue(ImportFormat.FEE);
  activity.fee = feeStr ? parseFloat(feeStr) : 0;

  const amountStr = getMappedValue(ImportFormat.AMOUNT);
  activity.amount = amountStr ? parseFloat(amountStr) : undefined;

  // --- Apply Symbol Mapping ---
  if (activity.symbol && mapping.symbolMappings[activity.symbol]) {
    activity.symbol = mapping.symbolMappings[activity.symbol];
  }

  // --- Apply Activity Type Mapping ---
  if (csvActivityType) {
    const trimmedCsvType = csvActivityType.trim().toUpperCase();

    // Try to find a matching activity type
    for (const [appType, csvTypes] of Object.entries(mapping.activityMappings)) {
      if (csvTypes?.some((ct) => trimmedCsvType.startsWith(ct.trim().toUpperCase()))) {
        activity.activityType = appType as ActivityType;
        break;
      }
    }
  }

  // Set symbol for cash activities and income activities
  if (
    activity.activityType &&
    (isCashActivity(activity.activityType) || isIncomeActivity(activity.activityType))
  ) {
    activity.symbol = activity.currency ? `$CASH-${activity.currency.toUpperCase()}` : undefined;

    // For cash activities, make sure amount is calculated if not present or zero
    if (!activity.amount || activity.amount === 0) {
      activity.amount = calculateCashActivityAmount(activity.quantity, activity.unitPrice);
    }
  }

  // For FEE activity, set the fee field if not set or zero
  if (activity.activityType === ActivityType.FEE) {
    if (!activity.fee || activity.fee === 0) {
      // First try to use amount field if available and > 0
      if (activity.amount && activity.amount > 0) {
        activity.fee = activity.amount;
      } else {
        // Otherwise calculate fee using the same calculation logic
        activity.fee = calculateCashActivityAmount(activity.quantity, activity.unitPrice);
      }
    }
  }

  // Handle NaN values
  if (activity.quantity !== undefined && isNaN(activity.quantity)) activity.quantity = undefined;
  if (activity.unitPrice !== undefined && isNaN(activity.unitPrice)) activity.unitPrice = undefined;
  if (activity.fee !== undefined && isNaN(activity.fee)) activity.fee = undefined;
  if (activity.amount !== undefined && isNaN(activity.amount)) activity.amount = undefined;

  // Set lineNumber for tracking from the built-in line number property
  activity.lineNumber = parseInt(row.lineNumber);
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
        const transformedActivity = transformRowToActivity(row, mapping, accountId);

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
