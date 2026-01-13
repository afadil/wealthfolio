import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  QuantityInput as BaseQuantityInput,
} from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";

interface QuantityInputProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  label?: string;
  placeholder?: string;
  /** Maximum decimal places (default: 8 for shares) */
  maxDecimalPlaces?: number;
  /** Allow negative values (default: false) */
  allowNegative?: boolean;
}

export function QuantityInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label = "Quantity",
  placeholder = "0.00",
  maxDecimalPlaces = 8,
  allowNegative = false,
}: QuantityInputProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <BaseQuantityInput
              placeholder={placeholder}
              maxDecimalPlaces={maxDecimalPlaces}
              allowNegative={allowNegative}
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
