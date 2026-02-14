import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  MoneyInput,
} from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";

interface AmountInputProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  label?: string;
  placeholder?: string;
  /** Maximum decimal places (default: 2 for currency) */
  maxDecimalPlaces?: number;
  /** Currency code to display as adornment (e.g., "USD") */
  currency?: string;
}

export function AmountInput<TFieldValues extends FieldValues = FieldValues>({
  name,
  label = "Amount",
  placeholder = "0.00",
  maxDecimalPlaces = 2,
  currency,
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
            {currency ? (
              <InputGroup className="bg-input-bg h-input-height shadow-xs rounded-md">
                <MoneyInput
                  data-slot="input-group-control"
                  className="aria-invalid:ring-0 flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0"
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={placeholder}
                  maxDecimalPlaces={maxDecimalPlaces}
                  aria-label={label}
                  data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-input`}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{currency}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            ) : (
              <MoneyInput
                ref={field.ref}
                name={field.name}
                value={field.value}
                onValueChange={field.onChange}
                placeholder={placeholder}
                maxDecimalPlaces={maxDecimalPlaces}
                aria-label={label}
                data-testid={`${label.toLowerCase().replace(/\s+/g, "-")}-input`}
              />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
