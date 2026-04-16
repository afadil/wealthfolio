import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { normalizeCurrency } from "@/lib/utils";
import { useForm, FormProvider, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import i18n from "@/i18n/i18n";
import { ActivityType, QuoteMode } from "@/lib/constants";
import { buildOccSymbol } from "@/lib/occ-symbol";
import { useSettings } from "@/hooks/use-settings";
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
  createValidatedSubmit,
  type AssetType,
  type AccountSelectOption,
} from "./fields";

// Asset metadata schema for custom assets
const assetMetadataSchema = z
  .object({
    name: z.string().nullable().optional(),
    kind: z.string().nullable().optional(),
    exchangeMic: z.string().nullable().optional(),
  })
  .optional();

// Zod schema for BuyForm validation (locale-aware messages)
export function createBuyFormSchema() {
  return z
    .object({
      assetType: z.enum(["stock", "option", "bond"]).default("stock"),
      assetKind: z.string().optional(),
      accountId: z.string().min(1, { message: i18n.t("activity.validation.account_required") }),
      assetId: z.string().default(""),
      activityDate: z.date({ required_error: i18n.t("activity.validation.select_date") }),
      quantity: z.coerce
        .number({
          required_error: i18n.t("activity.validation.enter_quantity"),
          invalid_type_error: i18n.t("activity.validation.quantity_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.quantity_greater_than_zero") }),
      unitPrice: z.coerce
        .number({
          required_error: i18n.t("activity.validation.enter_price"),
          invalid_type_error: i18n.t("activity.validation.price_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.price_greater_than_zero") }),
      fee: z.coerce
        .number({
          invalid_type_error: i18n.t("activity.validation.fee_must_be_number"),
        })
        .min(0, { message: i18n.t("activity.validation.fee_must_be_non_negative") })
        .default(0),
      comment: z.string().optional().nullable(),
      currency: z.string().min(1, { message: i18n.t("activity.validation.currency_required") }),
      fxRate: z.coerce
        .number({
          invalid_type_error: i18n.t("activity.validation.fx_rate_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.fx_rate_positive_short") })
        .optional(),
      quoteMode: z.enum([QuoteMode.MARKET, QuoteMode.MANUAL]).default(QuoteMode.MARKET),
      exchangeMic: z.string().nullable().optional(),
      symbolQuoteCcy: z.string().nullable().optional(),
      symbolInstrumentType: z.string().nullable().optional(),
      assetMetadata: assetMetadataSchema,
      underlyingSymbol: z.string().optional(),
      strikePrice: z.coerce.number().positive().optional(),
      expirationDate: z.string().optional(),
      optionType: z.enum(["CALL", "PUT"]).optional(),
      contractMultiplier: z.coerce.number().positive().default(100).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.assetType !== "option" && (!data.assetId || data.assetId.trim() === "")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: i18n.t("activity.validation.enter_symbol"),
          path: ["assetId"],
        });
      }
      if (data.assetType === "option") {
        if (!data.underlyingSymbol?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: i18n.t("activity.validation.option_underlying"),
            path: ["underlyingSymbol"],
          });
        }
        if (!data.strikePrice || data.strikePrice <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: i18n.t("activity.validation.option_strike"),
            path: ["strikePrice"],
          });
        }
        if (!data.expirationDate?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: i18n.t("activity.validation.option_expiration"),
            path: ["expirationDate"],
          });
        }
        if (!data.optionType) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: i18n.t("activity.validation.option_type"),
            path: ["optionType"],
          });
        }
      }
    });
}

export type BuyFormValues = z.infer<ReturnType<typeof createBuyFormSchema>>;

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

