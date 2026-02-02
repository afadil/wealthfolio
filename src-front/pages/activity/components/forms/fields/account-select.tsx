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
}

interface AccountSelectProps<TFieldValues extends FieldValues = FieldValues> {
  name: FieldPath<TFieldValues>;
  accounts: AccountSelectOption[];
  label?: string;
  placeholder?: string;
}

export function AccountSelect<TFieldValues extends FieldValues = FieldValues>({
  name,
  accounts,
  label = "Account",
  placeholder = "Select an account",
}: AccountSelectProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
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
