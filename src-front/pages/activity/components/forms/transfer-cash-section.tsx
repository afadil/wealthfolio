import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Card,
  CardContent,
  Button,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
  MoneyInput,
  Input,
  Icons,
  DatePickerInput,
  Textarea,
} from "@wealthfolio/ui";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useAccounts } from "@/hooks/use-accounts";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import { ActivityType } from "@/lib/constants";
import type { ActivityBulkMutationRequest } from "@/lib/types";
import {
  AccountCombobox,
  TransferModeSelector,
  DirectionSelector,
  AccountPairSelector,
} from "./transfer-components";

// Schema for transfer cash form
const transferCashSchema = z.object({
  isExternal: z.boolean().default(false),
  // For internal transfers
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  // For external transfers
  accountId: z.string().optional(),
  direction: z.enum(["in", "out"]).optional(),
  // Cash details
  amount: z.coerce.number().positive("Amount must be positive"),
  // Common
  fee: z.coerce.number().min(0).default(0).optional(),
  fxRate: z.coerce.number().positive().optional().nullable(),
  activityDate: z.union([z.date(), z.string().datetime()]).default(new Date()),
  comment: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.isExternal) {
    if (!data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select an account",
        path: ["accountId"],
      });
    }
    if (!data.direction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select direction",
        path: ["direction"],
      });
    }
  } else {
    if (!data.fromAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select source account",
        path: ["fromAccountId"],
      });
    }
    if (!data.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please select destination account",
        path: ["toAccountId"],
      });
    }
    if (data.fromAccountId === data.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Accounts must be different",
        path: ["toAccountId"],
      });
    }
  }
});

type TransferCashFormValues = z.infer<typeof transferCashSchema>;

interface TransferCashSectionProps {
  onSuccess?: () => void;
}

export function TransferCashSection({ onSuccess }: TransferCashSectionProps) {
  const { accounts } = useAccounts(true);
  const { saveActivitiesMutation } = useActivityMutations(onSuccess);

  const form = useForm<TransferCashFormValues>({
    resolver: zodResolver(transferCashSchema) as never,
    defaultValues: {
      isExternal: false,
      activityDate: new Date(),
      fee: 0,
    },
  });

  const { watch, setValue, handleSubmit, control, reset, formState: { isSubmitting } } = form;

  const isExternal = watch("isExternal");
  const fromAccountId = watch("fromAccountId");
  const toAccountId = watch("toAccountId");
  const accountId = watch("accountId");
  const direction = watch("direction");

  // Get account details for currency check
  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

  const hasCurrencyMismatch = useMemo(() => {
    if (isExternal) return false;
    return fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  }, [isExternal, fromAccount, toAccount]);

  const onSubmit = async (data: TransferCashFormValues) => {
    try {
      const creates: ActivityBulkMutationRequest["creates"] = [];

      if (data.isExternal) {
        // External transfer - single activity
        // Don't set assetId - backend will generate CASH:{currency}
        const activityType = data.direction === "in"
          ? ActivityType.TRANSFER_IN
          : ActivityType.TRANSFER_OUT;
        const account = accounts.find((a) => a.id === data.accountId);
        const currency = account?.currency || "USD";

        creates.push({
          accountId: data.accountId!,
          activityType,
          activityDate: new Date(data.activityDate).toISOString(),
          // assetId omitted - backend generates CASH:{currency}
          quantity: data.amount,
          unitPrice: 1,
          currency,
          fee: data.fee || 0,
          comment: data.comment || undefined,
          fxRate: data.fxRate || undefined,
        });
      } else {
        // Internal transfer - create both activities with group_id
        // Don't set assetId - backend will generate CASH:{currency}
        const fromAcct = accounts.find((a) => a.id === data.fromAccountId);
        const toAcct = accounts.find((a) => a.id === data.toAccountId);
        const fromCurrency = fromAcct?.currency || "USD";
        const toCurrency = toAcct?.currency || "USD";

        // TRANSFER_OUT from source
        creates.push({
          accountId: data.fromAccountId!,
          activityType: ActivityType.TRANSFER_OUT,
          activityDate: new Date(data.activityDate).toISOString(),
          // assetId omitted - backend generates CASH:{currency}
          quantity: data.amount,
          unitPrice: 1,
          currency: fromCurrency,
          fee: data.fee || 0,
          comment: data.comment
            ? `Transfer to ${toAcct?.name}: ${data.comment}`
            : `Transfer to ${toAcct?.name}`,
        });

        // TRANSFER_IN to destination
        // Calculate destination amount if FX rate is provided
        const destinationAmount = hasCurrencyMismatch && data.fxRate
          ? data.amount * data.fxRate
          : data.amount;

        creates.push({
          accountId: data.toAccountId!,
          activityType: ActivityType.TRANSFER_IN,
          activityDate: new Date(data.activityDate).toISOString(),
          // assetId omitted - backend generates CASH:{currency}
          quantity: destinationAmount,
          unitPrice: 1,
          currency: toCurrency,
          fxRate: hasCurrencyMismatch ? data.fxRate || undefined : undefined,
          comment: data.comment
            ? `Transfer from ${fromAcct?.name}: ${data.comment}`
            : `Transfer from ${fromAcct?.name}`,
        });
      }

      await saveActivitiesMutation.mutateAsync({
        creates,
        updates: [],
        deleteIds: [],
      });

      toast({
        title: "Transfer completed",
        description: isExternal
          ? "External cash transfer recorded."
          : "Cash transferred between accounts.",
        variant: "success",
      });

      reset();
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Transfer failed",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-4">
            {/* Internal/External Toggle */}
            <TransferModeSelector
              isExternal={isExternal}
              onExternalChange={(val) => {
                setValue("isExternal", val);
                // Clear amount when mode changes
                setValue("amount", undefined as never);
              }}
            />

            {/* Account Selection */}
            {isExternal ? (
              <div className="space-y-4">
                <DirectionSelector
                  direction={direction}
                  onDirectionChange={(dir) => setValue("direction", dir)}
                />
                <AccountCombobox
                  value={accountId}
                  onChange={(id) => setValue("accountId", id)}
                  label="Account"
                  placeholder="Select account..."
                />
              </div>
            ) : (
              <AccountPairSelector
                fromAccountId={fromAccountId}
                toAccountId={toAccountId}
                onFromChange={(id) => setValue("fromAccountId", id)}
                onToChange={(id) => setValue("toAccountId", id)}
              />
            )}

            {/* Amount */}
            <FormField
              control={control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <MoneyInput
                      {...field}
                      value={field.value ?? ""}
                      aria-label="Amount"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fee */}
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transfer Fee (optional)</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} aria-label="Fee" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* FX Rate if currency mismatch */}
            {hasCurrencyMismatch && (
              <FormField
                control={control}
                name="fxRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>FX Rate</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="Exchange rate"
                      />
                    </FormControl>
                    <FormDescription>
                      Rate from {fromAccount?.currency} to {toAccount?.currency}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Date */}
            <FormField
              control={control}
              name="activityDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <DatePickerInput
                    onChange={(date) => field.onChange(date)}
                    value={field.value instanceof Date ? field.value : new Date(field.value)}
                    enableTime={true}
                    timeGranularity="minute"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Comment */}
            <FormField
              control={control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Add a note..."
                      className="resize-none"
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting || saveActivitiesMutation.isPending}
        >
          {(isSubmitting || saveActivitiesMutation.isPending) ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Icons.ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfer Cash
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