export function BuyForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
  assetCurrency,
}: BuyFormProps) {
  const { t, i18n } = useTranslation("common");
  const buyFormSchema = useMemo(() => createBuyFormSchema(), [i18n.language]);
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialAccountId =
    defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  // Currency priority: provided default > normalized asset currency > account currency
  const initialCurrency =
    defaultValues?.currency?.trim() || assetCurrency?.trim() || initialAccount?.currency;

  const form = useForm<BuyFormValues>({
    resolver: zodResolver(buyFormSchema) as Resolver<BuyFormValues>,
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
      currency: defaultValues?.currency?.trim() || initialCurrency,
    },
  });

  const { watch, setValue } = form;
  const accountId = watch("accountId");
  const currency = watch("currency");
  const quoteMode = watch("quoteMode");
  const symbolQuoteCcy = watch("symbolQuoteCcy");

  // Set currency from account when account changes and currency is not yet set
  useEffect(() => {
    if (!currency && accountId) {
      const acct = accounts.find((a) => a.value === accountId);
      if (acct?.currency) setValue("currency", acct.currency);
    }
  }, [accountId, currency, accounts, setValue]);
  const assetType = watch("assetType") ?? "stock";
  const isManualAsset = quoteMode === QuoteMode.MANUAL;
  const isOption = assetType === "option";

  // Option total premium calculation
  const optQuantity = watch("quantity");
  const optUnitPrice = watch("unitPrice");
  const optFee = watch("fee");
  const optMultiplier = watch("contractMultiplier");

  const optionTotal = useMemo(() => {
    if (!isOption) return 0;
    const q = Number(optQuantity) || 0;
    const p = Number(optUnitPrice) || 0;
    const f = Number(optFee) || 0;
    const m = Number(optMultiplier) || 100;
    return q * p * m + f;
  }, [isOption, optQuantity, optUnitPrice, optFee, optMultiplier]);

  const handleAssetTypeChange = (value: AssetType) => {
    if (value === "option") {
      setValue("quoteMode", QuoteMode.MARKET);
      setValue("assetKind", "OPTION");
    } else if (value === "bond") {
      setValue("quoteMode", QuoteMode.MARKET);
      setValue("assetKind", "BOND");
    } else {
      setValue("quoteMode", QuoteMode.MARKET);
      setValue("assetKind", undefined);
    }
    setValue("assetId", "");
  };

  const quantityLabel = isOption
    ? t("activity.form.quantity.contracts")
    : assetType === "bond"
      ? t("activity.form.quantity.bonds")
      : t("activity.form.fields.quantity");
  const priceLabel = isOption
    ? t("activity.form.price.premium_per_share")
    : t("activity.form.fields.unitPrice");
  // Get account currency from selected account
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.value === accountId),
    [accounts, accountId],
  );
  const accountCurrency = selectedAccount?.currency;
  const assetCurrencyFromSymbol = normalizeCurrency(symbolQuoteCcy ?? undefined)?.toUpperCase();

  const handleSubmit = createValidatedSubmit(form, async (data) => {
    // Ensure currency is set (required by backend) — fall back to account currency
    if (!data.currency && accountId) {
      data.currency = accounts.find((a) => a.value === accountId)?.currency ?? data.currency;
    }
    // Ensure symbolQuoteCcy is set — manual/custom symbols leave it undefined
    if (!data.symbolQuoteCcy && data.currency) {
      data.symbolQuoteCcy = data.currency;
    }
    // For options: build OCC symbol from structured fields
    if (
      data.assetType === "option" &&
      data.underlyingSymbol &&
      data.strikePrice &&
      data.expirationDate &&
      data.optionType
    ) {
      const occSymbol = buildOccSymbol(
        data.underlyingSymbol,
        data.expirationDate,
        data.optionType,
        data.strikePrice,
      );
      data.assetId = occSymbol;
      data.symbolInstrumentType = "OPTION";
      data.assetMetadata = {
        ...data.assetMetadata,
        name: `${data.underlyingSymbol.toUpperCase()} ${data.expirationDate} ${data.optionType} ${data.strikePrice}`,
        kind: "OPTION",
      };
    }
    // For bonds: set instrument type
    if (data.assetType === "bond") {
      data.symbolInstrumentType = data.symbolInstrumentType ?? "BOND";
    }
    await onSubmit(data);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-4">
            {/* Asset Type Selector */}
            {!isEditing && (
              <AssetTypeSelector
                control={form.control}
                name="assetType"
                onValueChange={handleAssetTypeChange}
              />
            )}

            {/* Account Selection */}
            <AccountSelect name="accountId" accounts={accounts} currencyName="currency" />

            {/* Date Picker */}
            <DatePicker name="activityDate" label={t("activity.form.fields.activityDate")} enableTime={true} />

            {/* Symbol / Option Contract Fields */}
            {isOption ? (
              <OptionContractFields
                underlyingName="underlyingSymbol"
                strikePriceName="strikePrice"
                expirationDateName="expirationDate"
                optionTypeName="optionType"
                currencyName="currency"
                exchangeMicName="exchangeMic"
                quoteCcyName="symbolQuoteCcy"
                unitPriceName="unitPrice"
              />
            ) : (
              <>
                <SymbolSearch
                  name="assetId"
                  isManualAsset={isManualAsset}
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

            {/* Quantity, Price, Fee Row */}
            {isOption && (
              <h4 className="text-muted-foreground text-sm font-medium">{t("activity.form.trade_details")}</h4>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <QuantityInput name="quantity" label={quantityLabel} />
                {/* Shares breakdown with click-to-edit multiplier */}
                {isOption && optQuantity && (
                  <div className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
                    <span>
                      {t("activity.form.option_shares_equivalent", {
                        count: Number(optQuantity) * (Number(optMultiplier) || 100),
                      })}
                    </span>
                    <span>·</span>
                    <input
                      type="number"
                      {...form.register("contractMultiplier", { valueAsNumber: true })}
                      className="hover:border-input focus:border-input focus:bg-background focus:ring-ring h-5 w-14 rounded border border-transparent bg-transparent px-1 text-center text-xs tabular-nums focus:outline-none focus:ring-1"
                      aria-label={t("activity.form.contract_multiplier_aria")}
                    />
                    <span>x</span>
                  </div>
                )}
              </div>
              <AmountInput
                name="unitPrice"
                label={priceLabel}
                maxDecimalPlaces={4}
                currency={currency}
              />
              <AmountInput name="fee" label={t("activity.form.fields.fee")} currency={currency} />
            </div>

            {/* Option Total Premium with formula breakdown */}
            {isOption && optQuantity && optUnitPrice && (
              <div className="bg-muted/50 border-border rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-muted-foreground text-xs font-medium uppercase">
                      {t("activity.form.total_debit")}
                    </span>
                    <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                      {Number(optQuantity)} ×{" "}
                      {currency
                        ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
                            Number(optUnitPrice),
                          )
                        : Number(optUnitPrice)}{" "}
                      × {Number(optMultiplier) || 100}
                      {Number(optFee) > 0 && (
                        <>
                          {" "}
                          +{" "}
                          {currency
                            ? new Intl.NumberFormat("en-US", {
                                style: "currency",
                                currency,
                              }).format(Number(optFee))
                            : Number(optFee)}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums">
                    {new Intl.NumberFormat("en-US", {
                      style: currency ? "currency" : "decimal",
                      currency: currency || undefined,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(optionTotal)}
                  </span>
                </div>
              </div>
            )}

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              fxRateName="fxRate"
              activityType={ActivityType.BUY}
              assetCurrency={assetCurrencyFromSymbol ?? normalizeCurrency(assetCurrency)}
              accountCurrency={accountCurrency}
              baseCurrency={baseCurrency}
              showSubtype={false}
            />

            {/* Notes */}
            <NotesInput name="comment" />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              {t("activity.form.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? (
              <Icons.Check className="mr-2 h-4 w-4" />
            ) : (
              <Icons.Plus className="mr-2 h-4 w-4" />
            )}
            {isEditing
              ? t("activity.form.update")
              : isOption
                ? t("activity.form.submit.buy_to_open")
                : t("activity.form.submit.add_buy")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
