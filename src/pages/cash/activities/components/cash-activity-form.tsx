import { logger } from "@/adapters";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Icons } from "@/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActivityCreate, ActivityDetails, ActivityUpdate, EventWithTypeName } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  MoneyInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useState } from "react";
import { useForm, type Control, type FieldValues, type Resolver, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { useCashActivityMutations } from "../hooks/use-cash-activity-mutations";
import { useCategoryRuleMatch } from "../hooks/use-category-rule-match";
import { CategorySelect } from "./category-select";
import { getEventsWithNames } from "@/commands/event";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { ActivityTypeSelector, type ActivityType as ActivityTypeUI } from "@/pages/activity/components/activity-type-selector";

export interface AccountSelectOption {
  value: string;
  label: string;
  currency: string;
}

interface CashActivityFormProps {
  accounts: AccountSelectOption[];
  activity?: Partial<ActivityDetails>;
  open?: boolean;
  onClose?: () => void;
}

// Schema for cash activity (deposit/withdrawal/transfer)
const cashActivityFormSchema = z.object({
  id: z.string().optional(),
  accountId: z.string().min(1, { message: "Please select an account." }),
  activityType: z.enum(["DEPOSIT", "WITHDRAWAL", "TRANSFER_IN", "TRANSFER_OUT"], {
    required_error: "Please select a transaction type.",
  }),
  activityDate: z.union([z.date(), z.string().datetime()]).default(new Date()),
  amount: z.coerce
    .number({
      required_error: "Please enter a valid amount.",
      invalid_type_error: "Amount must be a positive number.",
    })
    .positive({ message: "Amount must be greater than 0" }),
  comment: z.string().optional().nullable(),
  name: z.string().min(1, { message: "Name is required." }),
  categoryId: z.string().optional().nullable(),
  subCategoryId: z.string().optional().nullable(),
  eventId: z.string().optional().nullable(),
});

type CashActivityFormValues = z.infer<typeof cashActivityFormSchema>;

// Activity types for the radio button selector
const cashActivityTypes: ActivityTypeUI[] = [
  {
    value: "DEPOSIT",
    label: "Deposit",
    icon: "ArrowDown",
    description: "Increase your account balance by adding funds.",
  },
  {
    value: "WITHDRAWAL",
    label: "Withdrawal",
    icon: "ArrowUp",
    description: "Decrease your account balance by taking out funds.",
  },
  {
    value: "TRANSFER_IN",
    label: "Transfer In",
    icon: "ArrowDown",
    description: "Move funds into this account from another account.",
  },
  {
    value: "TRANSFER_OUT",
    label: "Transfer Out",
    icon: "ArrowUp",
    description: "Move funds from this account to another account.",
  },
];

export function CashActivityForm({ accounts, activity, open, onClose }: CashActivityFormProps) {
  const { addCashActivityMutation, updateCashActivityMutation } = useCashActivityMutations(onClose);
  const [isOverridden, setIsOverridden] = useState(false);

  // Fetch events for the event select
  const { data: events = [] } = useQuery<EventWithTypeName[], Error>({
    queryKey: [QueryKeys.EVENTS_WITH_NAMES],
    queryFn: getEventsWithNames,
  });

  const isValidActivityType = (type: string | undefined): type is CashActivityFormValues["activityType"] => {
    return type === "DEPOSIT" || type === "WITHDRAWAL" || type === "TRANSFER_IN" || type === "TRANSFER_OUT";
  };

  const getDefaultValues = useCallback((): Partial<CashActivityFormValues> => ({
    id: activity?.id,
    accountId: activity?.accountId || "",
    activityType: isValidActivityType(activity?.activityType) ? activity.activityType : undefined,
    amount: activity?.amount ? Math.abs(activity.amount) : undefined,
    comment: activity?.comment ?? null,
    name: activity?.name ?? "",
    categoryId: activity?.categoryId ?? null,
    subCategoryId: activity?.subCategoryId ?? null,
    eventId: activity?.eventId ?? null,
    activityDate: activity?.date
      ? new Date(activity.date)
      : (() => {
          const date = new Date();
          date.setHours(12, 0, 0, 0);
          return date;
        })(),
  }), [activity]);

  const form = useForm<CashActivityFormValues>({
    resolver: zodResolver(cashActivityFormSchema) as Resolver<CashActivityFormValues>,
    defaultValues: getDefaultValues(),
  });

  const watchedName = form.watch("name");
  const watchedAccountId = form.watch("accountId");
  const watchedCategoryId = form.watch("categoryId");

  // Category rule matching hook - only check for matches, don't auto-apply
  const { match, isLoading: isMatchLoading, clearMatch } = useCategoryRuleMatch({
    name: watchedName,
    accountId: watchedAccountId,
    enabled: !activity?.id && !isOverridden, // Only match for new activities when not overridden
  });

  // Handle applying the matched category rule
  const handleApplyMatch = useCallback(() => {
    if (match) {
      form.setValue("categoryId", match.categoryId);
      form.setValue("subCategoryId", match.subCategoryId || null);
      setIsOverridden(true); // Mark as manually set so further typing doesn't re-suggest
      clearMatch();
    }
  }, [match, form, clearMatch]);

  // Handle dismissing the suggestion
  const handleDismissMatch = useCallback(() => {
    setIsOverridden(true);
    clearMatch();
  }, [clearMatch]);

  // Reset form when dialog closes or activity changes
  useEffect(() => {
    if (!open) {
      form.reset();
      addCashActivityMutation.reset();
      updateCashActivityMutation.reset();
      setIsOverridden(false);
      clearMatch();
    } else {
      form.reset(getDefaultValues());
      // If editing an existing activity with category, mark as overridden to allow editing
      if (activity?.id && activity?.categoryId) {
        setIsOverridden(true);
      }
    }
  }, [open, activity, getDefaultValues]);

  const isLoading = addCashActivityMutation.isPending || updateCashActivityMutation.isPending;

  const onSubmit: SubmitHandler<CashActivityFormValues> = async (data) => {
    try {
      const account = accounts.find((a) => a.value === data.accountId);
      if (!account) {
        throw new Error("Account not found");
      }

      // For cash activities, set assetId to $CASH-{currency}
      const assetId = `$CASH-${account.currency}`;

      if (data.id) {
        const updateData: ActivityUpdate = {
          id: data.id,
          accountId: data.accountId,
          activityType: data.activityType,
          activityDate:
            data.activityDate instanceof Date
              ? data.activityDate.toISOString()
              : data.activityDate,
          amount: data.amount,
          quantity: 1,
          unitPrice: data.amount,
          currency: account.currency,
          assetId,
          isDraft: false,
          comment: data.comment,
          name: data.name,
          categoryId: data.categoryId,
          subCategoryId: data.subCategoryId,
          eventId: data.eventId,
        };
        return await updateCashActivityMutation.mutateAsync(updateData);
      }

      const createData: ActivityCreate = {
        accountId: data.accountId,
        activityType: data.activityType,
        activityDate:
          data.activityDate instanceof Date ? data.activityDate.toISOString() : data.activityDate,
        amount: data.amount,
        quantity: 1,
        unitPrice: data.amount,
        currency: account.currency,
        assetId,
        isDraft: false,
        comment: data.comment,
        name: data.name,
        categoryId: data.categoryId,
        subCategoryId: data.subCategoryId,
        eventId: data.eventId,
      };
      return await addCashActivityMutation.mutateAsync(createData);
    } catch (error) {
      logger.error(
        `Cash Activity Form Submit Error: ${JSON.stringify({ error, formValues: form.getValues() })}`,
      );
      return;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="space-y-8 overflow-y-auto sm:max-w-[625px]">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{activity?.id ? "Update Transaction" : "Add Transaction"}</SheetTitle>
            {Object.keys(form.formState.errors).length > 0 && (
              <HoverCard>
                <HoverCardTrigger>
                  <Icons.AlertCircle className="text-destructive h-5 w-5" />
                </HoverCardTrigger>
                <HoverCardContent className="border-destructive/50 bg-destructive text-destructive-foreground dark:border-destructive [&>svg]:text-destructive w-[400px]">
                  <div className="space-y-2">
                    <h4 className="font-medium">Please Review Your Entry</h4>
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {Object.entries(form.formState.errors).map(([field, error]) => (
                        <li key={field}>
                          {field === "activityType" ? "Transaction Type" : field}
                          {": "}
                          {error?.message?.toString() || "Invalid value"}
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
              ? "Update the details of your cash transaction"
              : "Record a new transaction in your account."}
            {"→ "}
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Activity Type Radio Buttons */}
            {!activity?.id && (
              <ActivityTypeSelector
                control={form.control as unknown as Control<FieldValues>}
                types={cashActivityTypes}
                columns={4}
              />
            )}

            <Card>
              <CardContent className="space-y-6 pt-4">
                {/* Amount */}
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <MoneyInput {...field} aria-label="Amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Account */}
                <FormField
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger aria-label="Account">
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[400px] overflow-y-auto">
                            {accounts.map((account) => (
                              <SelectItem value={account.value} key={account.value}>
                                {account.label}
                                <span className="text-muted-foreground ml-1 font-light">
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

                {/* Date */}
                <FormField
                  control={form.control}
                  name="activityDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <DatePickerInput
                        onChange={(date: Date | undefined) => field.onChange(date)}
                        value={field.value as Date}
                        disabled={field.disabled}
                        enableTime={true}
                        timeGranularity="minute"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Name (Merchant/Source) */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Name
                        {isMatchLoading && (
                          <Icons.Spinner className="h-3 w-3 animate-spin text-muted-foreground" />
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter merchant or source name..."
                          {...field}
                          aria-label="Name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Category Rule Match Suggestion */}
                {match && !watchedCategoryId && (
                  <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <Icons.Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1">
                      Rule matched: <strong>{match.ruleName}</strong>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleApplyMatch}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDismissMatch}
                      className="h-8 w-8 p-0"
                    >
                      <Icons.Close className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Category & Subcategory */}
                <CategorySelect
                  control={form.control}
                  categoryFieldName="categoryId"
                  subCategoryFieldName="subCategoryId"
                  selectedCategoryId={watchedCategoryId}
                />

                {/* Event */}
                <FormField
                  control={form.control}
                  name="eventId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event (optional)</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                          value={field.value || "__none__"}
                        >
                          <SelectTrigger aria-label="Event">
                            <SelectValue placeholder="Select event (optional)" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[400px] overflow-y-auto">
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">No event</span>
                            </SelectItem>
                            {events.map((event) => (
                              <SelectItem value={event.id} key={event.id}>
                                <span className="flex items-center gap-2">
                                  {event.name}
                                  <span className="text-muted-foreground text-xs">
                                    ({event.eventTypeName})
                                  </span>
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

                {/* Description */}
                <FormField
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add an optional description or comment for this transaction..."
                          className="resize-none"
                          rows={3}
                          {...field}
                          value={field.value || ""}
                          aria-label="Description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

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
                <span className="ml-2">{activity?.id ? "Update Activity" : "Add Activity"}</span>
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
