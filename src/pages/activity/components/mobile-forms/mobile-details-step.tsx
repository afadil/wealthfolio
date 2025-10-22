import { CurrencySelectorMobile } from "@/components/currency-selector-mobile";
import { SymbolSelectorMobile } from "@/components/symbol-selector-mobile";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { DataSource } from "@/lib/constants";
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
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import type { AccountSelectOption } from "../activity-form";
import type { NewActivityFormValues } from "../forms/schemas";

interface MobileDetailsStepProps {
  accounts: AccountSelectOption[];
  activityType: string;
}

export function MobileDetailsStep({ accounts, activityType }: MobileDetailsStepProps) {
  const { control, watch, setValue } = useFormContext<NewActivityFormValues>();
  const isManualAsset = watch("assetDataSource") === DataSource.MANUAL;
  const showCurrencySelect = watch("showCurrencySelect");
  const accountId = watch("accountId");
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [symbolSheetOpen, setSymbolSheetOpen] = useState(false);

  const needsAssetSymbol = ["BUY", "SELL", "ADD_HOLDING", "REMOVE_HOLDING", "DIVIDEND"].includes(
    activityType,
  );
  const needsQuantity = ["BUY", "SELL", "ADD_HOLDING", "REMOVE_HOLDING"].includes(activityType);
  const needsUnitPrice = ["BUY", "SELL", "ADD_HOLDING", "REMOVE_HOLDING"].includes(activityType);
  const needsAmount = [
    "DEPOSIT",
    "WITHDRAWAL",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "DIVIDEND",
    "INTEREST",
    "FEE",
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

  const showSkipSymbolLookup = needsAssetSymbol;
  const showCurrencyOption = true;

  const selectedAccount = accounts.find((acc) => acc.value === accountId);
  const displayAccountText = selectedAccount
    ? `${selectedAccount.label} (${selectedAccount.currency})`
    : "Select an account";

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="-mx-6 flex-1 px-6">
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
                    className="w-full justify-between font-normal"
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
          {/* Configuration Options */}
          <div className="card-mobile bg-muted/30 flex flex-col gap-4 border">
            {showSkipSymbolLookup && (
              <FormField
                control={control}
                name="assetDataSource"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="use-lookup-checkbox"
                        className="cursor-pointer text-sm font-medium"
                      >
                        Skip Symbol Lookup
                      </label>
                      <Checkbox
                        id="use-lookup-checkbox"
                        checked={field.value === DataSource.MANUAL}
                        onCheckedChange={(checked) => {
                          field.onChange(checked ? DataSource.MANUAL : DataSource.YAHOO);
                        }}
                        className="h-6 w-6"
                      />
                    </div>
                  </FormItem>
                )}
              />
            )}
            {showCurrencyOption && (
              <FormField
                control={control}
                name="showCurrencySelect"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="use-different-currency-checkbox"
                        className="cursor-pointer text-sm font-medium"
                      >
                        Use Different Currency
                      </label>
                      <Checkbox
                        id="use-different-currency-checkbox"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="h-6 w-6"
                      />
                    </div>
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Asset Symbol */}
          {needsAssetSymbol && (
            <FormField
              control={control}
              name="assetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">Symbol</FormLabel>
                  <FormControl>
                    {isManualAsset ? (
                      <Input
                        placeholder="Enter symbol"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    ) : (
                      <SymbolSelectorMobile
                        onSelect={field.onChange}
                        value={field.value}
                        open={symbolSheetOpen}
                        onOpenChange={setSymbolSheetOpen}
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
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
                    <FormLabel className="text-base font-medium">
                      {activityType === "ADD_HOLDING" || activityType === "REMOVE_HOLDING"
                        ? "Avg Cost"
                        : "Price"}
                    </FormLabel>
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

          {/* Fee */}
          {needsFee && (
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

          {/* Currency (if enabled) */}
          {showCurrencySelect && (
            <FormField
              control={control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-medium">Activity Currency</FormLabel>
                  <FormControl>
                    <CurrencySelectorMobile onSelect={field.onChange} value={field.value} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

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
                    className="min-h-[100px] resize-none rounded-xl text-base sm:text-sm"
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
          accounts={accounts}
          open={accountSheetOpen}
          onOpenChange={setAccountSheetOpen}
          onSelect={(accountValue) => {
            setValue("accountId", accountValue);
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
      <SheetContent side="bottom" className="h-[70vh] p-0">
        <SheetHeader className="border-border border-b">
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
