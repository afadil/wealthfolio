import i18n from "@/i18n/i18n";
import { useSettings } from "@/hooks/use-settings";
import { ActivityType, QuoteMode } from "@/lib/constants";
import { formatAmount } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatedToggleGroup } from "@wealthfolio/ui/components/ui/animated-toggle-group";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@wealthfolio/ui/components/ui/radio-group";
import { useMemo } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  AccountSelect,
  AdvancedOptionsSection,
  AmountInput,
  createValidatedSubmit,
  DatePicker,
  NotesInput,
  QuantityInput,
  SymbolSearch,
  type AccountSelectOption,
} from "./fields";

export type TransferMode = "cash" | "securities";
export type TransferDirection = "in" | "out";

// Asset metadata schema for custom assets
const assetMetadataSchema = z
  .object({
    name: z.string().nullable().optional(),
    kind: z.string().nullable().optional(),
    exchangeMic: z.string().nullable().optional(),
  })
  .optional();

export function createTransferFormSchema() {
  return z
    .object({
      isExternal: z.boolean().default(false),
      direction: z.enum(["in", "out"]).default("in"),
      accountId: z.string().optional(),
      fromAccountId: z.string().optional(),
      toAccountId: z.string().optional(),
      activityDate: z.date({ required_error: i18n.t("activity.validation.select_date") }),
      transferMode: z.enum(["cash", "securities"]).default("cash"),
      amount: z.coerce
        .number({
          invalid_type_error: i18n.t("activity.validation.amount_invalid_type"),
        })
        .positive({ message: i18n.t("activity.validation.amount_greater_than_zero") })
        .optional()
        .nullable(),
      assetId: z.string().optional().nullable(),
      quantity: z.coerce
        .number({
          invalid_type_error: i18n.t("activity.validation.quantity_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.quantity_greater_than_zero") })
        .optional()
        .nullable(),
      unitPrice: z.coerce
        .number({
          invalid_type_error: i18n.t("activity.validation.cost_basis_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.cost_basis_greater_than_zero") })
        .optional()
        .nullable(),
      comment: z.string().optional().nullable(),
      currency: z.string().min(1, { message: i18n.t("activity.validation.currency_required") }),
      fxRate: z.coerce
        .number({
          invalid_type_error: i18n.t("activity.validation.fx_rate_must_be_number"),
        })
        .positive({ message: i18n.t("activity.validation.fx_rate_positive_short") })
        .optional(),
      subtype: z.string().optional().nullable(),
      quoteMode: z.enum([QuoteMode.MARKET, QuoteMode.MANUAL]).default(QuoteMode.MARKET),
      exchangeMic: z.string().nullable().optional(),
      symbolQuoteCcy: z.string().nullable().optional(),
      symbolInstrumentType: z.string().nullable().optional(),
      assetMetadata: assetMetadataSchema,
    })
    .refine(
      (data) => {
        if (data.isExternal) {
          return data.accountId != null && data.accountId.length > 0;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.account_required"),
        path: ["accountId"],
      },
    )
    .refine(
      (data) => {
        if (!data.isExternal) {
          return data.fromAccountId != null && data.fromAccountId.length > 0;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.select_source_account"),
        path: ["fromAccountId"],
      },
    )
    .refine(
      (data) => {
        if (!data.isExternal) {
          return data.toAccountId != null && data.toAccountId.length > 0;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.transfer_destination"),
        path: ["toAccountId"],
      },
    )
    .refine(
      (data) => {
        if (!data.isExternal) {
          return data.fromAccountId !== data.toAccountId;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.source_dest_accounts_different"),
        path: ["toAccountId"],
      },
    )
    .refine(
      (data) => {
        if (data.transferMode === "cash") {
          return data.amount != null && data.amount > 0;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.transfer_amount"),
        path: ["amount"],
      },
    )
    .refine(
      (data) => {
        if (data.transferMode === "securities") {
          return data.assetId != null && data.assetId.length > 0;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.transfer_symbol"),
        path: ["assetId"],
      },
    )
    .refine(
      (data) => {
        if (data.transferMode === "securities") {
          return data.quantity != null && data.quantity > 0;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.transfer_quantity"),
        path: ["quantity"],
      },
    )
    .refine(
      (data) => {
        if (data.transferMode === "securities" && data.isExternal && data.direction === "in") {
          return data.unitPrice != null && data.unitPrice > 0;
        }
        return true;
      },
      {
        message: i18n.t("activity.validation.transfer_cost_basis"),
        path: ["unitPrice"],
      },
    );
}

export type TransferFormValues = z.infer<ReturnType<typeof createTransferFormSchema>>;

interface TransferFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<TransferFormValues> & {
    transferMode?: TransferMode;
    isExternal?: boolean;
    direction?: TransferDirection;
  };
  onSubmit: (data: TransferFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  /** Asset currency (from selected symbol) for advanced options */
  assetCurrency?: string;
}

export function TransferForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
  assetCurrency,
}: TransferFormProps) {
  const { t, i18n } = useTranslation();
  const transferFormSchema = useMemo(() => createTransferFormSchema(), [i18n.language]);
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  // Compute initial account and currency for defaultValues
  const initialFromAccountId = defaultValues?.fromAccountId ?? "";
  const initialAccountId = defaultValues?.accountId ?? "";
  const initialAccount = accounts.find(
    (a) => a.value === initialFromAccountId || a.value === initialAccountId,
  );
  const initialCurrency =
    defaultValues?.currency?.trim() || assetCurrency?.trim() || initialAccount?.currency;

  // Determine initial transfer mode from defaults
  const initialTransferMode: TransferMode =
    defaultValues?.transferMode ?? (defaultValues?.assetId ? "securities" : "cash");

  // Determine initial external state
  const initialIsExternal = defaultValues?.isExternal ?? false;
  const initialDirection: TransferDirection = defaultValues?.direction ?? "in";

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema) as Resolver<TransferFormValues>,
    mode: "onSubmit", // Validate only on submit - works correctly with default values
    defaultValues: {
      isExternal: initialIsExternal,
      direction: initialDirection,
      accountId: initialAccountId,
      fromAccountId: initialFromAccountId,
      toAccountId: "",
      activityDate: new Date(),
      transferMode: initialTransferMode,
      amount: undefined,
      assetId: null,
      quantity: null,
      unitPrice: null,
      comment: null,
      fxRate: undefined,
      subtype: null,
      quoteMode: QuoteMode.MARKET,
      exchangeMic: undefined,
      ...defaultValues,
      currency: defaultValues?.currency?.trim() || initialCurrency,
    },
  });

  const { watch, setValue } = form;
  const isExternal = watch("isExternal");
  const direction = watch("direction");
  const accountId = watch("accountId");
  const fromAccountId = watch("fromAccountId");
  const currency = watch("currency");
  const quoteMode = watch("quoteMode");
  const transferMode = watch("transferMode");
  const amount = watch("amount");
  const assetId = watch("assetId");
  const quantity = watch("quantity");
  const isManualAsset = quoteMode === QuoteMode.MANUAL;
  const isCashMode = transferMode === "cash";

  // Get account currency from selected account (internal: fromAccount, external: accountId)
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.value === (isExternal ? accountId : fromAccountId)),
    [accounts, fromAccountId, accountId, isExternal],
  );
  const accountCurrency = selectedAccount?.currency;

  // Toggle items for transfer mode
  const transferModeItems = [
    { value: "cash" as const, label: t("activity.form.transfer.mode_cash") },
    { value: "securities" as const, label: t("activity.form.transfer.mode_securities") },
  ];

  // Handle transfer mode change
  const handleTransferModeChange = (mode: TransferMode) => {
    setValue("transferMode", mode, { shouldValidate: false });
    // Clear irrelevant fields when switching modes
    if (mode === "cash") {
      setValue("assetId", null);
      setValue("quantity", null);
      setValue("unitPrice", null);
    } else {
      setValue("amount", null);
    }
  };

  // Handle external toggle change
  const handleExternalChange = (checked: boolean) => {
    setValue("isExternal", checked, { shouldValidate: false });
    // Reset account fields when toggling
    if (checked) {
      // Switching to external: copy fromAccountId to accountId if set
      if (fromAccountId) {
        setValue("accountId", fromAccountId);
      }
      setValue("fromAccountId", "");
      setValue("toAccountId", "");
    } else {
      // Switching to internal: copy accountId to fromAccountId if set
      if (accountId) {
        setValue("fromAccountId", accountId);
      }
      setValue("accountId", "");
    }
  };

  // Handle direction change
  const handleDirectionChange = (value: string) => {
    setValue("direction", value as TransferDirection, { shouldValidate: false });
  };

  // Generate dynamic submit button text
  const getSubmitButtonText = () => {
    if (isEditing) return t("activity.form.update");

    const actionPrefix = isExternal
      ? direction === "in"
        ? t("activity.form.transfer.action_in")
        : t("activity.form.transfer.action_out")
      : t("activity.form.transfer.action");

    if (isCashMode && amount && amount > 0) {
      const displayCurrency = initialCurrency || accountCurrency || baseCurrency;
      return `${actionPrefix} ${formatAmount(amount, displayCurrency, false)}`;
    }

    if (!isCashMode && assetId && quantity && quantity > 0) {
      return `${actionPrefix} ${quantity} ${assetId}`;
    }

    return isExternal
      ? direction === "in"
        ? t("activity.form.transfer.add_in")
        : t("activity.form.transfer.add_out")
      : t("activity.form.transfer.add");
  };

  // Filter destination accounts to exclude source account (for internal transfers)
  const toAccountOptions = accounts.filter((acc) => acc.value !== fromAccountId);

  const handleSubmit = createValidatedSubmit(form, async (data) => {
    // Ensure symbolQuoteCcy is set — manual/custom symbols leave it undefined
    if (!data.symbolQuoteCcy && data.currency) {
      data.symbolQuoteCcy = data.currency;
    }
    await onSubmit(data);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-4">
            {/* Transfer Mode Toggle */}
            <div className="flex justify-center">
              <AnimatedToggleGroup
                items={transferModeItems}
                value={transferMode}
                onValueChange={handleTransferModeChange}
                size="sm"
                rounded="lg"
              />
            </div>

            {/* External Transfer Option */}
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isExternal"
                  checked={isExternal}
                  onCheckedChange={handleExternalChange}
                />
                <Label htmlFor="isExternal" className="cursor-pointer text-sm font-normal">
                  {t("activity.form.transfer.external_label")}
                </Label>
              </div>

              {/* Direction selector (only for external) */}
              {isExternal && (
                <>
                  <span className="text-muted-foreground">|</span>
                  <RadioGroup
                    value={direction}
                    onValueChange={handleDirectionChange}
                    className="flex gap-3"
                  >
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="in" id="direction-in" />
                      <Label htmlFor="direction-in" className="cursor-pointer text-sm font-normal">
                        {t("activity.form.transfer.direction_in")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <RadioGroupItem value="out" id="direction-out" />
                      <Label htmlFor="direction-out" className="cursor-pointer text-sm font-normal">
                        {t("activity.form.transfer.direction_out")}
                      </Label>
                    </div>
                  </RadioGroup>
                </>
              )}
            </div>

            {/* Account Selection - conditional based on external flag */}
            {isExternal ? (
              <AccountSelect
                name="accountId"
                accounts={accounts}
                currencyName="currency"
                label={
                  direction === "in"
                    ? t("activity.form.transfer.label_to_in")
                    : t("activity.form.transfer.label_from_out")
                }
                placeholder={t("activity.form.transfer.placeholder_account")}
              />
            ) : (
              <>
                {/* From Account Selection */}
                <AccountSelect
                  name="fromAccountId"
                  accounts={accounts}
                  currencyName="currency"
                  label={t("activity.form.fields.fromAccountId")}
                  placeholder={t("activity.form.transfer.placeholder_source")}
                />

                {/* To Account Selection */}
                <AccountSelect
                  name="toAccountId"
                  accounts={toAccountOptions}
                  label={t("activity.form.fields.toAccountId")}
                  placeholder={t("activity.form.transfer.placeholder_destination")}
                />
              </>
            )}

            {/* Date Picker */}
            <DatePicker name="activityDate" label={t("activity.form.fields.activityDate")} />

            {/* Securities mode: Symbol and Quantity at top */}
            {!isCashMode && (
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
                <QuantityInput name="quantity" label={t("activity.form.fields.quantity")} />
                {/* Cost basis only needed for external transfer in - backend calculates for transfer out */}
                {isExternal && direction === "in" && (
                  <AmountInput
                    name="unitPrice"
                    label={t("activity.form.fields.costBasis")}
                    maxDecimalPlaces={4}
                    currency={currency}
                  />
                )}
              </>
            )}

            {/* Cash mode: Amount */}
            {isCashMode && (
              <AmountInput name="amount" label={t("activity.form.fields.amount")} currency={currency} />
            )}

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              fxRateName="fxRate"
              subtypeName="subtype"
              activityType={ActivityType.TRANSFER_IN}
              assetCurrency={assetCurrency}
              accountCurrency={accountCurrency}
              baseCurrency={baseCurrency}
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
            {getSubmitButtonText()}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
