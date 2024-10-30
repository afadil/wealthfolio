import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { AlertFeedback } from '@/components/alert-feedback';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { newActivitySchema } from '@/lib/schemas';
import { useActivityMutations } from '../hooks/useActivityMutations';
import TickerSearchInput from '@/components/ticker-search';
import DatePickerInput from '@/components/ui/data-picker-input';
import TickerManualInput from './ticker-manual';

const activityTypes = [
  { label: 'Buy', value: 'BUY' },
  { label: 'Sell', value: 'SELL' },
  { label: 'Deposit', value: 'DEPOSIT' },
  { label: 'Withdrawal', value: 'WITHDRAWAL' },
  { label: 'Dividend', value: 'DIVIDEND' },
  { label: 'Interest', value: 'INTEREST' },
  { label: 'Fee', value: 'FEE' },
  { label: 'Split', value: 'SPLIT' },
  { label: 'Transfer In', value: 'TRANSFER_IN' },
  { label: 'Transfer Out', value: 'TRANSFER_OUT' },
] as const;

const CASH_ACTIVITY_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST'];

type ActivityFormValues = z.infer<typeof newActivitySchema>;
export interface AccountSelectOption {
  value: string;
  label: string;
  currency: string;
}

interface ActivityFormProps {
  defaultValues?: ActivityFormValues;
  accounts: AccountSelectOption[];
  onSuccess?: () => void;
}

