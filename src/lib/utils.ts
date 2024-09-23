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

export function formatPercent(value: number) {
  // return new Intl.NumberFormat('en-US', {
  //   style: 'percent',
  //   maximumFractionDigits: 2,
  // }).format(value);

  return `${value.toFixed(2)}%`;
}

export function toPascalCase(input: string) {
  return input
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
