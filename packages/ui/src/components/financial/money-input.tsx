import * as React from "react";
import { NumericFormat } from "react-number-format";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";

export interface MoneyInputProps {
  /** Current numeric value */
  value?: number | string | null;
  /**
   * Called when value changes with the new numeric value.
   * Preferred API - receives number directly.
   */
  onValueChange?: (value: number | undefined) => void;
  /**
   * Legacy onChange handler for backward compatibility.
   * Receives a synthetic event with value in e.target.value.
   * @deprecated Use onValueChange instead
   */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Maximum decimal places (default: 6) */
  maxDecimalPlaces?: number;
  /** Use thousand separators (default: false) */
  thousandSeparator?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Additional class names */
  className?: string;
  /** Input name for forms */
  name?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Read-only state */
  readOnly?: boolean;
  /** Aria label for accessibility */
  "aria-label"?: string;
}

const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  (
    {
      value,
      onValueChange,
      onChange,
      maxDecimalPlaces = 6,
      thousandSeparator = false,
      placeholder = "0.00",
      className,
      name,
      disabled,
      readOnly,
      "aria-label": ariaLabel,
    },
    ref,
  ) => {
    // Normalize value to number or empty string
    const numericValue = value === null || value === undefined || value === "" ? "" : Number(value);

    return (
      <NumericFormat
        customInput={Input}
        getInputRef={ref}
        name={name}
        className={cn("text-right", className)}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        allowNegative={false}
        decimalScale={maxDecimalPlaces}
        thousandSeparator={thousandSeparator}
        allowedDecimalSeparators={[".", ","]}
        valueIsNumericString={false}
        value={numericValue}
        onValueChange={(values) => {
          // Prefer onValueChange if provided
          if (onValueChange) {
            onValueChange(values.floatValue);
          }
          // Fall back to legacy onChange for backward compatibility
          // Note: e.target.value will be a number, not a string
          else if (onChange) {
            const syntheticEvent = {
              target: { name, value: values.floatValue },
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        inputMode="decimal"
      />
    );
  },
);

MoneyInput.displayName = "MoneyInput";

export { MoneyInput };
