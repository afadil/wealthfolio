import { FormControl, FormField, FormItem, FormLabel, FormMessage, MoneyInput } from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";

interface AmountInputProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  label?: string;
  placeholder?: string;
  /** Maximum decimal places (default: 2 for currency) */
  maxDecimalPlaces?: number;
}

export function AmountInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label = "Amount",
  placeholder = "0.00",
  maxDecimalPlaces = 2,
}: AmountInputProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <MoneyInput
              placeholder={placeholder}
              maxDecimalPlaces={maxDecimalPlaces}
              {...field}
              onChange={(e) => {
                const value = e.target.value;
                field.onChange(value === "" ? undefined : parseFloat(value));
              }}
              value={field.value ?? ""}
              aria-label={label}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
