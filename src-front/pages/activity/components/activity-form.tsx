import { logger } from "@/adapters";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Form } from "@wealthfolio/ui/components/ui/form";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@wealthfolio/ui/components/ui/hover-card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { DataSource } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { useActivityMutations } from "../hooks/use-activity-mutations";
import { CashForm } from "./forms/cash-form";
import { HoldingsForm } from "./forms/holdings-form";
import { IncomeForm } from "./forms/income-form";
import { OtherForm } from "./forms/other-form";
import { newActivitySchema, type NewActivityFormValues } from "./forms/schemas";
import { TradeForm } from "./forms/trade-form";

export interface AccountSelectOption {
  value: string;
  label: string;
  currency: string;
}

interface ActivityFormProps {
  accounts: AccountSelectOption[];
  activity?: Partial<ActivityDetails>;
  open?: boolean;
  onClose?: () => void;
}

const ACTIVITY_TYPE_TO_TAB: Record<string, string> = {
  BUY: "trade",
  SELL: "trade",
  DEPOSIT: "cash",
  WITHDRAWAL: "cash",
  // TRANSFER_IN/TRANSFER_OUT with metadata.flow.is_external=true are for add/remove holdings
  // but we can't distinguish here without checking metadata, so they go to cash form
  TRANSFER_IN: "cash",
  TRANSFER_OUT: "cash",
  INTEREST: "income",
  DIVIDEND: "income",
  SPLIT: "other",
  FEE: "other",
  TAX: "other",
  ADJUSTMENT: "other",
};

export function ActivityForm({ accounts, activity, open, onClose }: ActivityFormProps) {
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onClose);
  const [isTransferMode, setIsTransferMode] = useState(false);

  const isValidActivityType = (
    type: string | undefined,
  ): type is NewActivityFormValues["activityType"] => {
    return type ? Object.keys(ACTIVITY_TYPE_TO_TAB).includes(type) : false;
  };
  const defaultValues: Partial<NewActivityFormValues> = {
    id: activity?.id,
    accountId: activity?.accountId || "",
    activityType: isValidActivityType(activity?.activityType) ? activity.activityType : undefined,
    amount: activity?.amount,
    quantity: activity?.quantity,
    unitPrice: activity?.unitPrice,
    fee: activity?.fee ?? 0,
    comment: activity?.comment ?? null,
    assetId: activity?.assetId,
    activityDate: activity?.date
      ? (() => {
          return new Date(activity.date);
        })()
      : (() => {
          const date = new Date();
          date.setHours(16, 0, 0, 0); // Set to 4:00 PM which is market close time
          return date;
        })(),

    currency: activity?.currency || "",
    fxRate: activity?.fxRate ?? null,
    assetDataSource: activity?.assetDataSource || DataSource.YAHOO,
    showCurrencySelect: Boolean(activity?.currency && activity?.fxRate),
  };

  const form = useForm<NewActivityFormValues>({
    resolver: zodResolver(newActivitySchema) as Resolver<NewActivityFormValues>,
    defaultValues,
  });

  // Reset form when dialog closes or activity changes
  useEffect(() => {
    if (!open) {
      form.reset(); // Reset to empty form
      addActivityMutation.reset();
      updateActivityMutation.reset();
      setIsTransferMode(false); // Reset transfer mode
    } else {
      form.reset(defaultValues); // Reset to initial values
    }
  }, [open, activity]);

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  const onSubmit: SubmitHandler<NewActivityFormValues> = async (data) => {
    try {
      const { showCurrencySelect: _showCurrencySelect, id, ...submitData } = data;
      const account = accounts.find((a) => a.value === submitData.accountId);
      // For cash activities and fees, set assetId to $CASH-accountCurrency
      if (
        ["DEPOSIT", "WITHDRAWAL", "INTEREST", "FEE", "TAX", "TRANSFER_IN", "TRANSFER_OUT"].includes(
          submitData.activityType,
        )
      ) {
        if (account) {
          submitData.assetId = `$CASH-${account.currency}`;
        }
      }

      if (
        "assetDataSource" in submitData &&
        submitData.assetDataSource === DataSource.MANUAL &&
        account
      ) {
        submitData.currency = submitData.currency || account.currency;
      }
      if (id) {
        return await updateActivityMutation.mutateAsync({ id, ...submitData });
      }
      return await addActivityMutation.mutateAsync(submitData);
    } catch (error) {
      logger.error(
        `Activity Form Submit Error: ${JSON.stringify({ error, formValues: form.getValues() })}`,
      );
      return; // Explicit return for catch block
    }
  };

  const defaultTab = ACTIVITY_TYPE_TO_TAB[activity?.activityType ?? ""] || "trade";

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="space-y-8 overflow-y-auto sm:max-w-[625px]">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{activity?.id ? "Update Activity" : "Add Activity"}</SheetTitle>
            {Object.keys(form.formState.errors).length > 0 && (
              <HoverCard>
                <HoverCardTrigger>
                  <Icons.AlertCircle className="text-destructive h-5 w-5" />
                </HoverCardTrigger>
                <HoverCardContent
                  side="bottom"
                  align="start"
                  className="border-destructive/50 bg-destructive text-destructive-foreground dark:border-destructive [&>svg]:text-destructive max-w-[400px]"
                >
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
              ? "Update the details of your transaction"
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
        <Tabs defaultValue={defaultTab} className="w-full">
          {!activity?.id && (
            <TabsList className="mb-6 grid grid-cols-5">
              <TabsTrigger value="trade" className="flex items-center gap-2">
                <Icons.ArrowRightLeft className="h-4 w-4" />
                Trade
              </TabsTrigger>
              <TabsTrigger value="holdings" className="flex items-center gap-2">
                <Icons.Wallet className="h-4 w-4" />
                Holdings
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
                  <TradeForm accounts={accounts} />
                </TabsContent>
                <TabsContent value="holdings">
                  <HoldingsForm accounts={accounts} onSuccess={onClose} onTransferModeChange={setIsTransferMode} />
                </TabsContent>
                <TabsContent value="cash">
                  <CashForm accounts={accounts} onSuccess={onClose} onTransferModeChange={setIsTransferMode} />
                </TabsContent>
                <TabsContent value="income">
                  <IncomeForm accounts={accounts} />
                </TabsContent>
                <TabsContent value="other">
                  <OtherForm accounts={accounts} />
                </TabsContent>
              </div>

              {!isTransferMode && (
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
                      {activity?.id ? "Update Activity" : "Add Activity"}
                    </span>
                  </Button>
                </SheetFooter>
              )}
            </form>
          </Form>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
