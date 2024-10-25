import { ImportFormat, ActivityType, ActivityImport } from '@/lib/types';
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
  mapping: {
    columns: Partial<Record<ImportFormat, string>>;
    activityTypes: Partial<Record<ActivityType, string[]>>;
    symbolMappings: Record<string, string>;
  },
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
    (field) => mapping.columns[field] && headers.includes(mapping.columns[field]!),
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
    Object.entries(mapping.activityTypes).some(([_, mappedTypes]) =>
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
  ActivityType.FEE,
  ActivityType.TAX,
]);

// Add a simple regex for ticker validation
const tickerRegex = /^[A-Z0-9]{1,5}([.-][A-Z0-9]+)?$/;

export const activityImportValidationSchema = z
  .object({
    date: z.string(),
    symbol: z.string().trim().regex(tickerRegex, 'Invalid ticker symbol format'),
    activityType: z.nativeEnum(ActivityType),
    quantity: z.number().positive('Quantity must be positive'),
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
      if ([ActivityType.BUY, ActivityType.SELL].includes(data.activityType)) {
        return data.unitPrice > 0;
      }
      return true;
    },
    {
      message: 'Buy/Sell activities must have a positive unit price!',
      path: ['unitPrice'],
    },
  );

export function validateActivities(activities: ActivityImport[]): Record<string, string[]> {
  const validationErrors: Record<string, string[]> = {};
  activities.forEach((activity, index) => {
    const rowErrors: string[] = [];

    // Attempt to parse the date and update the activity object
    const parsedDate = new Date(activity.date?.toString().trim() || '');

    if (!parsedDate) {
      rowErrors.push('date: Invalid date format');
    } else {
      activity.date = parsedDate.toISOString().split('T')[0]; // Convert to ISO format
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
  if (symbol.startsWith('$CASH-')) {
    return true;
  }
  return tickerRegex.test(symbol);
}
