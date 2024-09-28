import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isValid, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(input: string | number): string {
  // Handle the case where the input is already a timestamp
  const date = typeof input === 'string' ? parseISO(input) : new Date(input);

  if (!isValid(date)) {
    throw new Error('Invalid date input');
  }

  return format(date, 'MMM d, yyyy');
}

export const formatDateTime = (date: string | Date, timezone?: string) => {
  if (!date) return { date: '-', time: '-' };

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: timezone || 'UTC',
  };

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZone: timezone || 'UTC',
  };

  const dateFormatter = new Intl.DateTimeFormat('en-US', dateOptions);
  const timeFormatter = new Intl.DateTimeFormat('en-US', timeOptions);

  const dateObj = new Date(date);

  return {
    date: dateFormatter.format(dateObj),
    time: timeFormatter.format(dateObj),
  };
};
export function formatAmount(amount: number, currency: string, displayCurrency = true) {
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
    if (isNaN(value)) {
      throw new Error('Invalid number');
    }
    return `${Number(value).toFixed(2)}%`;
  } catch (error) {
    console.error('Error formatting percent', value, error);
    return String(value);
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
