import { Card, CardContent } from '@/components/ui/card';
import { AccountSelectOption } from '../activity-form';
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from '../activity-type-selector';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MoneyInput } from '@/components/ui/money-input';
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from './common';

export const IncomeForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const activityType = watch('activityType');
  const isManualAsset = watch('assetDataSource') === 'MANUAL';
  const shouldShowSymbolLookup = activityType === 'DIVIDEND';

  const incomeTypes: ActivityTypeUI[] = [
    { value: 'DIVIDEND', label: 'Dividend', icon: 'Income' },
    { value: 'INTEREST', label: 'Interest', icon: 'Percent' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={incomeTypes} columns={2} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox
            showCurrencyOption={true}
            shouldShowSymbolLookup={shouldShowSymbolLookup}
          />
          <>
            <FormField
              control={control}
              name="assetId"
              render={({ field }) => (
                <AssetSymbolInput field={field} isManualAsset={isManualAsset} />
              )}
            />
            <div
              className={`grid ${activityType === 'INTEREST' ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}
            >
              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {activityType === 'DIVIDEND' ? 'Dividend Amount' : 'Interest Amount'}
                    </FormLabel>
                    <FormControl>
                      <MoneyInput
                        placeholder={
                          activityType === 'DIVIDEND'
                            ? 'Enter dividend amount'
                            : 'Enter interest amount'
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {activityType === 'INTEREST' && (
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
              )}
            </div>
            <CommonFields accounts={accounts} />
          </>
        </CardContent>
      </Card>
    </div>
  );
}; 