import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  currency?: string;
  maxDecimalPlaces?: number;
}

const MoneyInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, currency = 'USD', maxDecimalPlaces = 6, ...props }, ref) => {
    const { onChange } = props;

    const formatCurrency = (value: string): string => {
      const numericValue = parseFloat(value);
      return isNaN(numericValue)
        ? ''
        : numericValue.toLocaleString(undefined, {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: maxDecimalPlaces,
          });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let rawValue = e.target.value.replace(/[^\d.]/g, '');

      // Ensure only one decimal point
      const decimalIndex = rawValue.indexOf('.');
      if (decimalIndex !== -1) {
        rawValue =
          rawValue.slice(0, decimalIndex + 1) + rawValue.slice(decimalIndex + 1).replace(/\./g, '');
      }

      const formattedValue = formatCurrency(rawValue);

      // Update the input value with the formatted amount
      e.target.value = formattedValue;

      // Call the original onChange with the numeric value
      if (onChange) {
        const numericValue = parseFloat(rawValue);
        const syntheticEvent = {
          ...e,
          target: { ...e.target, value: isNaN(numericValue) ? '' : rawValue },
        };
        onChange(syntheticEvent as React.ChangeEvent<HTMLInputElement>);
      }
    };

    return (
      <input
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
        onChange={handleChange}
      />
    );
  },
);
MoneyInput.displayName = 'MoneyInput';

export { MoneyInput };
