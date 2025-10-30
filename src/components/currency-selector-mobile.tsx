import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";
import { CurrencyInput } from "@wealthfolio/ui";

type CurrencyInputComponentProps = ComponentPropsWithoutRef<typeof CurrencyInput>;

interface CurrencySelectorMobileProps
  extends Omit<CurrencyInputComponentProps, "value" | "onChange" | "displayMode" | "placeholder" | "onSelect"> {
  onSelect: (currency: string) => void;
  value?: string;
  placeholder?: string;
}

export const CurrencySelectorMobile = forwardRef<HTMLButtonElement, CurrencySelectorMobileProps>(
  ({ onSelect, value, placeholder = "Select currency...", className, ...props }, ref) => {
    const { size = "lg", ...rest } = props;

    return (
      <CurrencyInput
        ref={ref}
        value={value}
        onChange={onSelect}
        placeholder={placeholder}
        className={className}
        displayMode="mobile"
        size={size}
        {...rest}
      />
    );
  },
);

CurrencySelectorMobile.displayName = "CurrencySelectorMobile";
