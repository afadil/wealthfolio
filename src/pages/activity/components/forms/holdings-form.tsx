import { Card, CardContent } from '@/components/ui/card';
import { AccountSelectOption } from '../activity-form';
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from '../activity-type-selector';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MoneyInput } from '@/components/ui/money-input';
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from './common';
import { QuantityInput } from '@/components/ui/quantity-input';


export const HoldingsForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const isManualAsset = watch('assetDataSource') === 'MANUAL';

  const holdingTypes: ActivityTypeUI[] = [
    { value: 'ADD_HOLDING', label: 'Add Holding', icon: 'PlusCircle' },
    { value: 'REMOVE_HOLDING', label: 'Remove Holding', icon: 'MinusCircle' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={holdingTypes} columns={2} />
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
          <div className="grid grid-cols-2 gap-4">
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
                  <FormLabel>Average Cost</FormLabel>
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