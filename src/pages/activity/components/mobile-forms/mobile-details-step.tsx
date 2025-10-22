import TickerSearchInput from "@/components/ticker-search";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ActivityTypeNames, DataSource } from "@/lib/constants";
import {
  CurrencyInput,
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  MoneyInput,
  QuantityInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { useFormContext } from "react-hook-form";
import type { AccountSelectOption } from "../activity-form";
import type { NewActivityFormValues } from "../forms/schemas";

interface MobileDetailsStepProps {
  accounts: AccountSelectOption[];
  activityType: string;
}

export function MobileDetailsStep({ accounts, activityType }: MobileDetailsStepProps) {
  const { control, watch } = useFormContext<NewActivityFormValues>();
  const isManualAsset = watch("assetDataSource") === DataSource.MANUAL;
  const showCurrencySelect = watch("showCurrencySelect");

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

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Transaction Details</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {ActivityTypeNames[activityType as keyof typeof ActivityTypeNames] || activityType}
        </p>
      </div>

      <ScrollArea className="-mx-6 flex-1 px-6">
        <div className="space-y-6 pb-4">
          {/* Account */}
          <FormField
            control={control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Account</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Select an account" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {accounts.map((account) => (
                        <SelectItem value={account.value} key={account.value} className="text-base">
                          {account.label}
                          <span className="text-muted-foreground ml-2 font-light">
                            ({account.currency})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <FormLabel className="text-base">Date</FormLabel>
                <DatePickerInput
                  onChange={(date: Date | undefined) => field.onChange(date)}
                  value={field.value}
                  disabled={field.disabled}
                  enableTime={true}
                  timeGranularity="minute"
                  className="h-12 text-base"
                />
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Configuration Options */}
          <div className="bg-muted/20 flex flex-col gap-3 rounded-lg border p-4">
            {showSkipSymbolLookup && (
              <FormField
                control={control}
                name="assetDataSource"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="use-lookup-checkbox"
                        className="text-muted-foreground cursor-pointer text-sm"
                      >
                        Skip Symbol Lookup
                      </label>
                      <Checkbox
                        id="use-lookup-checkbox"
                        checked={field.value === DataSource.MANUAL}
                        onCheckedChange={(checked) => {
                          field.onChange(checked ? DataSource.MANUAL : DataSource.YAHOO);
                        }}
                        className="h-5 w-5"
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
                        className="text-muted-foreground cursor-pointer text-sm"
                      >
                        Use Different Currency
                      </label>
                      <Checkbox
                        id="use-different-currency-checkbox"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="h-5 w-5"
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
                  <FormLabel className="text-base">Symbol</FormLabel>
                  <FormControl>
                    {isManualAsset ? (
                      <Input
                        placeholder="Enter symbol"
                        className="h-12 text-base"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    ) : (
                      <TickerSearchInput onSelectResult={field.onChange} {...field} />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Quantity and Unit Price */}
          {needsQuantity && needsUnitPrice && (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Shares</FormLabel>
                    <FormControl>
                      <QuantityInput {...field} className="h-12 text-base" />
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
                    <FormLabel className="text-base">
                      {activityType === "ADD_HOLDING" || activityType === "REMOVE_HOLDING"
                        ? "Avg Cost"
                        : "Price"}
                    </FormLabel>
                    <FormControl>
                      <MoneyInput {...field} className="h-12 text-base" />
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
                  <FormLabel className="text-base">
                    {activityType === "DIVIDEND"
                      ? "Dividend Amount"
                      : activityType === "INTEREST"
                        ? "Interest Amount"
                        : "Amount"}
                  </FormLabel>
                  <FormControl>
                    <MoneyInput {...field} className="h-12 text-base" />
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
                  <FormLabel className="text-base">Fee (Optional)</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} className="h-12 text-base" />
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
                  <FormLabel className="text-base">Activity Currency</FormLabel>
                  <FormControl>
                    <CurrencyInput {...field} className="h-12 text-base" />
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
                <FormLabel className="text-base">Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Add a note or comment..."
                    className="min-h-[100px] resize-none text-base"
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
    </div>
  );
}
