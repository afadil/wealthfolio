import { ImportFormat, ActivityType, ActivityImport, ImportMappingData } from '@/lib/types';
import { z } from 'zod';

export function validateCsvStructure(headerRow: string[]): boolean {
  return headerRow.length >= 3 && !headerRow.some((header) => header.trim() === '');
}

export function initializeColumnMapping(
  headerRow: string[],
): Partial<Record<ImportFormat, string>> {
  const initialMapping: Partial<Record<ImportFormat, string>> = {};
  Object.values(ImportFormat).forEach((field) => {
    const matchingHeader = headerRow.find(
      (header) => header.toLowerCase().trim() === field.toLowerCase(),
    );
    if (matchingHeader) {
      initialMapping[field] = matchingHeader;
    }
  });
  return initialMapping;
}

export function isImportMapComplete(
  headers: string[],
  mapping: ImportMappingData,
  csvData: string[][],
  getMappedValue: (row: string[], field: ImportFormat) => string,
): boolean {
  // Define required fields
  const requiredFields = [
    ImportFormat.Date,
    ImportFormat.ActivityType,
    ImportFormat.Symbol,
    ImportFormat.Quantity,
    ImportFormat.UnitPrice,
  ];

  // Check if all required columns are mapped
  const columnsComplete = requiredFields.every(
    (field) => mapping.fieldMappings[field] && headers.includes(mapping.fieldMappings[field]),
  );

  if (!columnsComplete) return false;

  // Get unique activity types from CSV data and check their mapping
  const uniqueCsvTypes = new Set(
    csvData
      .slice(1)
      .map((row) => getMappedValue(row, ImportFormat.ActivityType))
      .filter(Boolean)
      .map((type) => type.trim().toUpperCase()),
  );

  const activityTypesComplete = Array.from(uniqueCsvTypes).every((csvType) =>
    Object.entries(mapping.activityMappings).some(([_, mappedTypes]) =>
      mappedTypes?.some((mappedType) => csvType.startsWith(mappedType.trim().toUpperCase())),
    ),
  );

  // Get unique symbols from CSV data and check their validity/mapping
  const uniqueSymbols = new Set(
    csvData
      .slice(1)
      .map((row) => getMappedValue(row, ImportFormat.Symbol))
      .filter(Boolean)
      .map((symbol) => symbol.trim()),
  );

  const symbolsComplete = Array.from(uniqueSymbols).every(
    (symbol) => validateTickerSymbol(symbol) || mapping.symbolMappings[symbol],
  );

  return columnsComplete && activityTypesComplete && symbolsComplete;
}

const CASH_ACTIVITY_TYPES = new Set([
  ActivityType.DIVIDEND,
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.TAX,
]);

// Add a simple regex for ticker validation
const tickerRegex = /^(\$CASH-[A-Z]{3}|[A-Z0-9]{1,5}([.-][A-Z0-9]+)?)$/;

export const activityImportValidationSchema = z
  .object({
    date: z.string(),
    symbol: z.string().trim().regex(tickerRegex, 'Invalid ticker symbol format'),
    activityType: z.nativeEnum(ActivityType),
    quantity: z.number(),
    unitPrice: z.number().min(0, 'Unit price cannot be negative'),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Currency must be a valid 3-letter code (e.g., USD, EUR)'),
    fee: z.number().min(0, 'Fee cannot be negative').optional(),
    amount: z.number().optional(),
    accountId: z.string().min(1, 'Account ID is required'),
    isDraft: z.boolean(),
    isValid: z.boolean(),
    assetId: z.string(),
    comment: z.string().optional(),
  })
  .refine(
    (data) => {
      if (CASH_ACTIVITY_TYPES.has(data.activityType)) {
        return Boolean(data.amount && data.amount > 0) || data.unitPrice > 0;
      }
      return true;
    },
    {
      message:
        'This activity type requires the amount to be specified either in amount field or unitPrice field!',
      path: ['unitPrice', 'amount'],
    },
  )
  .refine(
    (data) => {
      if (data.activityType === ActivityType.FEE) {
        return (
          Boolean(data.amount && data.amount > 0) ||
          Boolean(data.fee && data.fee > 0) ||
          data.unitPrice > 0
        );
      }
      return true;
    },
    {
      message:
        'FEE activity type requires the amount to be specified either in amount, fee or unitPrice field!',
      path: ['unitPrice', 'amount', 'fee'],
    },
  )
  .refine(
    (data) => {
      if ([ActivityType.BUY, ActivityType.SELL].includes(data.activityType)) {
        return data.unitPrice > 0;
      }
      return true;
    },
    {
      message: 'Buy/Sell activities must have a positive unit price!',
      path: ['unitPrice'],
    },
  )
  .refine(
    (data) => {
      if (!CASH_ACTIVITY_TYPES.has(data.activityType) && data.activityType !== ActivityType.FEE) {
        return data.quantity > 0;
      }
      return true;
    },
    {
      message: 'Quantity must be positive for non-cash activities',
      path: ['quantity'],
    },
  );

export function validateActivities(activities: ActivityImport[]): Record<string, string[]> {
  const validationErrors: Record<string, string[]> = {};
  activities.forEach((activity, index) => {
    const rowErrors: string[] = [];

    // Attempt to parse the date and update the activity object
    const dateStr = activity.date?.toString().trim() || '';
    const parsedDate = new Date(dateStr);

    if (isNaN(parsedDate.getTime())) {
      rowErrors.push('date: Invalid date format');
    } else {
      // Just use the date portion directly from the input string if it's in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        activity.date = dateStr;
      } else {
        // Otherwise format the date, forcing it to YYYY-MM-DD
        activity.date = parsedDate.toLocaleDateString('en-CA'); // en-CA outputs as YYYY-MM-DD
      }
    }

    try {
      activityImportValidationSchema.parse(activity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        rowErrors.push(...error.errors.map((e) => `${e.path.join('.')}: ${e.message}`));
      }
    }

    if (rowErrors.length > 0) {
      validationErrors[`${index + 2}`] = rowErrors;
    }
  });

  return validationErrors;
}

// Helper function to check if an activity is a cash activity
export function isCashActivity(activityType: ActivityType): boolean {
  return CASH_ACTIVITY_TYPES.has(activityType);
}

export function validateTickerSymbol(symbol: string): boolean {
  return tickerRegex.test(symbol);
}
