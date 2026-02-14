import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";

export interface AccountSelectOption {
  value: string;
  label: string;
  currency: string;
  /** Activity restriction level based on account tracking mode. */
  restrictionLevel?: "none" | "limited" | "blocked";
}

interface AccountSelectProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  accounts: AccountSelectOption[];
  label?: string;
  placeholder?: string;
  /** Optional currency field to auto-populate from selected account when untouched/empty */
  currencyName?: FieldPath<TFieldValues>;
}

export function AccountSelect<TFieldValues extends FieldValues = FieldValues>({
  name,
  accounts,
  label = "Account",
  placeholder = "Select an account",
  currencyName,
}: AccountSelectProps<TFieldValues>) {
  const { control, getFieldState, getValues, setValue } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                if (!currencyName) return;
                const selected = accounts.find((account) => account.value === value);
                if (!selected) return;
                const currentCurrency = (
                  getValues(currencyName as any) as string | undefined
                )?.trim();
                const shouldAutoSetCurrency =
                  !getFieldState(currencyName as any).isDirty || !currentCurrency;
                if (shouldAutoSetCurrency) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  setValue(currencyName, selected.currency as any, {
                    shouldDirty: false,
                    shouldValidate: true,
                  });
                }
              }}
              defaultValue={field.value}
            >
              <SelectTrigger aria-label={label} data-testid="account-select">
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent className="max-h-[500px] overflow-y-auto">
                {accounts.map((account) => (
                  <SelectItem value={account.value} key={account.value}>
                    {account.label}
                    <span className="text-muted-foreground font-light">({account.currency})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
