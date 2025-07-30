import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  currency?: string;
  maxDecimalPlaces?: number;
}

const MoneyInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, maxDecimalPlaces = 6, value, onChange, ...props }, ref) => {
    const { placeholder = '0.00' } = props;

    // Ensure value is always a string
    const controlledValue = value === undefined || value === null ? '' : value.toString();

    const formatCurrency = (value: string): string => {
      const numericValue = parseFloat(value);
      return isNaN(numericValue)
        ? ''
        : numericValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: maxDecimalPlaces,
          });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const cursorPos = e.target.selectionStart;
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

      // Immediately restore cursor position
      if (cursorPos !== null) {
        e.target.setSelectionRange(cursorPos, cursorPos);
      }

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
      <Input
        className={cn('text-right', className)}
        ref={ref}
        {...props}
        value={controlledValue}
        onChange={handleChange}
        placeholder={placeholder}
      />
    );
  },
);
MoneyInput.displayName = 'MoneyInput';

export { MoneyInput };
