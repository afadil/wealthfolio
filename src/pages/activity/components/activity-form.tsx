import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { logger } from '@/adapters';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { DataSource } from '@/lib/constants';
import type { ActivityDetails } from '@/lib/types';
import { useActivityMutations } from '../hooks/use-activity-mutations';
import { TradeForm } from './forms/trade-form';
import { CashForm } from './forms/cash-form';
import { IncomeForm } from './forms/income-form';
import { OtherForm } from './forms/other-form';
import { HoldingsForm } from './forms/holdings-form';
import { newActivitySchema, type NewActivityFormValues } from './forms/schemas';

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
  TRANSFER_IN: 'cash',
  TRANSFER_OUT: 'cash',
  FEE: 'other',
  ADD_HOLDING: 'holdings',
  REMOVE_HOLDING: 'holdings',
};

export function ActivityForm({ accounts, activity, open, onClose }: ActivityFormProps) {
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onClose);

  const isValidActivityType = (type: string | undefined): type is NewActivityFormValues['activityType'] => {
    return type ? Object.keys(ACTIVITY_TYPE_TO_TAB).includes(type) : false;
  };
  const defaultValues: Partial<NewActivityFormValues> = {
    id: activity?.id,
    accountId: activity?.accountId || '',
    activityType: isValidActivityType(activity?.activityType) ? activity.activityType : undefined,
    amount: activity?.amount ,
    quantity: activity?.quantity ,
    unitPrice: activity?.unitPrice,
    fee: activity?.fee || 0,
    isDraft: activity?.isDraft || false,
    comment: activity?.comment || null,
    assetId: activity?.assetId,
    activityDate: activity?.date ? (() => {
      const date = new Date(activity.date);
      date.setHours(16, 0, 0, 0); // Set to 4:00 PM which is market close time
      return date;
    })() : (() => {
      const date = new Date();
      date.setHours(16, 0, 0, 0); // Set to 4:00 PM which is market close time
      return date;
    })(),
    currency: activity?.currency || '',
    assetDataSource: activity?.assetDataSource || DataSource.YAHOO,
    showCurrencySelect: false,
  };

  const form = useForm<NewActivityFormValues>({
    resolver: zodResolver(newActivitySchema),
    defaultValues,
  });
  
  // Reset form when dialog closes or activity changes
  useEffect(() => {
    if (!open) {
      form.reset(); // Reset to empty form
      addActivityMutation.reset();
      updateActivityMutation.reset();
    } else {
      form.reset(defaultValues); // Reset to initial values
    }
  }, [open, activity]);

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  async function onSubmit(data: NewActivityFormValues) {
    try {
      const { showCurrencySelect, ...submissionData } = { ...data, isDraft: false };
      const { id, ...submitData } = submissionData;

      // For cash activities and fees, set assetId to $CASH-accountCurrency and currency
      if (['DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'FEE', 'TRANSFER_IN', 'TRANSFER_OUT'].includes(submitData.activityType)) {
        const account = accounts.find((a) => a.value === submitData.accountId);
        if (account) {
          submitData.assetId = `$CASH-${account.currency}`;
          submitData.currency = submitData.currency || account.currency;
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

  const defaultTab = activity ? ACTIVITY_TYPE_TO_TAB[activity.activityType] || 'holdings' : 'holdings';

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
                          {error?.message?.toString() || 'Invalid value'}
                        </li>
                      ))}
                    </ul>
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}
          </div>
          <SheetDescription>
            {activity?.id
              ? 'Update the details of your transaction'
              : 'Record a new transaction in your account.'}
            {'→ '}
            <a
              href="https://wealthfolio.app/docs/concepts/activity-types"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Learn more
            </a>
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue={defaultTab} className="w-full">
          {!activity?.id && (
            <TabsList className="mb-6 grid grid-cols-5">
              <TabsTrigger value="holdings" className="flex items-center gap-2">
                <Icons.Wallet className="h-4 w-4" />
                Holdings
              </TabsTrigger>
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
                <TabsContent value="holdings">
                  <HoldingsForm accounts={accounts} />
                </TabsContent>
                <TabsContent value="trade">
                  <TradeForm accounts={accounts} />
                </TabsContent>
                <TabsContent value="cash">
                  <CashForm accounts={accounts} />
                </TabsContent>
                <TabsContent value="income">
                  <IncomeForm accounts={accounts} />
                </TabsContent>
                <TabsContent value="other">
                  <OtherForm accounts={accounts} />
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
