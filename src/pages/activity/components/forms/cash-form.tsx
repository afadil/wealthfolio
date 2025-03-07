import { z } from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { AccountSelectOption } from '../activity-form';
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from '../activity-type-selector';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MoneyInput } from '@/components/ui/money-input';
import { ConfigurationCheckbox, CommonFields } from './common';
import { cashActivitySchema } from './schemas';


export type CashFormValues = z.infer<typeof cashActivitySchema>;

export const CashForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control } = useFormContext();

  const cashTypes: ActivityTypeUI[] = [
    { value: 'DEPOSIT', label: 'Deposit', icon: 'ArrowDown' },
    { value: 'WITHDRAWAL', label: 'Withdrawal', icon: 'ArrowUp' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={cashTypes} columns={4} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox showCurrencyOption={true} shouldShowSymbolLookup={false} />

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

          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
}; 