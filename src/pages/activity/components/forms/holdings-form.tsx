import { useFormContext } from 'react-hook-form';
import {
  Card,
  CardContent,
  MoneyInput,
  QuantityInput,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@wealthfolio/ui';
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from './common';
import { AccountSelectOption } from '../activity-form';
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from '../activity-type-selector';


export const HoldingsForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const isManualAsset = watch('assetDataSource') === 'MANUAL';

  const holdingTypes: ActivityTypeUI[] = [
    { value: 'ADD_HOLDING', label: 'Add Holding', icon: 'PlusCircle', description: 'Record a new asset holding. This is similar to a "Buy" but does not impact your cash balance. Use this for initial holdings, assets transferred from another brokerage, holdings received (e.g., gifts, inheritance), or to quickly record a purchase without a separate deposit entry.' },
    { value: 'REMOVE_HOLDING', label: 'Remove Holding', icon: 'MinusCircle', description: 'Record the removal of an asset holding. This is similar to a "Sell" but does not impact your cash balance. Also use to record assets transferred out to another brokerage or holdings removed for reasons other than a sale (e.g., gifts, donations).' },
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