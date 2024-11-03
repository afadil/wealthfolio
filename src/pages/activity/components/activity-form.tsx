import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import * as z from 'zod';

import { AlertFeedback } from '@/components/alert-feedback';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
import { QuantityInput } from '@/components/ui/quantity-input';
import type { ActivityDetails } from '@/lib/types';

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
  accounts: AccountSelectOption[];
  activity?: ActivityDetails;
  open?: boolean;
  onClose?: () => void;
}

export function ActivityForm({ accounts, activity, open, onClose }: ActivityFormProps) {
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onClose);

  const defaultValues = {
    ...activity,
    activityDate: activity?.date ? new Date(activity.date) : new Date(),
  };

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(newActivitySchema),
    defaultValues: defaultValues as ActivityFormValues,
  });

  // Reset form when dialog closes or activity changes
  useEffect(() => {
    if (!open) {
      form.reset(); // Reset to empty form
    } else {
      form.reset(defaultValues as ActivityFormValues); // Reset to initial values
    }
  }, [open, activity]);

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;
  const watchedType = form.watch('activityType');

  async function onSubmit(data: ActivityFormValues) {
    try {
      const currency =
        accounts.find((account) => account.value === data.accountId)?.currency || 'USD';

      let submissionData = { ...data };

      if (CASH_ACTIVITY_TYPES.includes(data.activityType)) {
        submissionData.assetId = `$CASH-${currency}`;
        if (data.activityType !== 'FEE') {
          submissionData.fee = 0;
        }
      }

      const { id, ...rest } = submissionData;
      if (id) {
        return await updateActivityMutation.mutateAsync({ id, currency, ...rest });
      }
      return await addActivityMutation.mutateAsync({ currency, ...rest });
    } catch (error) {
      console.error('Activity Form Submit Error:', error);
      console.error('Activity Form Errors:', form.formState.errors);
      console.error('Activity Form Values:', form.getValues());
    }
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[625px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <SheetHeader>
              <SheetTitle>{activity?.id ? 'Update Activity' : 'Add Activity'}</SheetTitle>
              <SheetDescription>
                {activity?.id ? 'Update transaction details' : 'Record a new account transaction.'}
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-6 p-4">
              {addActivityMutation.error && (
                <AlertFeedback
                  variant="error"
                  title={
                    activity?.id ? 'Error updating this activity' : 'Error adding this activity'
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
                <CashActivityFields />
              ) : watchedType === 'DIVIDEND' ? (
                <DividendActivityFields />
              ) : (
                <AssetActivityFields />
              )}
            </div>
            <SheetFooter>
              <SheetTrigger asChild>
                <Button variant="outline" disabled={isLoading}>
                  Cancel
                </Button>
              </SheetTrigger>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : activity?.id ? (
                  <Icons.Check className="h-4 w-4" />
                ) : (
                  <Icons.Plus className="h-4 w-4" />
                )}
                <span className="hidden sm:ml-2 sm:inline">
                  {activity?.id ? 'Update Activity' : 'Add Activity'}
                </span>
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

const CashActivityFields = () => {
  const { control, watch } = useFormContext();
  const watchedType = watch('activityType');

  const isFeeType = watchedType === 'FEE';

  return (
    <>
      {isFeeType ? (
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
      ) : (
        <FormField
          control={control}
          name="unitPrice"
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
      )}
    </>
  );
};

const AssetActivityFields = () => {
  const { control, watch } = useFormContext();
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
              <label htmlFor="use-lookup-checkbox" className="ml-1">
                Use Symbol Lookup
              </label>
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
              <TickerSearchInput onSelectResult={field.onChange} {...field} />
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
                <QuantityInput placeholder="Ex. 2 for 2:1 split, 0.5 for 1:2 split" {...field} />
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
                  <QuantityInput {...field} />
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
                    <MoneyInput {...field} />
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
      )}
    </>
  );
};

const DividendActivityFields = () => {
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
              <TickerSearchInput onSelectResult={field.onChange} {...field} />
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
