import { useFormContext } from 'react-hook-form';
import { AccountSelectOption } from '../activity-form';
import { FormField } from '@/components/ui/form';
import { FormItem } from '@/components/ui/form';
import { FormLabel } from '@/components/ui/form';
import { FormControl } from '@/components/ui/form';
import { FormMessage } from '@/components/ui/form';
import { Select } from '@/components/ui/select';
import { SelectContent } from '@/components/ui/select';
import { SelectItem } from '@/components/ui/select';
import { SelectTrigger } from '@/components/ui/select';
import { SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import DatePickerInput from '@/components/ui/date-picker-input';
import TickerSearchInput from '@/components/ticker-search';
import { DataSource } from '@/lib/constants';

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
                    className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
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
                    className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
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
  const showCurrency = watch('showCurrencySelect');

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
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem value={account.value} key={account.value}>
                      {account.label}
                      <span className="font-light text-muted-foreground">({account.currency})</span>
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
      )}
    </>
  );
};

export function AssetSymbolInput({ field, isManualAsset }: { field: any; isManualAsset: boolean }) {
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
          />
        ) : (
          <TickerSearchInput onSelectResult={field.onChange} {...field} />
        )}
      </FormControl>
      <FormMessage className="text-xs" />
    </FormItem>
  );
} 