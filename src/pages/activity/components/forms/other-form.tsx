import { Card, CardContent } from '@/components/ui/card';
import { AccountSelectOption } from '../activity-form';
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from '../activity-type-selector';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MoneyInput } from '@/components/ui/money-input';
import { QuantityInput } from '@/components/ui/quantity-input';
import { ConfigurationCheckbox, CommonFields, AssetSymbolInput } from './common';

export const OtherForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const activityType = watch('activityType');
  const isManualAsset = watch('assetDataSource') === 'MANUAL';

  const otherTypes: ActivityTypeUI[] = [
    { value: 'SPLIT', label: 'Split', icon: 'Split' },
    { value: 'TRANSFER_IN', label: 'Transfer In', icon: 'ArrowLeftRight' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out', icon: 'ArrowRightLeft' },
    { value: 'FEE', label: 'Fee', icon: 'Receipt' },
  ];

  const shouldShowSymbolLookup = activityType !== 'FEE';
  const isSplitType = activityType === 'SPLIT';
  const isTransferType = activityType === 'TRANSFER_IN' || activityType === 'TRANSFER_OUT';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={otherTypes} columns={4} />
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
          ) : isTransferType ? (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
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