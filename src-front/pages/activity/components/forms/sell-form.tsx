import { useEffect, useMemo } from "react";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { ActivityType, PricingMode } from "@/lib/constants";
import { useSettings } from "@/hooks/use-settings";
import { useHoldings } from "@/hooks/use-holdings";
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

// Zod schema for SellForm validation
export const sellFormSchema = z.object({
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
  amount: z.coerce
    .number({
      invalid_type_error: "Amount must be a number.",
    })
    .nonnegative({ message: "Amount must be non-negative." })
    .optional(),
  fee: z.coerce
    .number({
      invalid_type_error: "Fee must be a number.",
    })
    .min(0, { message: "Fee must be non-negative." })
    .default(0),
  comment: z.string().optional().nullable(),
  // Advanced options
  currency: z.string().optional(),
  subtype: z.string().optional().nullable(),
  // Internal fields
  pricingMode: z.enum([PricingMode.MARKET, PricingMode.MANUAL]).default(PricingMode.MARKET),
  exchangeMic: z.string().optional(),
});

export type SellFormValues = z.infer<typeof sellFormSchema>;

interface SellFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<SellFormValues>;
  onSubmit: (data: SellFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  /** Asset currency (from selected symbol) for advanced options */
  assetCurrency?: string;
}

/**
 * Calculates the expected amount from quantity, price, and fee.
 * For SELL: Amount = (quantity * price) - fee
 */
function calculateAmount(quantity: number | undefined, unitPrice: number | undefined, fee: number | undefined): number {
  const qty = quantity || 0;
  const price = unitPrice || 0;
  const feeVal = fee || 0;
  return Math.max(0, qty * price - feeVal);
}

/**
 * Checks if the manual amount differs from calculated by more than threshold percentage.
 */
function isAmountDifferenceSignificant(
  manualAmount: number | undefined,
  calculatedAmount: number,
  thresholdPercent = 1,
): boolean {
  if (manualAmount === undefined || manualAmount === 0 || calculatedAmount === 0) {
    return false;
  }
  const difference = Math.abs(manualAmount - calculatedAmount);
  const percentDiff = (difference / calculatedAmount) * 100;
  return percentDiff > thresholdPercent;
}

export function SellForm({ accounts, defaultValues, onSubmit, onCancel, isLoading = false, isEditing = false, assetCurrency }: SellFormProps) {
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  const form = useForm<SellFormValues>({
    resolver: zodResolver(sellFormSchema) as Resolver<SellFormValues>,
    mode: "onBlur", // Validate on blur
    defaultValues: {
      accountId: accounts.length === 1 ? accounts[0].value : "",
      assetId: "",
      activityDate: (() => {
        const date = new Date();
        date.setHours(16, 0, 0, 0); // Market close time
        return date;
      })(),
      quantity: undefined,
      unitPrice: undefined,
      amount: undefined,
      fee: 0,
      comment: null,
      currency: undefined,
      subtype: null,
      pricingMode: PricingMode.MARKET,
      exchangeMic: undefined,
      ...defaultValues,
    },
  });

  const { watch, setValue } = form;
  const accountId = watch("accountId");
  const assetId = watch("assetId");
  const quantity = watch("quantity");
  const unitPrice = watch("unitPrice");
  const fee = watch("fee");
  const amount = watch("amount");
  const pricingMode = watch("pricingMode");
  const isManualAsset = pricingMode === PricingMode.MANUAL;

  // Get account currency from selected account
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.value === accountId),
    [accounts, accountId],
  );
  const accountCurrency = selectedAccount?.currency;

  // Fetch holdings for the selected account to check available quantity
  const { holdings } = useHoldings(accountId);

  // Find the current holding quantity for the selected symbol
  const currentHoldingQuantity = useMemo(() => {
    if (!assetId || !holdings) return 0;
    const holding = holdings.find((h) => h.instrument?.symbol === assetId || h.id === assetId);
    return holding?.quantity ?? 0;
  }, [assetId, holdings]);

  // Check if selling more than current holdings
  const isSellingMoreThanHoldings = useMemo(() => {
    if (!quantity || quantity <= 0 || !assetId) return false;
    return quantity > currentHoldingQuantity;
  }, [quantity, currentHoldingQuantity, assetId]);

  // Calculate expected amount
  const calculatedAmount = useMemo(
    () => calculateAmount(quantity, unitPrice, fee),
    [quantity, unitPrice, fee],
  );

  // Auto-update amount when quantity, price, or fee changes
  useEffect(() => {
    if (quantity && unitPrice) {
      // Only auto-set if amount hasn't been manually modified or is undefined
      if (amount === undefined || amount === 0) {
        setValue("amount", calculatedAmount, { shouldValidate: false });
      }
    }
  }, [calculatedAmount, quantity, unitPrice, setValue, amount]);

  // Check if manual amount differs significantly from calculated
  const showAmountWarning = useMemo(
    () => isAmountDifferenceSignificant(amount, calculatedAmount, 1),
    [amount, calculatedAmount],
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
            />

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" enableTime={true} />

            {/* Quantity, Price, Fee Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <QuantityInput name="quantity" label="Quantity" />
                {currentHoldingQuantity > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Available: {currentHoldingQuantity.toLocaleString()}
                  </p>
                )}
              </div>
              <AmountInput name="unitPrice" label="Price" maxDecimalPlaces={4} />
              <AmountInput name="fee" label="Fee" />
            </div>

            {/* Warning for selling more than holdings */}
            {isSellingMoreThanHoldings && (
              <Alert variant="default" className="border-warning bg-warning/10">
                <Icons.AlertTriangle className="text-warning h-4 w-4" />
                <AlertDescription className="text-warning text-sm">
                  You are selling more shares ({quantity?.toLocaleString()}) than your current holdings (
                  {currentHoldingQuantity.toLocaleString()}). This may result in a short position.
                </AlertDescription>
              </Alert>
            )}

            {/* Amount (Calculated) */}
            <div className="space-y-2">
              <AmountInput name="amount" label="Amount" />
              {calculatedAmount > 0 && (
                <p className="text-muted-foreground text-xs">
                  Calculated: {calculatedAmount.toFixed(2)} (quantity × price - fee)
                </p>
              )}
              {showAmountWarning && (
                <Alert variant="default" className="border-warning bg-warning/10">
                  <Icons.AlertTriangle className="text-warning h-4 w-4" />
                  <AlertDescription className="text-warning text-xs">
                    The entered amount differs from the calculated value by more than 1%. Expected:{" "}
                    {calculatedAmount.toFixed(2)}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              subtypeName="subtype"
              activityType={ActivityType.SELL}
              assetCurrency={assetCurrency}
              accountCurrency={accountCurrency}
              baseCurrency={baseCurrency}
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
            {isEditing ? "Update" : "Add Sell"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
