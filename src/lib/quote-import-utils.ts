import Papa, { ParseConfig, ParseError, ParseResult } from "papaparse";

import { ImportValidationStatus, QuoteImport } from "./types/quote-import";

const REQUIRED_HEADERS = ["symbol", "date", "close"] as const;

type QuoteCsvRow = Partial<Record<string, string>>;

const CSV_PARSE_BASE_CONFIG = {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header: string) => header.trim().toLowerCase(),
  transform: (value: string | undefined) => (typeof value === "string" ? value.trim() : value),
} satisfies ParseConfig<QuoteCsvRow>;

function parseCsv(
  csvContent: string,
  overrides: Partial<ParseConfig<QuoteCsvRow>> = {},
): ParseResult<QuoteCsvRow> {
  return Papa.parse<QuoteCsvRow>(csvContent, {
    ...CSV_PARSE_BASE_CONFIG,
    ...overrides,
  });
}

function parseOptionalNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const normalised = value.replace(/,/g, "");
  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildParseErrorMessage(error: ParseError): string {
  const row = typeof error.row === "number" && error.row >= 0 ? ` (row ${error.row + 1})` : "";
  return `CSV parse error${row}: ${error.message}`;
}

function isRowEmpty(row: QuoteCsvRow): boolean {
  return Object.values(row).every((value) => value === undefined || value === "");
}

/**
 * Validates a CSV file for quote import
 * @param file The CSV file to validate
 * @returns Promise resolving to validation result
 */
export async function validateCsvFile(file: File): Promise<{
  isValid: boolean;
  error?: string;
  detectedHeaders?: string[];
}> {
  try {
    const csvContent = await file.text();
    const result = parseCsv(csvContent, { preview: 1 });

    if (result.errors.length > 0) {
      return {
        isValid: false,
        error: buildParseErrorMessage(result.errors[0]),
      };
    }

    const headers = (result.meta.fields ?? [])
      .map((field) => (field ? field.trim().toLowerCase() : ""))
      .filter((field): field is string => field.length > 0);

    if (headers.length === 0) {
      return {
        isValid: false,
        error: "CSV file must include a header row",
      };
    }

    if (result.data.length === 0) {
      return {
        isValid: false,
        error: "CSV file must contain at least one data row",
      };
    }

    const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

    if (missingHeaders.length > 0) {
      return {
        isValid: false,
        error: `Missing required columns: ${missingHeaders.join(", ")}`,
      };
    }

    return {
      isValid: true,
      detectedHeaders: headers,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to parse CSV file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Parses CSV content into QuoteImport objects
 * @param csvContent The CSV content as string
 * @returns Array of QuoteImport objects
 */
export function parseCsvContent(csvContent: string): QuoteImport[] {
  if (!csvContent.trim()) {
    return [];
  }

  const result = parseCsv(csvContent);

  if (result.errors.length > 0) {
    throw new Error(buildParseErrorMessage(result.errors[0]));
  }

  return result.data
    .filter((row) => !isRowEmpty(row))
    .map((row) => {
      const parsedClose = parseOptionalNumber(row.close);

      const quote: QuoteImport = {
        symbol: row.symbol ?? "",
        date: row.date ?? "",
        open: parseOptionalNumber(row.open),
        high: parseOptionalNumber(row.high),
        low: parseOptionalNumber(row.low),
        close: parsedClose ?? 0,
        volume: parseOptionalNumber(row.volume),
        currency: row.currency && row.currency.length > 0 ? row.currency : "USD",
        validationStatus: "valid",
      };

      const validation: { status: ImportValidationStatus; errorMessage?: string } =
        parsedClose === undefined
          ? {
              status: "error",
              errorMessage: "Close price must be a valid number",
            }
          : validateQuoteImport(quote);
      quote.validationStatus = validation.status;
      quote.errorMessage = validation.errorMessage;

      return quote;
    });
}

/**
 * Formats validation status for display
 * @param status The validation status
 * @param errorMessage Optional error message
 * @returns Formatted status string
 */
export function formatValidationStatus(
  status: ImportValidationStatus,
  errorMessage?: string,
): string {
  switch (status) {
    case "valid":
      return "✓ Valid";
    case "warning":
      return `⚠ Warning: ${errorMessage || "Check data"}`;
    case "error":
      return `✗ Error: ${errorMessage || "Invalid data"}`;
    default:
      return status;
  }
}

/**
 * Gets the status color for UI display
 * @param status The validation status
 * @returns CSS class name for status color
 */
export function getStatusColor(status: ImportValidationStatus): string {
  switch (status) {
    case "valid":
      return "text-green-500";
    case "warning":
      return "text-yellow-500";
    case "error":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}

/**
 * Generates a sample CSV template
 * @returns CSV template as string
 */
export function generateCsvTemplate(): string {
  return `symbol,date,open,high,low,close,volume,currency
AAPL,2023-01-01,150.00,155.00,149.00,152.50,1000000,USD
AAPL,2023-01-02,152.50,158.00,151.00,156.00,1200000,USD
MSFT,2023-01-01,250.00,255.00,248.00,252.00,800000,USD
MSFT,2023-01-02,252.00,258.00,250.00,255.50,900000,USD`;
}

/**
 * Validates a single quote import object
 * @param quote The quote to validate
 * @returns Validation status and error message
 */
export function validateQuoteImport(quote: QuoteImport): {
  status: ImportValidationStatus;
  errorMessage?: string;
} {
  if (!quote.symbol.trim()) {
    return { status: "error", errorMessage: "Symbol is required" };
  }

  if (!quote.date) {
    return { status: "error", errorMessage: "Date is required" };
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(quote.date)) {
    return {
      status: "error",
      errorMessage: "Date must be in YYYY-MM-DD format",
    };
  }

  if (!Number.isFinite(quote.close)) {
    return {
      status: "error",
      errorMessage: "Close price must be a valid number",
    };
  }

  if (quote.close <= 0) {
    return { status: "error", errorMessage: "Close price must be greater than 0" };
  }

  if (quote.high !== undefined && quote.low !== undefined && quote.high < quote.low) {
    return {
      status: "error",
      errorMessage: "High price cannot be less than low price",
    };
  }

  const warnings: string[] = [];

  if (quote.open !== undefined && quote.high !== undefined && quote.low !== undefined) {
    if (quote.open > quote.high || quote.open < quote.low) {
      warnings.push("Open price is outside high-low range");
    }
  }

  if (quote.high !== undefined && quote.low !== undefined) {
    if (quote.close > quote.high || quote.close < quote.low) {
      warnings.push("Close price is outside high-low range");
    }
  }

  if (warnings.length > 0) {
    return { status: "warning", errorMessage: warnings.join("; ") };
  }

  return { status: "valid" };
}
