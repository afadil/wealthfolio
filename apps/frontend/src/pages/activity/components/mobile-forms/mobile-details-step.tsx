import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { AnimatedToggleGroup } from "@wealthfolio/ui/components/ui/animated-toggle-group";
import { ACTIVITY_SUBTYPES, QuoteMode, type ActivityType } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import {
  AdvancedOptionsSection,
  SymbolSearch,
  AssetTypeSelector,
  OptionContractFields,
  type AssetType,
  type AccountSelectOption,
} from "../forms/fields";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@wealthfolio/ui/components/ui/radio-group";
import {
  Button,
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Icons,
  MoneyInput,
  QuantityInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui";
import { useEffect, useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { restrictionAllowsType } from "@/lib/activity-restrictions";
import type { NewActivityFormValues } from "../forms/schemas";

interface MobileDetailsStepProps {
  accounts: AccountSelectOption[];
  activityType: string;
  isEditing?: boolean;
}

export function MobileDetailsStep({ accounts, activityType, isEditing }: MobileDetailsStepProps) {
  const { t } = useTranslation();
  const { control, getFieldState, getValues, watch, setValue, register } =
    useFormContext<NewActivityFormValues>();
  const { settings } = useSettingsContext();
  const isManualAsset = watch("quoteMode") === QuoteMode.MANUAL;
  const accountId = watch("accountId");
  const currency = watch("currency");

  // Filter accounts by activity type (exclude HOLDINGS accounts for unsupported types)
  const filteredAccounts = useMemo(
    () => accounts.filter((acc) => restrictionAllowsType(acc.restrictionLevel, activityType)),
    [accounts, activityType],
  );
  const assetCurrency = watch("currency");
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);

  // BUY/SELL asset type (stock/option/bond)
  const isBuyOrSell = ["BUY", "SELL"].includes(activityType);
  const assetType = isBuyOrSell ? ((watch("assetType" as any) as string) ?? "stock") : "stock";
  const isOption = assetType === "option";
  const isBond = assetType === "bond";
  const isManualForType = isManualAsset && !isBond;

  // Option fields for total calculation
  const optQuantity = isBuyOrSell ? watch("quantity") : undefined;
  const optUnitPrice = isBuyOrSell ? watch("unitPrice") : undefined;
  const optFee = isBuyOrSell ? watch("fee") : undefined;
  const optMultiplier = isOption ? ((watch("contractMultiplier" as any) as number) ?? 100) : 1;

  const optionTotal = useMemo(() => {
    if (!isOption || !optQuantity || !optUnitPrice) return 0;
    const q = Number(optQuantity) || 0;
    const p = Number(optUnitPrice) || 0;
    const f = Number(optFee) || 0;
    const m = Number(optMultiplier) || 100;
    return activityType === "BUY" ? q * p * m + f : q * p * m - f;
  }, [isOption, optQuantity, optUnitPrice, optFee, optMultiplier, activityType]);

  // Transfer state
  const isTransfer = ["TRANSFER_IN", "TRANSFER_OUT"].includes(activityType);
  const transferMode = isTransfer ? ((watch("transferMode" as any) as string) ?? "cash") : null;
  const isExternal = isTransfer ? ((watch("isExternal" as any) as boolean) ?? false) : false;
  const direction = isTransfer ? ((watch("direction" as any) as string) ?? "out") : null;
  const isSecuritiesTransfer = isTransfer && transferMode === "securities";
  const isCashTransfer = isTransfer && transferMode === "cash";
  const [toAccountSheetOpen, setToAccountSheetOpen] = useState(false);

  const subtype = watch("subtype");
  const isDrip = activityType === "DIVIDEND" && subtype === ACTIVITY_SUBTYPES.DRIP;

  const isFeeActivity = activityType === "FEE";
  const isTaxActivity = activityType === "TAX";
  const needsAssetSymbol =
    ["BUY", "SELL", "DIVIDEND", "SPLIT"].includes(activityType) || isSecuritiesTransfer;
  const needsQuantity = ["BUY", "SELL"].includes(activityType) || isSecuritiesTransfer;
  const needsUnitPrice =
    ["BUY", "SELL"].includes(activityType) ||
    (isSecuritiesTransfer && isExternal && direction === "in");
  const needsAmount =
    ["DEPOSIT", "WITHDRAWAL", "DIVIDEND", "INTEREST", "TAX"].includes(activityType) ||
    isCashTransfer;
  const needsFee = [
    "BUY",
    "SELL",
    "DEPOSIT",
    "WITHDRAWAL",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "INTEREST",
  ].includes(activityType);

  const needsSplitRatio = activityType === "SPLIT";

  const transferModeItems = [
    { value: "cash" as const, label: t("activity.form.transfer.mode_cash") },
    { value: "securities" as const, label: t("activity.form.transfer.mode_securities") },
  ];

  const handleTransferModeChange = (mode: string) => {
    setValue("transferMode" as any, mode, { shouldValidate: false });
    if (mode === "cash") {
      setValue("assetId" as any, null);
      setValue("quantity" as any, null);
      setValue("unitPrice" as any, null);
    } else {
      setValue("amount" as any, null);
    }
  };

  const handleExternalChange = (checked: boolean) => {
    setValue("isExternal" as any, checked, { shouldValidate: false });
    if (checked) {
      // Copy current account to accountId for external
      if (accountId) {
        setValue("accountId", accountId);
      }
      setValue("toAccountId" as any, "");
    } else {
      // Internal: use accountId as fromAccountId
      setValue("toAccountId" as any, "");
    }
  };

  const handleDirectionChange = (value: string) => {
    setValue("direction" as any, value, { shouldValidate: false });
    // Update activityType based on direction
    setValue("activityType", value === "in" ? ("TRANSFER_IN" as any) : ("TRANSFER_OUT" as any), {
      shouldValidate: false,
    });
  };

  const handleAssetTypeChange = (value: AssetType) => {
    if (value === "option") {
      setValue("quoteMode" as any, QuoteMode.MARKET);
      setValue("assetKind" as any, "OPTION");
    } else if (value === "bond") {
      setValue("quoteMode" as any, QuoteMode.MANUAL);
      setValue("assetKind" as any, "BOND");
    } else {
      setValue("quoteMode" as any, QuoteMode.MARKET);
      setValue("assetKind" as any, undefined);
    }
    setValue("assetId" as any, "");
  };

  // Filter destination accounts to exclude source account (for internal transfers)
  const toAccountOptions = filteredAccounts.filter((acc) => acc.value !== accountId);

  const selectedAccount = filteredAccounts.find((acc) => acc.value === accountId);
  const accountCurrency = selectedAccount?.currency;
  const baseCurrency = settings?.baseCurrency;
  const displayAccountText = selectedAccount
    ? `${selectedAccount.label} (${selectedAccount.currency})`
    : t("activity.mobile.placeholder_select_account");

  // Backfill currency for preselected accounts when options arrive asynchronously.
  useEffect(() => {
    if (!accountId) return;
    const selected = filteredAccounts.find((account) => account.value === accountId);
    if (!selected) return;

    const currentCurrency = currency?.trim();
    if (currentCurrency === selected.currency) return;

    const shouldAutoSetCurrency = !getFieldState("currency").isDirty || !currentCurrency;
    if (!shouldAutoSetCurrency) return;

    setValue("currency", selected.currency, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [accountId, currency, filteredAccounts, getFieldState, setValue]);

  // Quantity label adapts to asset type
  const quantityLabel = isOption
    ? t("activity.form.quantity.contracts")
    : isBond
      ? t("activity.form.quantity.bonds")
      : t("activity.form.quantity.shares");
  const priceLabel = isOption
    ? t("activity.form.price.premium_per_share")
    : isSecuritiesTransfer
      ? t("activity.form.fields.costBasis")
      : t("activity.form.fields.unitPrice");

  return (
    <div className="flex h-full flex-col">
      <ScrollArea>
        <div className="form-mobile-spacing pb-4">
          {/* Transfer Controls — shown first so user picks transfer type before accounts */}
          {isTransfer && (
            <>
              {/* Cash / Securities toggle */}
              <div className="flex justify-center">
                <AnimatedToggleGroup
                  items={transferModeItems}
                  value={transferMode ?? "cash"}
                  onValueChange={handleTransferModeChange}
                  size="sm"
                  rounded="lg"
                />
              </div>

              {/* External checkbox + direction */}
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isExternal"
                    checked={isExternal}
                    onCheckedChange={(checked) => handleExternalChange(!!checked)}
                  />
                  <Label htmlFor="isExternal" className="cursor-pointer text-sm font-normal">
                    {t("activity.form.transfer.external_label")}
                  </Label>
                </div>
                {isExternal && (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <RadioGroup
                      value={direction ?? "out"}
                      onValueChange={handleDirectionChange}
                      className="flex gap-3"
                    >
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="in" id="mobile-direction-in" />
                        <Label
                          htmlFor="mobile-direction-in"
                          className="cursor-pointer text-sm font-normal"
                        >
                          {t("activity.form.transfer.direction_in")}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="out" id="mobile-direction-out" />
                        <Label
                          htmlFor="mobile-direction-out"
                          className="cursor-pointer text-sm font-normal"
                        >
                          {t("activity.form.transfer.direction_out")}
                        </Label>
                      </div>
                    </RadioGroup>
                  </>
                )}
              </div>
            </>
          )}

          {/* Asset Type Selector for BUY/SELL (hidden when editing, consistent with desktop) */}
          {isBuyOrSell && !isEditing && (
            <AssetTypeSelector
              control={control as any}
              name={"assetType" as any}
              onValueChange={handleAssetTypeChange}
            />
          )}

          {/* Account — for transfers, label changes based on external/direction */}
          <FormField
            control={control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">
                  {isTransfer && isExternal
                    ? direction === "in"
                      ? t("activity.form.transfer.label_to_in")
                      : t("activity.form.transfer.label_from_out")
                    : isTransfer && !isExternal
                      ? t("activity.form.fields.fromAccountId")
                      : t("activity.form.fields.accountId")}
                </FormLabel>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    size="lg"
                    className="w-full justify-between rounded-md font-normal"
                    onClick={() => setAccountSheetOpen(true)}
                    type="button"
                  >
                    <span className={!field.value ? "text-muted-foreground" : ""}>
                      {displayAccountText}
                    </span>
                    <Icons.ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* To Account — internal transfers only */}
          {isTransfer && !isExternal && (
            <FormField
              control={control}
              name={"toAccountId" as any}
              render={({ field }) => {
                const toAccount = filteredAccounts.find((acc) => acc.value === field.value);
                const toDisplayText = toAccount
                  ? `${toAccount.label} (${toAccount.currency})`
                  : t("activity.mobile.placeholder_select_destination");
                return (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      {t("activity.form.fields.toAccountId")}
                    </FormLabel>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        size="lg"
                        className="w-full justify-between rounded-md font-normal"
                        onClick={() => setToAccountSheetOpen(true)}
                        type="button"
                      >
                        <span className={!field.value ? "text-muted-foreground" : ""}>
                          {toDisplayText}
                        </span>
                        <Icons.ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}

          {/* Date */}
          <FormField
            control={control}
            name="activityDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-base font-medium">{t("activity.form.fields.date_time")}</FormLabel>
                <DatePickerInput
                  onChange={(date: Date | undefined) => field.onChange(date)}
                  value={field.value}
                  disabled={field.disabled}
                  enableTime={true}
                  timeGranularity="minute"
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Asset Symbol / Option Contract Fields */}
          {needsAssetSymbol &&
            (isOption ? (
              <OptionContractFields
                underlyingName={"underlyingSymbol" as any}
                strikePriceName={"strikePrice" as any}
                expirationDateName={"expirationDate" as any}
                optionTypeName={"optionType" as any}
                currencyName="currency"
                exchangeMicName={"exchangeMic" as any}
                quoteCcyName={"symbolQuoteCcy" as any}
                unitPriceName={"unitPrice" as any}
              />
            ) : (
              <SymbolSearch
                name="assetId"
                isManualAsset={isManualForType}
                exchangeMicName="exchangeMic"
                quoteModeName="quoteMode"
                currencyName="currency"
                quoteCcyName="symbolQuoteCcy"
                instrumentTypeName="symbolInstrumentType"
                assetMetadataName="assetMetadata"
                defaultCurrency={accountCurrency}
              />
            ))}

          {/* Quantity and Unit Price */}
          {needsQuantity && (
            <>
              <div className={needsUnitPrice ? "grid grid-cols-2 gap-3" : ""}>
                <FormField
                  control={control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium">{quantityLabel}</FormLabel>
                      <FormControl>
                        <QuantityInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {needsUnitPrice && (
                  <FormField
                    control={control}
                    name="unitPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium">{priceLabel}</FormLabel>
                        <FormControl>
                          <MoneyInput {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Shares breakdown for options */}
              {isOption && optQuantity && (
                <div className="text-muted-foreground -mt-2 flex items-center gap-1.5 px-1 text-xs">
                  <span>
                    {t("activity.form.option_shares_equivalent", {
                      count: Number(optQuantity) * (Number(optMultiplier) || 100),
                    })}
                  </span>
                  <span>·</span>
                  <input
                    type="number"
                    {...register("contractMultiplier" as any, { valueAsNumber: true })}
                    className="hover:border-input focus:border-input focus:bg-background focus:ring-ring h-5 w-14 rounded border border-transparent bg-transparent px-1 text-center text-xs tabular-nums focus:outline-none focus:ring-1"
                    aria-label={t("activity.form.contract_multiplier_aria")}
                  />
                  <span>x</span>
                </div>
              )}
            </>
          )}

          {/* Option Total Premium/Credit */}
          {isOption && optQuantity && optUnitPrice && (
            <div className="bg-muted/50 border-border rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    {activityType === "BUY"
                      ? t("activity.form.total_debit")
                      : t("activity.form.total_credit")}
                  </span>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs tabular-nums">
                    {Number(optQuantity)} × {Number(optUnitPrice)} × {Number(optMultiplier) || 100}
                    {Number(optFee) > 0 && (
                      <>
                        {" "}
                        {activityType === "BUY" ? "+" : "−"} {Number(optFee)}
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

          {/* Amount */}
          {needsAmount && (
            <FormField
              control={control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">
                    {activityType === "DIVIDEND"
                      ? t("activity.form.amount.dividend")
                      : activityType === "INTEREST"
                        ? t("activity.form.amount.interest")
                        : isTaxActivity
                          ? t("activity.form.amount.tax")
                          : t("activity.form.fields.amount")}
                  </FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Split Ratio */}
          {needsSplitRatio && (
            <FormField
              control={control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">
                    {t("activity.form.fields.splitRatio")}
                  </FormLabel>
                  <FormControl>
                    <QuantityInput
                      placeholder={t("activity.form.split_ratio_placeholder_long")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Fee */}
          {!isFeeActivity && needsFee && (
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">{t("activity.form.fee_optional")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {isFeeActivity && (
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">{t("activity.form.fee_amount")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Advanced Options */}
          <AdvancedOptionsSection
            variant="mobile"
            currencyName="currency"
            fxRateName="fxRate"
            subtypeName="subtype"
            activityType={activityType as ActivityType}
            assetCurrency={assetCurrency}
            accountCurrency={accountCurrency}
            baseCurrency={baseCurrency}
            defaultOpen={isDrip}
          />

          {/* DRIP: Price & Quantity of reinvested shares */}
          {isDrip && (
            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      {t("activity.form.fields.unitPrice")}
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="0.00"
                        maxDecimalPlaces={4}
                        className="h-12 text-base sm:text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">
                      {t("activity.form.fields.quantity")}
                    </FormLabel>
                    <FormControl>
                      <QuantityInput
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder="0.00"
                        maxDecimalPlaces={8}
                        className="h-12 text-base sm:text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Comment */}
          <FormField
            control={control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">{t("activity.form.description_optional")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("activity.mobile.notes_placeholder")}
                    className="min-h-[100px] resize-none text-base sm:text-sm"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </ScrollArea>

      {/* Hidden Account Sheets - Rendered outside scrollable area */}
      <div className="hidden">
        <MobileAccountSheet
          accounts={filteredAccounts}
          open={accountSheetOpen}
          onOpenChange={setAccountSheetOpen}
          onSelect={(accountValue) => {
            setValue("accountId", accountValue);
            const selected = filteredAccounts.find((account) => account.value === accountValue);
            const currentCurrency = getValues("currency")?.trim();
            const shouldAutoSetCurrency = !getFieldState("currency").isDirty || !currentCurrency;
            if (selected && shouldAutoSetCurrency) {
              setValue("currency", selected.currency, {
                shouldDirty: false,
                shouldValidate: true,
              });
            }
            setAccountSheetOpen(false);
          }}
        />
        {isTransfer && !isExternal && (
          <MobileAccountSheet
            accounts={toAccountOptions}
            open={toAccountSheetOpen}
            onOpenChange={setToAccountSheetOpen}
            onSelect={(accountValue) => {
              setValue("toAccountId" as any, accountValue);
              setToAccountSheetOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface MobileAccountSheetProps {
  accounts: AccountSelectOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (accountValue: string) => void;
}

function MobileAccountSheet({ accounts, open, onOpenChange, onSelect }: MobileAccountSheetProps) {
  const { t } = useTranslation();
  const handleAccountSelect = (account: AccountSelectOption) => {
    onSelect(account.value);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-4xl mx-1 h-[70vh] p-0">
        <SheetHeader className="border-border border-b px-6 py-4">
          <SheetTitle>{t("activity.mobile.sheet_select_account_title")}</SheetTitle>
          <SheetDescription>{t("activity.mobile.sheet_select_account_description")}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(70vh-5rem)] px-6 py-4">
          <div className="space-y-2">
            {accounts.map((account) => (
              <button
                key={account.value}
                onClick={() => handleAccountSelect(account)}
                className="card-mobile hover:bg-accent active:bg-accent/80 focus:border-primary flex w-full items-center gap-3 border border-transparent text-left transition-colors focus:outline-none"
              >
                <div className="bg-primary/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                  <Icons.Briefcase className="text-primary h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate font-medium">{account.label}</div>
                  <div className="text-muted-foreground mt-0.5 text-sm">{account.currency}</div>
                </div>
                <Icons.ChevronRight className="text-muted-foreground h-5 w-5 flex-shrink-0" />
              </button>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
