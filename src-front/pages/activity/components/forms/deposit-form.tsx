import { useMemo } from "react";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useSettings } from "@/hooks/use-settings";
import {
  AccountSelect,
  DatePicker,
  AmountInput,
  NotesInput,
  AdvancedOptionsSection,
  type AccountSelectOption,
} from "./fields";

// Zod schema for DepositForm validation
export const depositFormSchema = z.object({
  accountId: z.string().min(1, { message: "Please select an account." }),
  activityDate: z.date({ required_error: "Please select a date." }),
  amount: z.coerce
    .number({
      required_error: "Please enter an amount.",
      invalid_type_error: "Amount must be a number.",
    })
    .positive({ message: "Amount must be greater than 0." }),
  comment: z.string().optional().nullable(),
  // Advanced options
  currency: z.string().optional(),
});

export type DepositFormValues = z.infer<typeof depositFormSchema>;

interface DepositFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<DepositFormValues>;
  onSubmit: (data: DepositFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
}

export function DepositForm({ accounts, defaultValues, onSubmit, onCancel, isLoading = false, isEditing = false }: DepositFormProps) {
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialAccountId = defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  const initialCurrency = defaultValues?.currency ?? initialAccount?.currency;

  const form = useForm<DepositFormValues>({
    resolver: zodResolver(depositFormSchema) as Resolver<DepositFormValues>,
    mode: "onSubmit", // Validate only on submit - works correctly with default values
    defaultValues: {
      accountId: initialAccountId,
      activityDate: new Date(),
      amount: undefined,
      comment: null,
      currency: initialCurrency,
      ...defaultValues,
    },
  });

  const { watch } = form;
  const accountId = watch("accountId");

  // Get account currency from selected account
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.value === accountId),
    [accounts, accountId],
  );
  const accountCurrency = selectedAccount?.currency;

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

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" />

            {/* Amount */}
            <AmountInput name="amount" label="Amount" />

            {/* Advanced Options - Currency only (no subtypes for deposits) */}
            <AdvancedOptionsSection
              currencyName="currency"
              accountCurrency={accountCurrency}
              baseCurrency={baseCurrency}
              showSubtype={false}
            />

            {/* Notes */}
            <NotesInput name="comment" label="Notes" placeholder="Add an optional note..." />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? (
              <Icons.Check className="mr-2 h-4 w-4" />
            ) : (
              <Icons.Plus className="mr-2 h-4 w-4" />
            )}
            {isEditing ? "Update" : "Add Deposit"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
