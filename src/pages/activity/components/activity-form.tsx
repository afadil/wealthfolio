import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import * as z from 'zod';
import { logger } from '@/adapters';

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
import { CurrencyInput } from '@/components/ui/currency-input';

import { newActivitySchema } from '@/lib/schemas';
import { useActivityMutations } from '../hooks/useActivityMutations';
import TickerSearchInput from '@/components/ticker-search';
import DatePickerInput from '@/components/ui/data-picker-input';
import { QuantityInput } from '@/components/ui/quantity-input';
import type { ActivityDetails, NewActivity } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityType, ActivityTypeSelector } from './activity-type-selector';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Card, CardContent } from '@/components/ui/card';

type ActivityFormValues = z.infer<typeof newActivitySchema> & {
  showCurrencySelect?: boolean;
};
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

const ACTIVITY_TYPE_TO_TAB: Record<string, string> = {
  BUY: 'trade',
  SELL: 'trade',
  DEPOSIT: 'cash',
  WITHDRAWAL: 'cash',
  INTEREST: 'income',
  DIVIDEND: 'income',
  SPLIT: 'other',
  TRANSFER_IN: 'other',
  TRANSFER_OUT: 'other',
  FEE: 'other',
};

export function ActivityForm({ accounts, activity, open, onClose }: ActivityFormProps) {
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onClose);

  const defaultValues = {
    ...activity,
    activityDate: activity?.date ? new Date(activity.date) : new Date(),
    currency: activity?.currency || '',
    assetDataSource: activity?.assetDataSource || 'Yahoo',
  };

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(newActivitySchema),
    defaultValues: defaultValues as ActivityFormValues,
  });

  // Reset form when dialog closes or activity changes
  useEffect(() => {
    if (!open) {
      form.reset(); // Reset to empty form
      addActivityMutation.reset();
      updateActivityMutation.reset();
    } else {
      form.reset(defaultValues as ActivityFormValues); // Reset to initial values
    }
  }, [open, activity]);

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  async function onSubmit(data: ActivityFormValues) {
    try {
      const submissionData = { ...data, isDraft: false } as NewActivity;
      const { id, ...submitData } = submissionData;

      // For cash activities and fees, set assetId to $CASH-accountCurrency
      if (['DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'FEE'].includes(submitData.activityType)) {
        const account = accounts.find((a) => a.value === submitData.accountId);
        if (account) {
          submitData.assetId = `$CASH-${account.currency}`;
        }
      }

      if (id) {
        return await updateActivityMutation.mutateAsync({ id, ...submitData });
      }
      return await addActivityMutation.mutateAsync(submitData);
    } catch (error) {
      logger.error(
        `Activity Form Submit Error: ${JSON.stringify({ error, formValues: form.getValues() })}`,
      );
    }
  }

  const defaultTab = activity ? ACTIVITY_TYPE_TO_TAB[activity.activityType] || 'trade' : 'trade';

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="space-y-8 sm:max-w-[625px]">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{activity?.id ? 'Update Activity' : 'Add Activity'}</SheetTitle>
            {Object.keys(form.formState.errors).length > 0 && (
              <HoverCard>
                <HoverCardTrigger>
                  <Icons.AlertCircle className="h-5 w-5 text-destructive" />
                </HoverCardTrigger>
                <HoverCardContent className="w-[600px] border-destructive/50 bg-destructive text-destructive-foreground dark:border-destructive [&>svg]:text-destructive">
                  <div className="space-y-2">
                    <h4 className="font-medium">Please Review Your Entry</h4>
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {Object.entries(form.formState.errors).map(([field, error]) => (
                        <li key={field}>
                          {field === 'activityType' ? 'Transaction Type' : field}
                          {': '}
                          {error?.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}
          </div>
          <SheetDescription>
            {activity?.id ? 'Update transaction details' : 'Record a new account transaction.'}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue={defaultTab} className="w-full">
          {!activity?.id && (
            <TabsList className="mb-6 grid grid-cols-4">
              <TabsTrigger value="trade" className="flex items-center gap-2">
                <Icons.ArrowRightLeft className="h-4 w-4" />
                Trade
              </TabsTrigger>
              <TabsTrigger value="cash" className="flex items-center gap-2">
                <Icons.DollarSign className="h-4 w-4" />
                Cash
              </TabsTrigger>
              <TabsTrigger value="income" className="flex items-center gap-2">
                <Icons.Income className="h-4 w-4" />
                Income
              </TabsTrigger>
              <TabsTrigger value="other" className="flex items-center gap-2">
                <Icons.FileText className="h-4 w-4" />
                Other
              </TabsTrigger>
            </TabsList>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid gap-4">
                <TabsContent value="trade">
                  <TradeFields accounts={accounts} />
                </TabsContent>

                <TabsContent value="cash">
                  <CashFields accounts={accounts} />
                </TabsContent>

                <TabsContent value="income">
                  <IncomeFields accounts={accounts} />
                </TabsContent>

                <TabsContent value="other">
                  <OtherFields accounts={accounts} />
                </TabsContent>
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
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

const CommonFields = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const showCurrency = watch('showCurrencySelect');

  return (
    <>
      <FormField
        control={control}
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
                      <span className="font-light text-muted-foreground">({account.currency})</span>
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
        control={control}
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
    </>
  );
};

const TradeFields = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control } = useFormContext();

  const tradeTypes: ActivityType[] = [
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
          <AssetActivityFields />
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
};

const CashFields = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control } = useFormContext();

  const cashTypes: ActivityType[] = [
    { value: 'DEPOSIT', label: 'Deposit', icon: 'ArrowDown' },
    { value: 'WITHDRAWAL', label: 'Withdrawal', icon: 'ArrowUp' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={cashTypes} columns={2} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox showCurrencyOption={true} shouldShowSymbolLookup={false} />

          <div className="grid grid-cols-2 gap-4">
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

const IncomeFields = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const activityType = watch('activityType');
  const isManualAsset = watch('assetDataSource') === 'MANUAL';
  const shouldShowSymbolLookup = activityType === 'DIVIDEND';

  const incomeTypes: ActivityType[] = [
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
                name="unitPrice"
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
          </>
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
};

const OtherFields = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { control, watch } = useFormContext();
  const activityType = watch('activityType');

  const otherTypes: ActivityType[] = [
    { value: 'SPLIT', label: 'Split', icon: 'Split' },
    { value: 'TRANSFER_IN', label: 'Transfer In', icon: 'ArrowLeftRight' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out', icon: 'ArrowRightLeft' },
    { value: 'FEE', label: 'Fee', icon: 'Receipt' },
  ];

  const shouldShowSymbolLookup = activityType !== 'FEE';
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
          ) : (
            <AssetActivityFields />
          )}
          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
};

interface ConfigurationCheckboxProps {
  showCurrencyOption?: boolean;
  shouldShowSymbolLookup?: boolean;
}

const ConfigurationCheckbox = ({
  showCurrencyOption = true,
  shouldShowSymbolLookup = true,
}: ConfigurationCheckboxProps) => {
  const { control } = useFormContext();

  return (
    <div className="flex items-center justify-end space-x-6">
      {shouldShowSymbolLookup && (
        <FormField
          control={control}
          name="assetDataSource"
          render={({ field }) => (
            <FormItem className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="use-lookup-checkbox"
                    className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
                  >
                    Skip Symbol Lookup
                  </label>
                  <Checkbox
                    id="use-lookup-checkbox"
                    checked={field.value === 'MANUAL'}
                    onCheckedChange={(checked) => {
                      field.onChange(checked ? 'MANUAL' : 'Yahoo');
                    }}
                    defaultChecked={field.value === 'MANUAL'}
                    className="h-4 w-4"
                  />
                </div>
              </div>
            </FormItem>
          )}
        />
      )}
      {showCurrencyOption && (
        <FormField
          control={control}
          name="showCurrencySelect"
          render={({ field }) => (
            <FormItem className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="use-different-currency-checkbox"
                    className="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
                  >
                    Use Different Currency
                  </label>
                  <Checkbox
                    id="use-different-currency-checkbox"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="h-4 w-4"
                  />
                </div>
              </div>
            </FormItem>
          )}
        />
      )}
    </div>
  );
};

function AssetSymbolInput({ field, isManualAsset }: { field: any; isManualAsset: boolean }) {
  return (
    <FormItem className="-mt-2">
      <FormLabel>Symbol</FormLabel>
      <FormControl>
        {isManualAsset ? (
          <Input
            placeholder="Enter symbol"
            className="h-10"
            {...field}
            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
          />
        ) : (
          <TickerSearchInput onSelectResult={field.onChange} {...field} />
        )}
      </FormControl>
      <FormMessage className="text-xs" />
    </FormItem>
  );
}

const AssetActivityFields = () => {
  const { control, watch } = useFormContext();
  const watchedType = watch('activityType');
  const isManualAsset = watch('assetDataSource') === 'MANUAL';

  const isSplitType = watchedType === 'SPLIT';
  const isTransferType = watchedType === 'TRANSFER_IN' || watchedType === 'TRANSFER_OUT';
  const isTransferOut = watchedType === 'TRANSFER_OUT';

  return (
    <>
      <FormField
        control={control}
        name="assetId"
        render={({ field }) => <AssetSymbolInput field={field} isManualAsset={isManualAsset} />}
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
        <div className={`grid ${isTransferOut ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
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
