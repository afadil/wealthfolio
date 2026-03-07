import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { AnimatedToggleGroup } from "@wealthfolio/ui/components/ui/animated-toggle-group";
import { QuoteMode, type ActivityType } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { AdvancedOptionsSection } from "../forms/fields/advanced-options-section";
import { SymbolSearch } from "../forms/fields/symbol-search";
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
import { restrictionAllowsType } from "@/lib/activity-restrictions";
import type { AccountSelectOption } from "../forms/fields";
import type { NewActivityFormValues } from "../forms/schemas";

interface MobileDetailsStepProps {
  accounts: AccountSelectOption[];
  activityType: string;
}

export function MobileDetailsStep({ accounts, activityType }: MobileDetailsStepProps) {
  const { control, getFieldState, getValues, watch, setValue } =
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

  // Transfer state
  const isTransfer = ["TRANSFER_IN", "TRANSFER_OUT"].includes(activityType);
  const transferMode = isTransfer ? ((watch("transferMode" as any) as string) ?? "cash") : null;
  const isExternal = isTransfer ? ((watch("isExternal" as any) as boolean) ?? false) : false;
  const direction = isTransfer ? ((watch("direction" as any) as string) ?? "out") : null;
  const isSecuritiesTransfer = isTransfer && transferMode === "securities";
  const isCashTransfer = isTransfer && transferMode === "cash";
  const [toAccountSheetOpen, setToAccountSheetOpen] = useState(false);

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
    { value: "cash" as const, label: "Cash" },
    { value: "securities" as const, label: "Securities" },
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

  // Filter destination accounts to exclude source account (for internal transfers)
  const toAccountOptions = filteredAccounts.filter((acc) => acc.value !== accountId);

  const selectedAccount = filteredAccounts.find((acc) => acc.value === accountId);
  const accountCurrency = selectedAccount?.currency;
  const baseCurrency = settings?.baseCurrency;
  const displayAccountText = selectedAccount
    ? `${selectedAccount.label} (${selectedAccount.currency})`
    : "Select an account";

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
                    External transfer
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
                          In
                        </Label>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <RadioGroupItem value="out" id="mobile-direction-out" />
                        <Label
                          htmlFor="mobile-direction-out"
                          className="cursor-pointer text-sm font-normal"
                        >
                          Out
                        </Label>
                      </div>
                    </RadioGroup>
                  </>
                )}
              </div>
            </>
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
                      ? "To Account"
                      : "From Account"
                    : isTransfer && !isExternal
                      ? "From Account"
                      : "Account"}
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
                  : "Select destination account";
                return (
                  <FormItem>
                    <FormLabel className="text-base font-medium">To Account</FormLabel>
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
                <FormLabel className="text-base font-medium">Date & Time</FormLabel>
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

          {/* Asset Symbol */}
          {needsAssetSymbol && (
            <SymbolSearch
              name="assetId"
              label="Symbol"
              isManualAsset={isManualAsset}
              exchangeMicName="exchangeMic"
              quoteModeName="quoteMode"
              currencyName="currency"
              quoteCcyName="symbolQuoteCcy"
              instrumentTypeName="symbolInstrumentType"
              assetMetadataName="assetMetadata"
              defaultCurrency={accountCurrency}
            />
          )}

          {/* Quantity and Unit Price */}
          {needsQuantity && (
            <div className={needsUnitPrice ? "grid grid-cols-2 gap-3" : ""}>
              <FormField
                control={control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">Shares</FormLabel>
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
                      <FormLabel className="text-base font-medium">
                        {isSecuritiesTransfer ? "Cost Basis" : "Price"}
                      </FormLabel>
                      <FormControl>
                        <MoneyInput {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
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
                      ? "Dividend Amount"
                      : activityType === "INTEREST"
                        ? "Interest Amount"
                        : isTaxActivity
                          ? "Tax Amount"
                          : "Amount"}
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
                  <FormLabel className="text-base font-medium">Split Ratio</FormLabel>
                  <FormControl>
                    <QuantityInput
                      placeholder="Ex. 2 for 2:1 split, 0.5 for 1:2 split"
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
                  <FormLabel className="text-base font-medium">Fee (Optional)</FormLabel>
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
                  <FormLabel className="text-base font-medium">Fee Amount</FormLabel>
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
          />

          {/* Comment */}
          <FormField
            control={control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add a note or comment..."
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
  const handleAccountSelect = (account: AccountSelectOption) => {
    onSelect(account.value);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-4xl mx-1 h-[70vh] p-0">
        <SheetHeader className="border-border border-b px-6 py-4">
          <SheetTitle>Select Account</SheetTitle>
          <SheetDescription>Choose the account for this transaction</SheetDescription>
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
