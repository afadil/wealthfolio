import { logger } from "@/adapters";
import { ActivityType } from "@/lib/constants";
import { importActivitySchema } from "@/lib/schemas";
import type {
  ActivityImport,
  CashImportFormat,
  CashImportMappingData,
  CashImportRow,
  CsvRowData,
  ImportValidationResult,
} from "@/lib/types";
import { tryParseDate } from "@/lib/utils";

/**
 * Normalizes and cleans numeric values from CSV data
 * Handles currency symbols, commas, spaces, and other formatting characters
 */
export function normalizeNumericValue(value: string | undefined): number | undefined {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  let cleaned = value.trim();

  if (cleaned === "" || cleaned === "-" || cleaned === "N/A" || cleaned.toLowerCase() === "null") {
    return undefined;
  }

  // Remove common currency symbols and formatting
  cleaned = cleaned
    .replace(/[$£€¥₹₦₹₽¢]/g, "")
    .replace(/[,\s]/g, "")
    .replace(/[()]/g, "")
    .trim();

  if (cleaned === "") {
    return undefined;
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Determines the activity type based on the amount sign
 * Positive = DEPOSIT, Negative = WITHDRAWAL
 */
export function determineActivityTypeFromAmount(
  amount: number,
  invertSign: boolean = false,
): ActivityType {
  const effectiveAmount = invertSign ? -amount : amount;
  return effectiveAmount >= 0 ? ActivityType.DEPOSIT : ActivityType.WITHDRAWAL;
}

/**
 * Helper to find mapped activity type from activityTypeMappings
 */
function findMappedActivityType(
  csvValue: string,
  activityTypeMappings?: Partial<Record<ActivityType, string[]>>,
): ActivityType | null {
  if (!activityTypeMappings) return null;
  const normalizedCsvValue = csvValue.trim().toUpperCase();

  for (const [appType, csvTypes] of Object.entries(activityTypeMappings)) {
    if (csvTypes?.some((t) => t.trim().toUpperCase() === normalizedCsvValue)) {
      return appType as ActivityType;
    }
  }
  return null;
}

/**
 * Transform a CSV row into a CashImportRow for the rules step
 * This is the intermediate format used during import
 */
export function transformRowToCashImportRow(
  row: CsvRowData,
  mapping: CashImportMappingData,
): CashImportRow {
  // Helper to get mapped value
  const getMappedValue = (field: CashImportFormat): string | undefined => {
    const headerName = mapping.fieldMappings[field];
    if (!headerName) return undefined;
    const value = row[headerName];
    return typeof value === "string" ? value.trim() : undefined;
  };

  const lineNumber = parseInt(row.lineNumber);
  const errors: Record<string, string[]> = {};

  // Parse date (required)
  const rawDate = getMappedValue("date");
  const parsedDate = rawDate ? tryParseDate(rawDate) : undefined;
  if (!parsedDate) {
    errors.date = ["Invalid or missing date"];
  }

  // Parse name (required)
  const name = getMappedValue("name");
  if (!name) {
    errors.name = ["Name is required"];
  }

  // Parse amount (required)
  const rawAmount = normalizeNumericValue(getMappedValue("amount"));
  if (rawAmount === undefined) {
    errors.amount = ["Invalid or missing amount"];
  }

  // Parse activity type - check value mappings first, then literal values, then derive from amount
  const csvActivityType = getMappedValue("activityType");
  let activityType: ActivityType;

  // First, check if there's a value mapping for this CSV value
  const mappedActivityType = csvActivityType
    ? findMappedActivityType(csvActivityType, mapping.activityTypeMappings)
    : null;

  if (mappedActivityType) {
    activityType = mappedActivityType;
  } else if (csvActivityType) {
    // Check literal values
    const upperActivityType = csvActivityType.toUpperCase();
    if (upperActivityType === "DEPOSIT" || upperActivityType === "INCOME") {
      activityType = ActivityType.DEPOSIT;
    } else if (upperActivityType === "WITHDRAWAL" || upperActivityType === "EXPENSE") {
      activityType = ActivityType.WITHDRAWAL;
    } else {
      // Fall back to deriving from amount sign
      activityType = determineActivityTypeFromAmount(
        rawAmount ?? 0,
        mapping.invertAmountSign ?? false,
      );
    }
  } else {
    // No activity type column mapped - derive from amount sign
    activityType = determineActivityTypeFromAmount(
      rawAmount ?? 0,
      mapping.invertAmountSign ?? false,
    );
  }

  // Parse currency - if mapped, use mapped value (will default to account currency later if not set)
  const currency = getMappedValue("currency")?.toUpperCase();

  // Parse optional fields - these will be matched/assigned in the rules step
  const description = getMappedValue("description");

  // Check category value mapping
  const csvCategory = getMappedValue("category");
  let categoryId: string | undefined;
  let subCategoryId: string | undefined;

  if (csvCategory && mapping.categoryMappings) {
    const categoryMapping = mapping.categoryMappings[csvCategory.trim()];
    if (categoryMapping) {
      categoryId = categoryMapping.categoryId;
      subCategoryId = categoryMapping.subCategoryId;
    }
  }

  // Check event value mapping
  const csvEvent = getMappedValue("event");
  let eventId: string | undefined;

  if (csvEvent && mapping.eventMappings) {
    eventId = mapping.eventMappings[csvEvent.trim()];
  }

  // Check account value mapping - use mapped account or default to mapping.accountId
  const csvAccount = getMappedValue("account");
  let accountId: string | undefined;

  if (csvAccount && mapping.accountMappings) {
    accountId = mapping.accountMappings[csvAccount.trim()];
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    lineNumber,
    date: parsedDate?.toISOString() ?? "",
    name: name ?? "",
    amount: rawAmount !== undefined ? Math.abs(rawAmount) : 0,
    activityType,
    currency, // Will default to account currency if not set
    accountId, // Set from value mapping if available, or defaults to default account later
    categoryId, // Set from value mapping if available
    subCategoryId, // Set from value mapping if available
    eventId, // Set from value mapping if available
    description,
    // Store raw CSV values for later matching
    matchedRuleId: undefined,
    matchedRuleName: undefined,
    isManualOverride: categoryId ? true : false, // Mark as manual if pre-mapped
    isValid,
    errors: isValid ? undefined : errors,
  };
}

/**
 * Transform a CSV row into a cash activity for final import
 */
function transformRowToCashActivity(
  row: CsvRowData,
  mapping: CashImportMappingData,
  accountId: string,
  accountCurrency: string,
): Partial<ActivityImport> {
  const activity: Partial<ActivityImport> = {
    accountId,
    isDraft: true,
    isValid: false,
  };

  // Helper to get mapped value
  const getMappedValue = (field: CashImportFormat): string | undefined => {
    const headerName = mapping.fieldMappings[field];
    if (!headerName) return undefined;
    const value = row[headerName];
    return typeof value === "string" ? value.trim() : undefined;
  };

  // Parse date
  const rawDate = getMappedValue("date");
  activity.date = rawDate ? tryParseDate(rawDate)?.toISOString() : undefined;

  // Parse amount
  const rawAmount = normalizeNumericValue(getMappedValue("amount"));

  // Determine activity type from amount sign
  const activityType = determineActivityTypeFromAmount(
    rawAmount ?? 0,
    mapping.invertAmountSign ?? false,
  );

  activity.activityType = activityType;
  activity.amount = rawAmount !== undefined ? Math.abs(rawAmount) : undefined;

  // Set symbol as $CASH-{currency}
  activity.symbol = `$CASH-${accountCurrency.toUpperCase()}`;
  activity.currency = accountCurrency;

  // Set quantity and unit price for cash activities
  activity.quantity = 0;
  activity.unitPrice = 0;
  activity.fee = 0;

  // Parse name and description
  const name = getMappedValue("name");
  const description = getMappedValue("description");

  // Store name in the name field
  activity.name = name || undefined;
  // Use description for comment, fallback to name if no description
  activity.comment = description || undefined;

  // Line number for error tracking
  activity.lineNumber = parseInt(row.lineNumber);

  return activity;
}

/**
 * Convert a CashImportRow to ActivityImport for final import
 */
export function convertCashImportRowToActivity(
  row: CashImportRow,
  defaultAccountId: string,
  defaultAccountCurrency: string,
  accountCurrencyMap?: Map<string, string>, // Map of accountId -> currency
): ActivityImport {
  // Use row's accountId if mapped, otherwise use default account
  const effectiveAccountId = row.accountId || defaultAccountId;

  // Get currency for the effective account
  const effectiveAccountCurrency =
    row.accountId && accountCurrencyMap?.has(row.accountId)
      ? accountCurrencyMap.get(row.accountId)!
      : defaultAccountCurrency;

  // Use row currency if mapped, otherwise default to effective account currency
  const currency = row.currency || effectiveAccountCurrency;

  return {
    accountId: effectiveAccountId,
    isDraft: false,
    isValid: row.isValid,
    lineNumber: row.lineNumber,
    date: row.date,
    name: row.name,
    activityType: row.activityType,
    amount: row.amount,
    symbol: `$CASH-${currency.toUpperCase()}`,
    currency: currency,
    quantity: 0,
    unitPrice: 0,
    fee: 0,
    comment: row.description || undefined,
    categoryId: row.categoryId,
    subCategoryId: row.subCategoryId,
    eventId: row.eventId,
    recurrence: row.recurrence,
    errors: row.errors,
  };
}

/**
 * Validates CSV data for cash activity import
 */
export function validateCashActivityImport(
  data: CsvRowData[],
  mapping: CashImportMappingData,
  accountId: string,
  accountCurrency: string,
): ImportValidationResult {
  if (!data || data.length === 0) {
    throw new Error("CSV data is required and must have at least one row");
  }

  if (!accountId) {
    throw new Error("Account ID is required for validation");
  }

  try {
    const allActivities: ActivityImport[] = [];

    data.forEach((row) => {
      try {
        const transformedActivity = transformRowToCashActivity(
          row,
          mapping,
          accountId,
          accountCurrency,
        );

        // Validate against schema
        const schemaValidation = importActivitySchema.safeParse(transformedActivity);

        if (schemaValidation.success) {
          const activity = schemaValidation.data;
          activity.accountId = transformedActivity.accountId ?? accountId;
          activity.isValid = true;
          allActivities.push(activity);
        } else {
          const allValidationErrors: Record<string, string[]> = {};

          schemaValidation.error.issues.forEach((issue) => {
            const field = issue.path.join(".") || "general";
            if (!allValidationErrors[field]) {
              allValidationErrors[field] = [];
            }
            allValidationErrors[field].push(issue.message);
          });

          const activity = {
            ...transformedActivity,
            isValid: false,
            errors: allValidationErrors,
          } as ActivityImport;

          allActivities.push(activity);
        }
      } catch (error) {
        logger.error(`Error processing row to activity: ${String(error)}`);
        const lineNumber = parseInt(row.lineNumber);

        const activity = {
          accountId,
          isDraft: true,
          isValid: false,
          lineNumber,
          errors: {
            general: ["Failed to process row data"],
          },
        } as unknown as ActivityImport;

        allActivities.push(activity);
      }
    });

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

/**
 * Parse CSV data into CashImportRows for the rules step
 */
export function parseCsvToCashImportRows(
  data: CsvRowData[],
  mapping: CashImportMappingData,
): CashImportRow[] {
  return data.map((row) => transformRowToCashImportRow(row, mapping));
}
