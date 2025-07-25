import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isValid, parseISO, parse } from 'date-fns';
import { logger } from '@/adapters';
import { AccountValuation } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Attempts to parse a date string in multiple formats using date-fns
 * @param dateStr The date string to parse
 * @returns A valid Date object if parsing succeeds, null if all parsing attempts fail
 */
export function tryParseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Standardize the input - replace multiple spaces with single space and trim
  const cleaned = dateStr.replace(/\s+/g, ' ').trim().toUpperCase();
  
  // First try ISO parsing since it's most common
  try {
    const isoDate = parseISO(cleaned);
    if (isValid(isoDate) && isDateInRange(isoDate)) {
      return isoDate;
    }
  } catch {}
  
  // Array of date format patterns to try
  const formatPatterns = [
    // Standard ISO 8601 UTC
    "yyyy-MM-dd'T'HH:mm:ss'Z'", // Added Standard ISO format
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", // Added Standard ISO format with milliseconds
    "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXX", // Added Standard ISO timestamp with microsecond precision and timezone offset

    // ISO and Technical Formats
    'yyyy-MM-dd', // "2024-05-01" - ISO 8601
    'yyyyMMdd', // "20240501" - Compact ISO
    'yyyy/MM/dd', // "2024/05/01" - Modified ISO
    'yyyy.MM.dd', // "2024.05.01" - Modified ISO

    // North American Banking Formats
    'MMM dd yyyy', // "MAY 01 2024" - Common in North American banks
    'MMMM dd yyyy', // "MAY 01 2024" (full month)
    'MM/dd/yyyy', // "05/01/2024" - US Standard
    'M/d/yyyy', // "5/1/2024" - US Relaxed

    // European Banking Formats
    'dd/MM/yyyy', // "01/05/2024" - UK/EU Standard
    'd/M/yyyy', // "1/5/2024" - UK/EU Relaxed
    'dd.MM.yyyy', // "01.05.2024" - German/Swiss/Russian
    'd.M.yyyy', // "1.5.2024" - German/Swiss Relaxed
    'dd-MM-yyyy', // "01-05-2024" - Dutch/Danish

    // Asian Banking Formats
    'yyyy年MM月dd日', // "2024年05月01日" - Japanese
    'yyyy년MM월dd일', // "2024년05월01일" - Korean
    'yyyy年M月d日', // "2024年5月1日" - Chinese Traditional

    // Common Text Formats
    'MMMM d, yyyy', // "May 1, 2024" - US Formal
    'MMM d, yyyy', // "May 1, 2024" - US Common
    'd MMM yyyy', // "1 May 2024" - UK Common
    'dd MMM yyyy', // "01 May 2024" - UK Formal
    'd MMMM yyyy', // "1 May 2024" - UK Extended
    'dd MMMM yyyy', // "01 May 2024" - UK Extended Formal

    // Additional Banking Formats
    'dd-MMM-yyyy', // "01-MAY-2024" - Legacy Banking
    'ddMMMyyyy', // "01MAY2024" - Swift/Wire
    'dd MMM yy', // "01 MAY 24" - Short Year
    'MMM dd, yy', // "MAY 01, 24" - US Short

    // Fiscal Year Formats
    'MMM dd FY yyyy', // "MAY 01 FY 2024"
    'dd MMM FY yyyy', // "01 MAY FY 2024"

    // Quarter Formats
    'Qn yyyy', // "Q2 2024"
    'yyyy-Qn', // "2024-Q2"
  ];

  // Try each format pattern
  for (const pattern of formatPatterns) {
    try {
      const parsedDate = parse(cleaned, pattern, new Date());
      if (isValid(parsedDate) && isDateInRange(parsedDate)) {
        return parsedDate;
      }
    } catch {}
  }

  // Try Unix timestamp (in seconds or milliseconds)
  const num = parseInt(cleaned);
  if (!isNaN(num)) {
    const timestampDate = new Date(num > 1000000000000 ? num : num * 1000);
    if (isValid(timestampDate) && isDateInRange(timestampDate)) {
      return timestampDate;
    }
  }

  return null;
}

// Helper to check if date is within reasonable range (1900-2100)
function isDateInRange(date: Date): boolean {
  const year = date.getFullYear();
  return year >= 1900 && year <= 2100;
}

