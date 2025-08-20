import * as React from 'react';
import { Input } from '../ui/input';
import { cn } from '../../lib/utils';

export interface QuantityInputProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type' | 'inputMode'> {
  maxDecimalPlaces?: number;
  allowNegative?: boolean;
}

const QuantityInput = React.forwardRef<HTMLInputElement, QuantityInputProps>(
  (
    {
      className,
      maxDecimalPlaces = 8,
      allowNegative = false,
      value,
      defaultValue,
      onChange,
      ...props
    },
    ref,
  ) => {
    // Modify the sanitizedValue logic to consider defaultValue
    const sanitizedValue =
      value !== null && value !== undefined
        ? value
        : defaultValue !== null && defaultValue !== undefined
          ? defaultValue
          : '';

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        // Allow negative sign only at the start if allowNegative is true
        const regex = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
        const rawValue = e.target.value;

        // Return if the input doesn't match our regex pattern
        if (!regex.test(rawValue)) {
          return;
        }

        // Ensure only one decimal point
        const decimalIndex = rawValue.indexOf('.');
        let processedValue = rawValue;
        if (decimalIndex !== -1) {
          processedValue =
            rawValue.slice(0, decimalIndex + 1) +
            rawValue.slice(decimalIndex + 1).replace(/\./g, '');
        }

        // Limit decimal places
        if (decimalIndex !== -1) {
          const decimalPart = processedValue.slice(decimalIndex + 1);
          if (decimalPart.length > maxDecimalPlaces) {
            processedValue = processedValue.slice(0, decimalIndex + maxDecimalPlaces + 1);
          }
        }

        // Call the original onChange with the processed value
        if (onChange) {
          const syntheticEvent = {
            ...e,
            target: {
              ...e.target,
              value: processedValue,
            },
          };
          onChange(syntheticEvent as React.ChangeEvent<HTMLInputElement>);
        }
      },
      [maxDecimalPlaces, allowNegative, onChange],
    );

    return (
      <Input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        className={cn('text-right', className)}
        ref={ref}
        {...props}
        value={sanitizedValue}
        onChange={handleChange}
      />
    );
  },
);

QuantityInput.displayName = 'QuantityInput';

export { QuantityInput };
