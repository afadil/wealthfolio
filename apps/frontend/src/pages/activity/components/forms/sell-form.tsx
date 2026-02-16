import { useEffect, useMemo } from "react";
import { normalizeCurrency } from "@/lib/utils";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { ActivityType, QuoteMode } from "@/lib/constants";
import { buildOccSymbol } from "@/lib/occ-symbol";
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
  AssetTypeSelector,
  OptionContractFields,
  type AssetType,
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

// Zod schema for SellForm validation
export const sellFormSchema = z.object({
  assetType: z.enum(["stock", "option", "bond"]).default("stock"),
  assetKind: z.string().optional(),
  accountId: z.string().min(1, { message: "Please select an account." }),
  assetId: z.string().default(""),
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
  quoteMode: z.enum([QuoteMode.MARKET, QuoteMode.MANUAL]).default(QuoteMode.MARKET),
  exchangeMic: z.string().optional(),
  symbolQuoteCcy: z.string().optional(),
  symbolInstrumentType: z.string().optional(),
  // Asset metadata for custom assets (name, etc.)
  assetMetadata: assetMetadataSchema,
  // Option-specific fields
  underlyingSymbol: z.string().optional(),
  strikePrice: z.coerce.number().positive().optional(),
  expirationDate: z.string().optional(),
  optionType: z.enum(["CALL", "PUT"]).optional(),
  contractMultiplier: z.coerce.number().positive().default(100).optional(),
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

export function SellForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
  assetCurrency,
}: SellFormProps) {
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialAccountId =
    defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  // Currency priority: provided default > normalized asset currency > account currency
  const initialCurrency =
    defaultValues?.currency ?? normalizeCurrency(assetCurrency) ?? initialAccount?.currency;

  const form = useForm<SellFormValues>({
    resolver: zodResolver(sellFormSchema) as Resolver<SellFormValues>,
    mode: "onSubmit",
    defaultValues: {
      assetType: "stock",
      assetKind: undefined,
      accountId: initialAccountId,
      assetId: "",
      activityDate: (() => {
        const date = new Date();
        date.setHours(16, 0, 0, 0);
        return date;
      })(),
      quantity: undefined,
      unitPrice: undefined,
      fee: 0,
      comment: null,
      currency: initialCurrency,
      fxRate: undefined,
      quoteMode: QuoteMode.MARKET,
      exchangeMic: undefined,
      // Option defaults
      underlyingSymbol: undefined,
      strikePrice: undefined,
      expirationDate: undefined,
      optionType: "CALL",
      contractMultiplier: 100,
      ...defaultValues,
    },
  });

  const { watch, setValue } = form;
  const accountId = watch("accountId");
  const currency = watch("currency");
  const assetId = watch("assetId");
  const quantity = watch("quantity");
  const quoteMode = watch("quoteMode");

  // Set currency from account when account changes and currency is not yet set
  useEffect(() => {
    if (!currency && accountId) {
      const acct = accounts.find((a) => a.value === accountId);
      if (acct?.currency) setValue("currency", acct.currency);
    }
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const assetType = watch("assetType") ?? "stock";
  const isManualAsset = quoteMode === QuoteMode.MANUAL;
  const isOption = assetType === "option";

  // Option total premium calculation
  const optUnitPrice = watch("unitPrice");
  const optFee = watch("fee");
  const optMultiplier = watch("contractMultiplier");

  const optionTotal = useMemo(() => {
    if (!isOption) return 0;
    const q = Number(quantity) || 0;
    const p = Number(optUnitPrice) || 0;
    const f = Number(optFee) || 0;
    const m = Number(optMultiplier) || 100;
    return q * p * m - f;
  }, [isOption, quantity, optUnitPrice, optFee, optMultiplier]);

  const handleAssetTypeChange = (value: AssetType) => {
    if (value === "option") {
      setValue("quoteMode", QuoteMode.MARKET);
      setValue("assetKind", "OPTION");
    } else if (value === "bond") {
      setValue("quoteMode", QuoteMode.MANUAL);
      setValue("assetKind", "BOND");
    } else {
      setValue("quoteMode", QuoteMode.MARKET);
      setValue("assetKind", undefined);
    }
    setValue("assetId", "");
  };

  const quantityLabel = isOption ? "Contracts" : assetType === "bond" ? "Bonds" : "Quantity";
  const priceLabel = isOption ? "Premium/Share" : "Price";
  const symbolPlaceholder =
    assetType === "bond"
      ? "Enter ISIN (e.g. US0378331005) or name"
      : "Enter symbol";

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

  const handleSubmit = form.handleSubmit(async (data) => {
    // Ensure currency is set (required by backend) — fall back to account currency
    if (!data.currency && accountId) {
      data.currency = accounts.find((a) => a.value === accountId)?.currency;
    }
    // For options: build OCC symbol from structured fields
    if (data.assetType === "option" && data.underlyingSymbol && data.strikePrice && data.expirationDate && data.optionType) {
      const occSymbol = buildOccSymbol(data.underlyingSymbol, data.expirationDate, data.optionType, data.strikePrice);
      data.assetId = occSymbol;
      data.assetMetadata = {
        ...data.assetMetadata,
        name: `${data.underlyingSymbol.toUpperCase()} ${data.expirationDate} ${data.optionType} ${data.strikePrice}`,
        kind: "OPTION",
      };
    }
    await onSubmit(data);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-4">
            {/* Account Selection */}
            <AccountSelect name="accountId" accounts={accounts} />

            {/* Asset Type Selector */}
            {!isEditing && (
              <AssetTypeSelector
                control={form.control}
                name="assetType"
                onValueChange={handleAssetTypeChange}
              />
            )}

            {/* Symbol / Option Contract Fields */}
            {isOption ? (
              <OptionContractFields
                underlyingName="underlyingSymbol"
                strikePriceName="strikePrice"
                expirationDateName="expirationDate"
                optionTypeName="optionType"
                contractMultiplierName="contractMultiplier"
                currencyName="currency"
                exchangeMicName="exchangeMic"
              />
            ) : (
              <>
                <SymbolSearch
                  name="assetId"
                  isManualAsset={isManualAsset}
                  placeholder={symbolPlaceholder}
                  exchangeMicName="exchangeMic"
                  quoteModeName="quoteMode"
                  currencyName="currency"
                  quoteCcyName="symbolQuoteCcy"
                  instrumentTypeName="symbolInstrumentType"
                  assetMetadataName="assetMetadata"
                />
                {/* Hidden fields to register assetMetadata for react-hook-form */}
                <input type="hidden" {...form.register("assetMetadata.name")} />
                <input type="hidden" {...form.register("assetMetadata.kind")} />
                <input type="hidden" {...form.register("symbolQuoteCcy")} />
                <input type="hidden" {...form.register("symbolInstrumentType")} />
              </>
            )}

            {/* Date Picker */}
            <DatePicker name="activityDate" label="Date" enableTime={true} />

            {/* Quantity, Price, Fee Row */}
            {isOption && (
              <h4 className="text-muted-foreground text-sm font-medium">Trade Details</h4>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <QuantityInput name="quantity" label={quantityLabel} />
                {!isOption && currentHoldingQuantity > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Available: {currentHoldingQuantity.toLocaleString()}
                  </p>
                )}
              </div>
              <AmountInput name="unitPrice" label={priceLabel} maxDecimalPlaces={4} />
              <AmountInput name="fee" label="Fee" />
            </div>

            {/* Option Total Premium */}
            {isOption && quantity && optUnitPrice && (
              <div className="bg-muted rounded-md p-3 text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-medium">
                  {new Intl.NumberFormat("en-US", {
                    style: "decimal",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(optionTotal)}
                </span>
              </div>
            )}

            {/* Warning for selling more than holdings */}
            {!isOption && isSellingMoreThanHoldings && (
              <Alert variant="default" className="border-warning bg-warning/10">
                <Icons.AlertTriangle className="text-warning h-4 w-4" />
                <AlertDescription className="text-warning text-sm">
                  You are selling more shares ({quantity?.toLocaleString()}) than your current
                  holdings ({currentHoldingQuantity.toLocaleString()}). This may result in a short
                  position.
                </AlertDescription>
              </Alert>
            )}

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              fxRateName="fxRate"
              activityType={ActivityType.SELL}
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
            {isEditing ? "Update" : isOption ? "Sell to Close" : "Add Sell"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
