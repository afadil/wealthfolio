import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  AccountSelect,
  SymbolSearch,
  DatePicker,
  AmountInput,
  NotesInput,
  type AccountSelectOption,
} from "./fields";

// Zod schema for DividendForm validation
export const dividendFormSchema = z.object({
  accountId: z.string().min(1, { message: "Please select an account." }),
  symbol: z.string().min(1, { message: "Please enter a symbol." }),
  activityDate: z.date({ required_error: "Please select a date." }),
  amount: z.coerce
    .number({
      required_error: "Please enter an amount.",
      invalid_type_error: "Amount must be a number.",
    })
    .positive({ message: "Amount must be greater than 0." }),
  comment: z.string().optional().nullable(),
});

export type DividendFormValues = z.infer<typeof dividendFormSchema>;

interface DividendFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<DividendFormValues>;
  onSubmit: (data: DividendFormValues) => void | Promise<void>;
  isLoading?: boolean;
  /** Whether to show manual symbol input instead of search */
  isManualSymbol?: boolean;
}

export function DividendForm({
  accounts,
  defaultValues,
  onSubmit,
  isLoading = false,
  isManualSymbol = false,
}: DividendFormProps) {
  const form = useForm<DividendFormValues>({
    resolver: zodResolver(dividendFormSchema) as Resolver<DividendFormValues>,
    mode: "onBlur", // Validate on blur
    defaultValues: {
      accountId: accounts.length === 1 ? accounts[0].value : "",
      symbol: "",
      activityDate: new Date(),
      amount: undefined,
      comment: null,
      ...defaultValues,
    },
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-4">
            {/* Account Selection */}
            <AccountSelect name="accountId" accounts={accounts} />

            {/* Symbol Search/Input */}
            <SymbolSearch name="symbol" label="Symbol" isManualAsset={isManualSymbol} />

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" />

            {/* Amount */}
            <AmountInput name="amount" label="Amount" />

            {/* Notes */}
            <NotesInput name="comment" label="Notes" placeholder="Add an optional note..." />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
            <Icons.Plus className="mr-2 h-4 w-4" />
            Add Dividend
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
