import { normalizeCurrency } from "@/lib/utils";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useSettings } from "@/hooks/use-settings";
import {
  AccountSelect,
  SymbolSearch,
  DatePicker,
  QuantityInput,
  NotesInput,
  type AccountSelectOption,
} from "./fields";

// Zod schema for ExerciseForm validation
export const exerciseFormSchema = z.object({
  accountId: z.string().min(1, { message: "Please select an account." }),
  assetId: z.string().min(1, { message: "Please select an option contract." }),
  exchangeMic: z.string().optional(),
  activityDate: z.date({ required_error: "Please select a date." }),
  quantity: z.coerce
    .number({
      required_error: "Please enter a quantity.",
      invalid_type_error: "Quantity must be a number.",
    })
    .positive({ message: "Quantity must be greater than 0." }),
  comment: z.string().optional().nullable(),
  currency: z.string().optional(),
});

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;

interface ExerciseFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<ExerciseFormValues>;
  onSubmit: (data: ExerciseFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  assetCurrency?: string;
}

export function ExerciseForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
  assetCurrency,
}: ExerciseFormProps) {
  useSettings();

  const initialAccountId =
    defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  const initialCurrency =
    defaultValues?.currency ?? normalizeCurrency(assetCurrency) ?? initialAccount?.currency;

  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema) as Resolver<ExerciseFormValues>,
    mode: "onSubmit",
    defaultValues: {
      accountId: initialAccountId,
      assetId: "",
      activityDate: new Date(),
      quantity: undefined,
      comment: null,
      currency: initialCurrency,
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

            {/* Option Symbol Search */}
            <SymbolSearch
              name="assetId"
              label="Option Contract"
              exchangeMicName="exchangeMic"
              currencyName="currency"
            />

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Exercise Date" />

            {/* Quantity (contracts) */}
            <QuantityInput name="quantity" label="Contracts" />

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
            {isEditing ? "Update" : "Add Exercise"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