export function ActivityForm({ accounts, defaultValues, onSuccess = () => {} }: ActivityFormProps) {
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onSuccess);

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(newActivitySchema),
    defaultValues,
  });

  async function onSubmit(data: ActivityFormValues) {
    const { id, ...rest } = data;
    if (id) {
      return await updateActivityMutation.mutateAsync({ id, ...rest });
    }
    return await addActivityMutation.mutateAsync(rest);
  }

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;
  const watchedType = form.watch('activityType');
  const currentAccountCurrency =
    accounts.find((account) => account.value === form.watch('accountId'))?.currency || 'USD';

  useEffect(() => {
    form.setValue('currency', currentAccountCurrency);
    if (CASH_ACTIVITY_TYPES.includes(watchedType)) {
      form.setValue('assetId', `$CASH-${currentAccountCurrency}`);
      form.setValue('quantity', 1);
      if (watchedType !== 'FEE') {
        form.setValue('fee', 0);
      }
    }
  }, [currentAccountCurrency, watchedType]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle> {defaultValues?.id ? 'Update Activity' : 'Add Activity'}</DialogTitle>
          <DialogDescription>
            {defaultValues?.id ? 'Update transaction details' : 'Record a new account transaction.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 p-4">
          {addActivityMutation.error && (
            <AlertFeedback
              variant="error"
              title={
                defaultValues?.id ? 'Error updating this activity' : 'Error adding this activity'
              }
            >
              {addActivityMutation.error}
            </AlertFeedback>
          )}
          <input type="hidden" name="id" />
          <input type="hidden" name="currency" />
          <FormField
            control={form.control}
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
          <FormField
            control={form.control}
            name="activityType"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activityTypes.map((type) => (
                      <SelectItem value={type.value} key={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="activityDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date</FormLabel>
                <DatePickerInput
                  onChange={(date) => field.onChange(date)}
                  value={field.value}
                  disabled={field.disabled}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {CASH_ACTIVITY_TYPES.includes(watchedType) ? (
            <CashActivityFields currentAccountCurrency={currentAccountCurrency} />
          ) : watchedType === 'DIVIDEND' ? (
            <DividendActivityFields defaultAssetId={defaultValues?.assetId} />
          ) : (
            <AssetActivityFields
              defaultAssetId={defaultValues?.assetId}
              isPublicAsset={defaultValues?.assetDataSource != "Private"} />
          )}
        </div>
        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={isLoading}>
              Cancel
            </Button>
          </DialogTrigger>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Plus className="h-4 w-4" />
            )}
            <span className="hidden sm:ml-2 sm:inline">
              {defaultValues?.id ? 'Update Activity' : 'Add Activity'}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

interface CashActivityFieldsProps {
  currentAccountCurrency: string;
}

const CashActivityFields = ({ currentAccountCurrency }: CashActivityFieldsProps) => {
  const { control, watch } = useFormContext();
  const watchedType = watch('activityType');

  const isFeeType = watchedType === 'FEE';

  return (
    <>
      <FormField
        control={control}
        name="assetId"
        render={({ field }) => (
          <Input type="hidden" {...field} value={`$CASH-${currentAccountCurrency}`} />
        )}
      />
      {isFeeType ? (
        <FormField
          control={control}
          name="fee"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fee</FormLabel>
              <FormControl>
                <MoneyInput placeholder="Fee" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={control}
          name="unitPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <MoneyInput placeholder="Amount" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </>
  );
};

interface AssetActivityFieldsProps {
  defaultAssetId?: string;
  isPublicAsset?: boolean;
}

const AssetActivityFields = ({ defaultAssetId, isPublicAsset }: AssetActivityFieldsProps) => {
  const { control, watch, setValue } = useFormContext();
  const watchedType = watch('activityType');
  const watchedUseSymbolLookup = watch('isPublic', isPublicAsset); // Default to true if not set

  useEffect(() => {
    if (!watchedUseSymbolLookup) {
      setValue('assetId', defaultAssetId);
    }
  }, [watchedUseSymbolLookup, setValue, defaultAssetId]);

  const isSplitType = watchedType === 'SPLIT';
  const isTransferType = watchedType === 'TRANSFER_IN' || watchedType === 'TRANSFER_OUT';
  const isTransferOut = watchedType === 'TRANSFER_OUT';

  return (
    <>
      <FormField
        control={control}
        name="isPublic"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between">
            <FormLabel>Symbol</FormLabel>
            <div className="flex items-center">
              <Checkbox
                className="ml-2"
                id="use-lookup-checkbox"
                checked={watchedUseSymbolLookup}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                }}
              />
              <label htmlFor="use-lookup-checkbox" className="ml-1">Use Symbol Lookup</label>
            </div>
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="assetId"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormControl>
              {watchedUseSymbolLookup ? (
                <TickerSearchInput
                  onSelectResult={(value) => field.onChange(value)}
                  defaultValue={defaultAssetId}
                />
              ) : (
                <TickerManualInput
                  defaultValue={defaultAssetId}
                  onSymbolChange={(value) => field.onChange(value)}
                />
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {isSplitType ? (
        <FormField
          control={control}
          name="unitPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Split Ratio</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Ex. 2 for 2:1 split, 0.5 for 1:2 split"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : isTransferType ? (
        <div className="flex space-x-4">
          <FormField
            control={control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shares</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="decimal" placeholder="Shares" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {!isTransferOut && (
            <FormField
              control={control}
              name="unitPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Average Cost</FormLabel>
                  <FormControl>
                    <MoneyInput placeholder="Average Cost" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      ) : (
        <div className="flex space-x-4">
          <FormField
            control={control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shares</FormLabel>
                <FormControl>
                  <Input type="number" inputMode="decimal" placeholder="Shares" {...field} />
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
                  <MoneyInput placeholder="Price" {...field} />
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
                  <MoneyInput placeholder="Fee" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </>
  );
};

interface DividendActivityFieldsProps {
  defaultAssetId?: string;
}

const DividendActivityFields = ({ defaultAssetId }: DividendActivityFieldsProps) => {
  const { control } = useFormContext();

  return (
    <>
      <FormField
        control={control}
        name="assetId"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Symbol</FormLabel>
            <FormControl>
              <TickerSearchInput
                onSelectResult={(value) => field.onChange(value)}
                defaultValue={defaultAssetId}
              />
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
            <FormLabel>Dividend Amount</FormLabel>
            <FormControl>
              <MoneyInput placeholder="Dividend Amount" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
};
