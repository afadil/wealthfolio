import TickerSearchInput from "@/components/ticker-search";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { DataSource } from "@/lib/constants";
import type { QuoteSummary } from "@/lib/types";
import {
  CurrencyInput,
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { useFormContext } from "react-hook-form";
import { AccountSelectOption } from "../activity-form";

export interface ConfigurationCheckboxProps {
  showCurrencyOption?: boolean;
  shouldShowSymbolLookup?: boolean;
}

export const ConfigurationCheckbox = ({
  showCurrencyOption = true,
  shouldShowSymbolLookup = true,
}: ConfigurationCheckboxProps) => {
  const { control } = useFormContext();

  return (
    <div className="flex items-center justify-end space-x-6">
      {shouldShowSymbolLookup && (
        <FormField
          control={control}
          name="assetDataSource"
          render={({ field }) => (
            <FormItem className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="use-lookup-checkbox"
                    className="text-muted-foreground hover:text-foreground cursor-pointer text-sm"
                  >
                    Skip Symbol Lookup
                  </label>
                  <Checkbox
                    id="use-lookup-checkbox"
                    checked={field.value === DataSource.MANUAL}
                    onCheckedChange={(checked) => {
                      field.onChange(checked ? DataSource.MANUAL : DataSource.YAHOO);
                    }}
                    defaultChecked={field.value === DataSource.MANUAL}
                    className="h-4 w-4"
                  />
                </div>
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
            <FormItem className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="use-different-currency-checkbox"
                    className="text-muted-foreground hover:text-foreground cursor-pointer text-sm"
                  >
                    Use Different Currency
                  </label>
                  <Checkbox
                    id="use-different-currency-checkbox"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="h-4 w-4"
                  />
                </div>
              </div>
            </FormItem>
          )}
        />
      )}
    </div>
  );
};

export const CommonFields = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const showCurrency = watch("showCurrencySelect");

  return (
    <>
      <FormField
        control={control}
        name="accountId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Account</FormLabel>
            <FormControl>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger aria-label="Account">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent className="max-h-[500px] overflow-y-auto">
                  {accounts.map((account) => (
                    <SelectItem value={account.value} key={account.value}>
                      {account.label}
                      <span className="text-muted-foreground font-light">({account.currency})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="activityDate"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Date</FormLabel>
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
      {showCurrency && (
        <>
          <FormField
            control={control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Currency</FormLabel>
                <FormControl>
                  <CurrencyInput {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="fxRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>FX Rate (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Exchange rate to account currency"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value === "" ? null : parseFloat(value));
                    }}
                    aria-label="FX Rate"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
      <FormField
        control={control}
        name="comment"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Add an optional description or comment for this transaction..."
                className="resize-none"
                rows={3}
                {...field}
                value={field.value || ""}
                aria-label="Description"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};

export function AssetSymbolInput({
  field,
  isManualAsset,
}: {
  field: { value?: string; onChange: (v: string) => void } & Record<string, unknown>;
  isManualAsset: boolean;
}) {
  const { setValue } = useFormContext();

  const handleTickerSelect = (symbol: string, quoteSummary?: QuoteSummary) => {
    field.onChange(symbol);
    // If the selected ticker is a custom/manual entry, automatically enable skip lookup
    if (quoteSummary?.dataSource === DataSource.MANUAL) {
      setValue("assetDataSource", DataSource.MANUAL);
    }
  };

  return (
    <FormItem className="-mt-2">
      <FormLabel>Symbol</FormLabel>
      <FormControl>
        {isManualAsset ? (
          <Input
            placeholder="Enter symbol"
            className="h-10"
            {...field}
            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
            aria-label="Symbol"
          />
        ) : (
          <TickerSearchInput onSelectResult={handleTickerSelect} {...field} aria-label="Symbol" />
        )}
      </FormControl>
      <FormMessage className="text-xs" />
    </FormItem>
  );
}
