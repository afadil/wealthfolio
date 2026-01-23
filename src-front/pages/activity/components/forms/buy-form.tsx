import { useMemo } from "react";
import { normalizeCurrency } from "@/lib/utils";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { ActivityType, PricingMode } from "@/lib/constants";
import { useSettings } from "@/hooks/use-settings";
import {
  AccountSelect,
  SymbolSearch,
  DatePicker,
  AmountInput,
  QuantityInput,
  NotesInput,
  AdvancedOptionsSection,
  type AccountSelectOption,
} from "./fields";

// Asset metadata schema for custom assets
const assetMetadataSchema = z
  .object({
    name: z.string().optional(),
    kind: z.string().optional(),
    exchangeMic: z.string().optional(),
  })
  .optional();

// Zod schema for BuyForm validation
export const buyFormSchema = z.object({
  accountId: z.string().min(1, { message: "Please select an account." }),
  assetId: z.string().min(1, { message: "Please enter a symbol." }),
  activityDate: z.date({ required_error: "Please select a date." }),
  quantity: z.coerce
    .number({
      required_error: "Please enter a quantity.",
      invalid_type_error: "Quantity must be a number.",
    })
    .positive({ message: "Quantity must be greater than 0." }),
  unitPrice: z.coerce
    .number({
      required_error: "Please enter a price.",
      invalid_type_error: "Price must be a number.",
    })
    .positive({ message: "Price must be greater than 0." }),
  fee: z.coerce
    .number({
      invalid_type_error: "Fee must be a number.",
    })
    .min(0, { message: "Fee must be non-negative." })
    .default(0),
  comment: z.string().optional().nullable(),
  // Advanced options
  currency: z.string().optional(),
  fxRate: z.coerce
    .number({
      invalid_type_error: "FX Rate must be a number.",
    })
    .positive({ message: "FX Rate must be positive." })
    .optional(),
  // Internal fields
  pricingMode: z.enum([PricingMode.MARKET, PricingMode.MANUAL]).default(PricingMode.MARKET),
  exchangeMic: z.string().optional(),
  // Asset metadata for custom assets (name, etc.)
  assetMetadata: assetMetadataSchema,
});

export type BuyFormValues = z.infer<typeof buyFormSchema>;

interface BuyFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<BuyFormValues>;
  onSubmit: (data: BuyFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  /** Asset currency (from selected symbol) for advanced options */
  assetCurrency?: string;
}

/**
 * Calculates the expected amount from quantity, price, and fee.
 * Amount = (quantity * price) + fee
 */
function calculateAmount(quantity: number | undefined, unitPrice: number | undefined, fee: number | undefined): number {
  const qty = quantity || 0;
  const price = unitPrice || 0;
  const feeVal = fee || 0;
  return qty * price + feeVal;
}

export function BuyForm({ accounts, defaultValues, onSubmit, onCancel, isLoading = false, isEditing = false, assetCurrency }: BuyFormProps) {
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialAccountId = defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  // Currency priority: provided default > normalized asset currency > account currency
  const initialCurrency =
    defaultValues?.currency ??
    normalizeCurrency(assetCurrency) ??
    initialAccount?.currency;

  const form = useForm<BuyFormValues>({
    resolver: zodResolver(buyFormSchema) as Resolver<BuyFormValues>,
    mode: "onSubmit", // Validate only on submit - works correctly with default values
    defaultValues: {
      accountId: initialAccountId,
      assetId: "",
      activityDate: (() => {
        const date = new Date();
        date.setHours(16, 0, 0, 0); // Market close time
        return date;
      })(),
      quantity: undefined,
      unitPrice: undefined,
      fee: 0,
      comment: null,
      currency: initialCurrency,
      fxRate: undefined,
      pricingMode: PricingMode.MARKET,
      exchangeMic: undefined,
      ...defaultValues,
    },
  });

  const { watch } = form;
  const accountId = watch("accountId");
  const quantity = watch("quantity");
  const unitPrice = watch("unitPrice");
  const fee = watch("fee");
  const currency = watch("currency");
  const pricingMode = watch("pricingMode");
  const isManualAsset = pricingMode === PricingMode.MANUAL;

  // Get account currency from selected account
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.value === accountId),
    [accounts, accountId],
  );
  const accountCurrency = selectedAccount?.currency;

  // Calculate expected amount
  const calculatedAmount = useMemo(
    () => calculateAmount(quantity, unitPrice, fee),
    [quantity, unitPrice, fee],
  );

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

            {/* Symbol Search */}
            <SymbolSearch
              name="assetId"
              isManualAsset={isManualAsset}
              exchangeMicName="exchangeMic"
              pricingModeName="pricingMode"
              currencyName="currency"
              assetMetadataName="assetMetadata"
            />
            {/* Hidden fields to register assetMetadata for react-hook-form */}
            <input type="hidden" {...form.register("assetMetadata.name")} />
            <input type="hidden" {...form.register("assetMetadata.kind")} />

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" enableTime={true} />

            {/* Quantity, Price, Fee Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <QuantityInput name="quantity" label="Quantity" />
              <AmountInput name="unitPrice" label="Price" maxDecimalPlaces={4} />
              <AmountInput name="fee" label="Fee" />
            </div>
            {calculatedAmount > 0 && (
              <p className="text-muted-foreground text-sm">
                Amount: {calculatedAmount.toFixed(2)}{currency && ` ${currency}`}
              </p>
            )}

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              fxRateName="fxRate"
              activityType={ActivityType.BUY}
              assetCurrency={assetCurrency}
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
            {isEditing ? "Update" : "Add Buy"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
