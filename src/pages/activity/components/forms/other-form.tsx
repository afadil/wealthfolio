import { Card, CardContent } from '@/components/ui/card';
import { AccountSelectOption } from '../activity-form';
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from '../activity-type-selector';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MoneyInput, QuantityInput } from '@wealthfolio/ui';
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from './common';

export const OtherForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const activityType = watch('activityType');
  const isManualAsset = watch('assetDataSource') === 'MANUAL';

  const otherTypes: ActivityTypeUI[] = [
    { value: 'SPLIT', label: 'Split', icon: 'Split', description: 'Record a stock split. This changes the number of shares you own but typically not the total value of your holding (e.g., a 2-for-1 split doubles your shares).' },
    { value: 'FEE', label: 'Fee', icon: 'Receipt', description: 'Record a standalone fee or charge not directly tied to a specific trade, such as an account maintenance fee. This will decrease your cash balance.' },
    { value: 'TAX', label: 'Tax', icon: 'ReceiptText', description: 'Record tax payments related to your investments, such as capital gains tax or withholding tax. This will decrease your cash balance.' },
  ];

  const shouldShowSymbolLookup = activityType !== 'FEE' && activityType !== 'TAX';
  const isSplitType = activityType === 'SPLIT';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={otherTypes} columns={3} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox
            showCurrencyOption={true}
            shouldShowSymbolLookup={shouldShowSymbolLookup}
          />
          {activityType === 'FEE' ? (
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fee Amount</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : activityType === 'TAX' ? (
            <FormField
              control={control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tax Amount</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <>
              <FormField
                control={control}
                name="assetId"
                render={({ field }) => <AssetSymbolInput field={field} isManualAsset={isManualAsset} />}
              />
              {isSplitType && (
                <FormField
                  control={control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Split Ratio</FormLabel>
                      <FormControl>
                        <QuantityInput placeholder="Ex. 2 for 2:1 split, 0.5 for 1:2 split" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </>
          )}
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
}; 