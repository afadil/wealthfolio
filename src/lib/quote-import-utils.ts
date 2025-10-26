import { QuoteImport, ImportValidationStatus } from './types/quote-import';

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
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n').filter((line) => line.trim());

        if (lines.length < 2) {
          resolve({
            isValid: false,
            error: 'CSV file must contain at least a header row and one data row',
          });
          return;
        }

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const requiredHeaders = ['symbol', 'date', 'close'];

        const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

        if (missingHeaders.length > 0) {
          resolve({
            isValid: false,
            error: `Missing required columns: ${missingHeaders.join(', ')}`,
          });
          return;
        }

        resolve({
          isValid: true,
          detectedHeaders: headers,
        });
      } catch (error) {
        resolve({
          isValid: false,
          error: `Failed to parse CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    };
    reader.onerror = () => {
      resolve({ isValid: false, error: 'Failed to read file' });
    };
    reader.readAsText(file);
  });
}

/**
 * Parses CSV content into QuoteImport objects
 * @param csvContent The CSV content as string
 * @returns Array of QuoteImport objects
 */
export function parseCsvContent(csvContent: string): QuoteImport[] {
  const lines = csvContent.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const quotes: QuoteImport[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    if (values.length !== headers.length) continue;

    const quote: QuoteImport = {
      symbol: '',
      date: '',
      close: 0,
      currency: 'USD',
      validationStatus: 'valid' as ImportValidationStatus,
    };

    headers.forEach((header, index) => {
      const value = values[index];
      if (!value) return;

      switch (header) {
        case 'symbol':
          quote.symbol = value;
          break;
        case 'date':
          quote.date = value;
          break;
        case 'open':
          quote.open = parseFloat(value) || undefined;
          break;
        case 'high':
          quote.high = parseFloat(value) || undefined;
          break;
        case 'low':
          quote.low = parseFloat(value) || undefined;
          break;
        case 'close':
          quote.close = parseFloat(value) || 0;
          break;
        case 'volume':
          quote.volume = parseFloat(value) || undefined;
          break;
        case 'currency':
          quote.currency = value;
          break;
      }
    });

    quotes.push(quote);
  }

  return quotes;
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
    case 'valid':
      return '✓ Valid';
    case 'warning':
      return `⚠ Warning: ${errorMessage || 'Check data'}`;
    case 'error':
      return `✗ Error: ${errorMessage || 'Invalid data'}`;
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
    case 'valid':
      return 'text-green-500';
    case 'warning':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-gray-500';
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
export function validateQuoteImport(quote: QuoteImport): { isValid: boolean; error?: string } {
  if (!quote.symbol.trim()) {
    return { isValid: false, error: 'Symbol is required' };
  }

  if (!quote.date) {
    return { isValid: false, error: 'Date is required' };
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(quote.date)) {
    return { isValid: false, error: 'Date must be in YYYY-MM-DD format' };
  }

  if (quote.close <= 0) {
    return { isValid: false, error: 'Close price must be greater than 0' };
  }

  // Validate OHLC logic
  if (quote.high !== undefined && quote.low !== undefined) {
    if (quote.high < quote.low) {
      return { isValid: false, error: 'High price cannot be less than low price' };
    }
  }

  if (quote.open !== undefined && quote.high !== undefined && quote.low !== undefined) {
    if (quote.open > quote.high || quote.open < quote.low) {
      return { isValid: false, error: 'Open price is outside high-low range' };
    }
    if (quote.close > quote.high || quote.close < quote.low) {
      return { isValid: false, error: 'Close price is outside high-low range' };
    }
  }

  return { isValid: true };
}
