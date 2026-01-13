import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  AccountSelect,
  DatePicker,
  AmountInput,
  NotesInput,
  type AccountSelectOption,
} from "./fields";

// Zod schema for TaxForm validation
export const taxFormSchema = z.object({
  accountId: z.string().min(1, { message: "Please select an account." }),
  activityDate: z.date({ required_error: "Please select a date." }),
  amount: z.coerce
    .number({
      required_error: "Please enter an amount.",
      invalid_type_error: "Amount must be a number.",
    })
    .positive({ message: "Amount must be greater than 0." }),
  comment: z.string().optional().nullable(),
});

export type TaxFormValues = z.infer<typeof taxFormSchema>;

interface TaxFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<TaxFormValues>;
  onSubmit: (data: TaxFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
}

export function TaxForm({ accounts, defaultValues, onSubmit, onCancel, isLoading = false, isEditing = false }: TaxFormProps) {
  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxFormSchema) as Resolver<TaxFormValues>,
    mode: "onBlur", // Validate on blur
    defaultValues: {
      accountId: accounts.length === 1 ? accounts[0].value : "",
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

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" />

            {/* Amount */}
            <AmountInput name="amount" label="Amount" />

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
            {isEditing ? "Update" : "Add Tax"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