export function formatDate(input: string | number | Date | null | undefined): string {
  if (input === null || input === undefined) {
    return '-';
  }

  let date: Date | null = null;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'string') {
    if (input.trim() === '') {
      return '-';
    }
    date = tryParseDate(input);
  } else if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      logger.warn(`Invalid number input for date: ${input}`);
      return '-';
    }
    date = new Date(input);
  }

  if (date && isValid(date)) {
    return format(date, 'MMM d, yyyy');
  }

  logger.warn(`Failed to format invalid date input: ${String(input)}`);

  if (typeof input === 'string') {
    return input;
  }

  return '-';
}

export const formatDateTime = (date: string | Date, timezone?: string) => {
  if (!date) return { date: '-', time: '-' };

  let dateObj: Date | null = null;
  if (typeof date === 'string') {
    // First attempt with the robust parser
    dateObj = tryParseDate(date);
    // If it fails, try the native Date constructor which is good with ISO date-time strings
    if (!dateObj || !isValid(dateObj)) {
      dateObj = new Date(date);
    }
  } else {
    // It's already a Date object
    dateObj = date;
  }

  // Now validate the final date object
  if (!isValid(dateObj)) {
    logger.warn(`Invalid date input for formatDateTime: ${date}`);
    return { date: '-', time: '-' };
  }

  // Determine the effective timezone: use provided timezone or default to user's local timezone
  const effectiveTimezone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: effectiveTimezone,
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZone: effectiveTimezone,
  };

  const dateFormatter = new Intl.DateTimeFormat('en-US', dateOptions);
  const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions);

  return {
    date: dateFormatter.format(dateObj),
    time: timeFormatter.format(dateObj),
  };
};
export function formatAmount(amount: number, currency: string, displayCurrency = true) {
  // Handle pence (GBp) specially
  if (currency === 'GBp' || currency === 'GBX') {
    if (!displayCurrency) {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
    
    // For pence, format as "123.45p" or "1,234.56p"
    const formattedNumber = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
    
    return `${formattedNumber}p`;
  }
  
  return new Intl.NumberFormat('en-US', {
    style: displayCurrency ? 'currency' : undefined,
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number | null | undefined) {
  if (value == null) return '-';
  try {
    // Use Intl.NumberFormat for correct percentage formatting (handles x100 and % sign)
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    logger.error(`Error formatting percent ${value}: ${error}`);
    // Fallback to simple string conversion if formatting fails
    return `${value}%`; // Keep original fallback but it might still be incorrect
  }
}
export function formatStockQuantity(quantity: string | number) {
  const numQuantity = parseFloat(String(quantity));
  if (Number.isInteger(numQuantity)) {
    return numQuantity.toString();
  } else {
    return numQuantity.toFixed(6);
  }
}

export function toPascalCase(input: string) {
  return input
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

export function formatQuantity(quantity: number | null | undefined): string {
  if (quantity === null || quantity === undefined) {
    return '-';
  }

  // Use Intl.NumberFormat for consistent number formatting
  // Minimum fraction digits of 0 allows whole numbers to show without decimals
  // Maximum of 4 decimal places when needed
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
    useGrouping: true
  }).format(quantity);
}

/**
 * Safely divides two numbers, returning 0 if the divisor is 0.
 * @param numerator The number to be divided.
 * @param denominator The number to divide by.
 * @returns The result of the division, or 0 if the denominator is 0.
 */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

export function calculatePerformanceMetrics(
  history: AccountValuation[] | null | undefined,
  isAllTime = false,
): { gainLossAmount: number; simpleReturn: number } {
  
  if (!history?.length) return { gainLossAmount: 0, simpleReturn: 0 };

  const first = history[0];
  const last = history[history.length - 1];

  const ncFlow = Number(last.netContribution) - Number(first.netContribution);
  const mvGain = Number(last.totalValue) - Number(first.totalValue);
  const gain$ = mvGain - ncFlow; // profit / loss

  // ── all‑time ROI ────────────────────────────────────────────────
  if (isAllTime) {
    const totalNC = Number(last.netContribution);
    const gain = Number(last.totalValue) - totalNC;

    return {
      gainLossAmount: gain,
      simpleReturn: totalNC !== 0 ? gain / totalNC : 0,
    };
  }

  // ── period Perf: daily time‑weighted return (TWR) ───────────────
  let twr = 1;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    const cf = Number(curr.netContribution) - Number(prev.netContribution); // deposit(+)/withdraw(-)
    const mv0 = Number(prev.totalValue);
    if (mv0 === 0) {
      continue; // skip day zero if portfolio just opened
    }

    const dailyReturn = (Number(curr.totalValue) - cf) / mv0;
    twr *= dailyReturn;

  }

  const result = {
    gainLossAmount: gain$,
    simpleReturn: twr - 1, // e.g. 0.034 -> 3.4 %
  };

  return result;
}
