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
  QuantityInput,
  NotesInput,
  type AccountSelectOption,
} from "./fields";

// Zod schema for SplitForm validation
export const splitFormSchema = z.object({
  accountId: z.string().min(1, { message: "Please select an account." }),
  symbol: z.string().min(1, { message: "Please enter a symbol." }),
  activityDate: z.date({ required_error: "Please select a date." }),
  splitRatio: z.coerce
    .number({
      required_error: "Please enter a split ratio.",
      invalid_type_error: "Split ratio must be a number.",
    })
    .positive({ message: "Split ratio must be greater than 0." }),
  comment: z.string().optional().nullable(),
});

export type SplitFormValues = z.infer<typeof splitFormSchema>;

interface SplitFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<SplitFormValues>;
  onSubmit: (data: SplitFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  /** Whether to show manual symbol input instead of search */
  isManualSymbol?: boolean;
}

export function SplitForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
  isManualSymbol = false,
}: SplitFormProps) {
  const form = useForm<SplitFormValues>({
    resolver: zodResolver(splitFormSchema) as Resolver<SplitFormValues>,
    mode: "onBlur", // Validate on blur
    defaultValues: {
      accountId: accounts.length === 1 ? accounts[0].value : "",
      symbol: "",
      activityDate: new Date(),
      splitRatio: undefined,
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

            {/* Split Ratio */}
            <QuantityInput
              name="splitRatio"
              label="Split Ratio"
              placeholder="e.g., 2 for 2:1 split"
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
            {isEditing ? "Update" : "Add Split"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
