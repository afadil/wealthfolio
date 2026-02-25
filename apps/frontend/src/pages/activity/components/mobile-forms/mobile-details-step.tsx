import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { QuoteMode, type ActivityType } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { AdvancedOptionsSection } from "../forms/fields/advanced-options-section";
import { SymbolSearch } from "../forms/fields/symbol-search";
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

  const isFeeActivity = activityType === "FEE";
  const isTaxActivity = activityType === "TAX";
  const needsAssetSymbol = ["BUY", "SELL", "DIVIDEND", "SPLIT"].includes(activityType);
  const needsQuantity = ["BUY", "SELL"].includes(activityType);
  const needsUnitPrice = ["BUY", "SELL"].includes(activityType);
  const needsAmount = [
    "DEPOSIT",
    "WITHDRAWAL",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "DIVIDEND",
    "INTEREST",
    "TAX",
  ].includes(activityType);
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
          {/* Account */}
          <FormField
            control={control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">Account</FormLabel>
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
          {needsQuantity && needsUnitPrice && (
            <div className="grid grid-cols-2 gap-3">
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
              <FormField
                control={control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-medium">Price</FormLabel>
                    <FormControl>
                      <MoneyInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

      {/* Hidden Account Sheet - Rendered outside scrollable area */}
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
