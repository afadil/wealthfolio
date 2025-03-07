import { Card, CardContent } from '@/components/ui/card';
import { AccountSelectOption } from '../activity-form';
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from '../activity-type-selector';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MoneyInput } from '@/components/ui/money-input';
import { QuantityInput } from '@/components/ui/quantity-input';
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from './common';

export const TradeForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const isManualAsset = watch('assetDataSource') === 'MANUAL';

  const tradeTypes: ActivityTypeUI[] = [
    { value: 'BUY', label: 'Buy', icon: 'ArrowDown' },
    { value: 'SELL', label: 'Sell', icon: 'ArrowUp' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={tradeTypes} columns={2} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox showCurrencyOption={true} />
          <FormField
            control={control}
            name="assetId"
            render={({ field }) => <AssetSymbolInput field={field} isManualAsset={isManualAsset} />}
          />
          <div className="flex space-x-4">
            <FormField
              control={control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shares</FormLabel>
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
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fee</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
}; 