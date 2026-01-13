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
  QuantityInput,
  NotesInput,
  type AccountSelectOption,
} from "./fields";
import { PricingMode } from "@/lib/constants";

// Zod schema for TransferForm validation
export const transferFormSchema = z
  .object({
    fromAccountId: z.string().min(1, { message: "Please select a source account." }),
    toAccountId: z.string().min(1, { message: "Please select a destination account." }),
    activityDate: z.date({ required_error: "Please select a date." }),
    amount: z.coerce
      .number({
        required_error: "Please enter an amount.",
        invalid_type_error: "Amount must be a number.",
      })
      .positive({ message: "Amount must be greater than 0." }),
    // Optional fields for security transfers
    assetId: z.string().optional().nullable(),
    quantity: z.coerce
      .number({
        invalid_type_error: "Quantity must be a number.",
      })
      .positive({ message: "Quantity must be greater than 0." })
      .optional()
      .nullable(),
    comment: z.string().optional().nullable(),
    // Internal field for manual pricing mode
    pricingMode: z.enum([PricingMode.MARKET, PricingMode.MANUAL]).default(PricingMode.MARKET),
    exchangeMic: z.string().optional(),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: "Source and destination accounts must be different.",
    path: ["toAccountId"],
  });

export type TransferFormValues = z.infer<typeof transferFormSchema>;

interface TransferFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<TransferFormValues>;
  onSubmit: (data: TransferFormValues) => void | Promise<void>;
  isLoading?: boolean;
}

export function TransferForm({
  accounts,
  defaultValues,
  onSubmit,
  isLoading = false,
}: TransferFormProps) {
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema) as Resolver<TransferFormValues>,
    mode: "onBlur", // Validate on blur
    defaultValues: {
      fromAccountId: "",
      toAccountId: "",
      activityDate: new Date(),
      amount: undefined,
      assetId: null,
      quantity: null,
      comment: null,
      pricingMode: PricingMode.MARKET,
      exchangeMic: undefined,
      ...defaultValues,
    },
  });

  const { watch } = form;
  const fromAccountId = watch("fromAccountId");
  const pricingMode = watch("pricingMode");
  const isManualAsset = pricingMode === PricingMode.MANUAL;

  // Filter destination accounts to exclude source account
  const toAccountOptions = accounts.filter((acc) => acc.value !== fromAccountId);

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-4">
            {/* From Account Selection */}
            <AccountSelect
              name="fromAccountId"
              accounts={accounts}
              label="From Account"
              placeholder="Select source account..."
            />

            {/* To Account Selection */}
            <AccountSelect
              name="toAccountId"
              accounts={toAccountOptions}
              label="To Account"
              placeholder="Select destination account..."
            />

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" />

            {/* Amount */}
            <AmountInput name="amount" label="Amount" />

            {/* Optional Symbol for security transfers */}
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                Optional: For transferring securities between accounts
              </p>
              <SymbolSearch
                name="assetId"
                isManualAsset={isManualAsset}
                exchangeMicName="exchangeMic"
                pricingModeName="pricingMode"
              />
            </div>

            {/* Optional Quantity for security transfers */}
            <QuantityInput name="quantity" label="Quantity (optional)" />

            {/* Notes */}
            <NotesInput name="comment" label="Notes" placeholder="Add an optional note..." />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
            <Icons.Plus className="mr-2 h-4 w-4" />
            Add Transfer
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
