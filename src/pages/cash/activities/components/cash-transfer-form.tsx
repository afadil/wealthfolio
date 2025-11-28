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
import { useEffect } from "react";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { useCashActivityMutations } from "../hooks/use-cash-activity-mutations";
import { NewTransfer } from "@/commands/cash-activity";
import { CategorySelect } from "./category-select";
import { getEventsWithNames } from "@/commands/event";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { EventWithTypeName } from "@/lib/types";

export interface AccountSelectOption {
  value: string;
  label: string;
  currency: string;
}

interface CashTransferFormProps {
  accounts: AccountSelectOption[];
  open?: boolean;
  onClose?: () => void;
}

// Schema for transfer
const transferFormSchema = z
  .object({
    sourceAccountId: z.string().min(1, { message: "Please select a source account." }),
    destinationAccountId: z.string().min(1, { message: "Please select a destination account." }),
    date: z.union([z.date(), z.string().datetime()]).default(new Date()),
    amount: z.coerce
      .number({
        required_error: "Please enter a valid amount.",
        invalid_type_error: "Amount must be a positive number.",
      })
      .positive({ message: "Amount must be greater than 0" }),
    name: z.string().optional(),
    description: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    subCategoryId: z.string().optional().nullable(),
    eventId: z.string().optional().nullable(),
  })
  .refine((data) => data.sourceAccountId !== data.destinationAccountId, {
    message: "Source and destination accounts must be different",
    path: ["destinationAccountId"],
  });

type TransferFormValues = z.infer<typeof transferFormSchema>;

export function CashTransferForm({ accounts, open, onClose }: CashTransferFormProps) {
  const { createTransferMutation } = useCashActivityMutations(onClose);

  // Fetch events for the event select
  const { data: events = [] } = useQuery<EventWithTypeName[], Error>({
    queryKey: [QueryKeys.EVENTS_WITH_NAMES],
    queryFn: getEventsWithNames,
  });

  const defaultValues: Partial<TransferFormValues> = {
    sourceAccountId: "",
    destinationAccountId: "",
    amount: undefined,
    name: "",
    description: null,
    categoryId: null,
    subCategoryId: null,
    eventId: null,
    date: (() => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      return date;
    })(),
  };

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema) as Resolver<TransferFormValues>,
    defaultValues,
  });

  const watchedCategoryId = form.watch("categoryId");

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      createTransferMutation.reset();
    } else {
      form.reset(defaultValues);
    }
  }, [open]);

  const isLoading = createTransferMutation.isPending;

  const onSubmit: SubmitHandler<TransferFormValues> = async (data) => {
    try {
      const sourceAccount = accounts.find((a) => a.value === data.sourceAccountId);
      const destinationAccount = accounts.find((a) => a.value === data.destinationAccountId);

      if (!sourceAccount || !destinationAccount) {
        throw new Error("Source or destination account not found");
      }

      const transferData: NewTransfer = {
        sourceAccountId: data.sourceAccountId,
        destinationAccountId: data.destinationAccountId,
        sourceCurrency: sourceAccount.currency,
        destinationCurrency: destinationAccount.currency,
        date: data.date instanceof Date ? data.date.toISOString() : data.date,
        amount: data.amount,
        name: data.name,
        description: data.description ?? undefined,
        categoryId: data.categoryId,
        subCategoryId: data.subCategoryId,
        eventId: data.eventId,
      };

      return await createTransferMutation.mutateAsync(transferData);
    } catch (error) {
      logger.error(
        `Transfer Form Submit Error: ${JSON.stringify({ error, formValues: form.getValues() })}`,
      );
      return;
    }
  };

  const sourceAccountId = form.watch("sourceAccountId");

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="space-y-8 overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>Transfer Funds</SheetTitle>
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
                          {field}
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
            Move funds between your accounts. This will create two linked transactions.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardContent className="space-y-6 pt-4">
                {/* Source Account */}
                <FormField
                  control={form.control}
                  name="sourceAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From Account</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger aria-label="Source Account">
                            <SelectValue placeholder="Select source account" />
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

                {/* Transfer indicator */}
                <div className="flex justify-center">
                  <div className="bg-muted rounded-full p-2">
                    <Icons.ArrowDown className="h-5 w-5" />
                  </div>
                </div>

                {/* Destination Account */}
                <FormField
                  control={form.control}
                  name="destinationAccountId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To Account</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger aria-label="Destination Account">
                            <SelectValue placeholder="Select destination account" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[400px] overflow-y-auto">
                            {accounts
                              .filter((acc) => acc.value !== sourceAccountId)
                              .map((account) => (
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
                  name="date"
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

                {/* Name (optional for transfers) */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter transfer name..."
                          {...field}
                          aria-label="Name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Pay off credit card, Move to savings..."
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
                ) : (
                  <Icons.ArrowRightLeft className="h-4 w-4" />
                )}
                <span className="ml-2">Create Transfer</span>
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
