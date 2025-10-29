import { z } from 'zod';
import {
  Card,
  CardContent,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  MoneyInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wealthfolio/ui';
import { useFormContext } from 'react-hook-form';
import { AccountSelectOption } from '../activity-form';
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from '../activity-type-selector';
import { ConfigurationCheckbox } from './common';
import { cashActivitySchema } from './schemas';
import { DatePickerInput } from '@wealthfolio/ui';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@wealthfolio/ui';

export type CashFormValues = z.infer<typeof cashActivitySchema>;

export const CashForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const activityType = watch('activityType');
  const showCurrency = watch('showCurrencySelect');

  const cashTypes: ActivityTypeUI[] = [
    {
      value: 'DEPOSIT',
      label: 'Deposit',
      icon: 'ArrowDown',
      description: 'Increase your account balance by adding funds.',
    },
    {
      value: 'WITHDRAWAL',
      label: 'Withdrawal',
      icon: 'ArrowUp',
      description: 'Decrease your account balance by taking out funds.',
    },
    {
      value: 'TRANSFER',
      label: 'Transfer',
      icon: 'ArrowRightLeft',
      description:
        "Move funds between your accounts. Note: This type of transfer typically doesn't count towards contribution limits.",
    },
  ];

  const isTransfer = activityType === 'TRANSFER';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={cashTypes} columns={3} />
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

          {/* Account field */}
          <FormField
            control={control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{isTransfer ? 'From Account' : 'Account'}</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an account" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[500px] overflow-y-auto">
                      {accounts.map((account) => (
                        <SelectItem value={account.value} key={account.value}>
                          {account.label}
                          <span className="font-light text-muted-foreground">
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

          {/* To Account field - only shown for TRANSFER */}
          {isTransfer && (
            <FormField
              control={control}
              name="toAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To Account</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select destination account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[500px] overflow-y-auto">
                        {accounts.map((account) => (
                          <SelectItem value={account.value} key={account.value}>
                            {account.label}
                            <span className="font-light text-muted-foreground">
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
          )}

          {/* Date field */}
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

          {/* Currency field - conditional */}
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

          {/* Description field */}
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
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
};
