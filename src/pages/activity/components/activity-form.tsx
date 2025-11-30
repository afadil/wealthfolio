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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataSource } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useActivityMutations } from "../hooks/use-activity-mutations";
import { CashForm } from "./forms/cash-form";
import { HoldingsForm } from "./forms/holdings-form";
import { IncomeForm } from "./forms/income-form";
import { OtherForm } from "./forms/other-form";
import { newActivitySchema, type NewActivityFormValues } from "./forms/schemas";
import { TradeForm } from "@/components/forms/trade-form";

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
  onOpenChange?: (open: boolean) => void;
}

const ACTIVITY_TYPE_TO_TAB: Record<string, string> = {
  BUY: "trade",
  SELL: "trade",
  DEPOSIT: "cash",
  WITHDRAWAL: "cash",
  INTEREST: "income",
  DIVIDEND: "income",
  SPLIT: "other",
  TRANSFER_IN: "cash",
  TRANSFER_OUT: "cash",
  TRANSFER: "cash",
  FEE: "other",
  TAX: "other",
  ADD_HOLDING: "holdings",
  REMOVE_HOLDING: "holdings",
};

export function ActivityForm({
  accounts,
  activity,
  open,
  onClose,
  onOpenChange,
}: ActivityFormProps) {
  const { t } = useTranslation("activity");
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onClose);

  const handleOpenChange = (val: boolean) => {
    onOpenChange?.(val);
    if (!val) {
      onClose?.();
    }
  };

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
    isDraft: activity?.isDraft ?? false,
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
    assetDataSource: activity?.assetDataSource || DataSource.YAHOO,
    showCurrencySelect: false,
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
    } else {
      form.reset(defaultValues); // Reset to initial values
    }
  }, [open, activity]);

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  const onSubmit: SubmitHandler<NewActivityFormValues> = async (data) => {
    try {
      const { showCurrencySelect, id, toAccountId, ...submitData } = {
        ...data,
        isDraft: false,
      } as any;

      // Handle TRANSFER activity by creating paired activities
      if (submitData.activityType === "TRANSFER") {
        // Validation for TRANSFER type
        if (!toAccountId) {
          form.setError("toAccountId", {
            type: "manual",
            message: t("form.toAccountRequired"),
          });
          return;
        }

        if (submitData.accountId && toAccountId && submitData.accountId === toAccountId) {
          form.setError("toAccountId", {
            type: "manual",
            message: t("form.toAccountDifferent"),
          });
          return;
        }

        if (submitData.accountId && toAccountId && submitData.accountId === toAccountId) {
          form.setError("toAccountId", {
            type: "manual",
            message: t("form.toAccountDifferent"),
          });
          return;
        }

        const fromAccount = accounts.find((a) => a.value === submitData.accountId);
        const toAccount = accounts.find((a) => a.value === toAccountId);

        if (fromAccount && toAccount) {
          // Create TRANSFER_OUT activity for source account
          const transferOutActivity = {
            ...submitData,
            activityType: "TRANSFER_OUT" as const,
            assetId: `$CASH-${fromAccount.currency}`,
            accountId: submitData.accountId,
          };

          // Create TRANSFER_IN activity for destination account
          const transferInActivity = {
            ...submitData,
            activityType: "TRANSFER_IN" as const,
            assetId: `$CASH-${toAccount.currency}`,
            accountId: toAccountId,
          };

          if (id) {
            // For updates, we would need to update both activities
            // This is a simplified implementation - in a real app you'd need to handle this more carefully
            await updateActivityMutation.mutateAsync({ id, ...transferOutActivity });
          } else {
            // Add both activities
            await addActivityMutation.mutateAsync(transferOutActivity);
            await addActivityMutation.mutateAsync(transferInActivity);
          }
          return;
        }
      }

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

  const defaultTab = activity?.activityType
    ? ACTIVITY_TYPE_TO_TAB[activity.activityType] || "trade"
    : "trade";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="space-y-8 overflow-y-auto sm:max-w-[625px]">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>{activity?.id ? t("form.updateActivity") : t("addActivity")}</SheetTitle>
            {Object.keys(form.formState.errors).length > 0 && (
              <HoverCard>
                <HoverCardTrigger>
                  <Icons.AlertCircle className="text-destructive h-5 w-5" />
                </HoverCardTrigger>
                <HoverCardContent className="border-destructive/50 bg-destructive text-destructive-foreground dark:border-destructive [&>svg]:text-destructive w-[600px]">
                  <div className="space-y-2">
                    <h4 className="font-medium">{t("form.pleaseReviewEntry")}</h4>
                    <ul className="list-disc space-y-1 pl-4 text-sm">
                      {Object.entries(form.formState.errors).map(([field, error]) => (
                        <li key={field}>
                          {field === "activityType" ? t("form.transactionType") : field}
                          {": "}
                          {error?.message?.toString() || t("form.invalidValue")}
                        </li>
                      ))}
                    </ul>
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}
          </div>
          <SheetDescription>
            {activity?.id ? t("form.updateDescription") : t("form.addDescription")}
            {"→ "}
            <a
              href="https://github.com/vn-wealthfolio/WealthVN/blob/main/docs/activities/activity-types.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {t("form.learnMore")}
            </a>
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue={defaultTab} className="w-full">
          {!activity?.id && (
            <TabsList className="mb-6 grid grid-cols-5">
              <TabsTrigger value="trade" className="flex items-center gap-2">
                <Icons.ArrowRightLeft className="h-4 w-4" />
                {t("form.tabs.trade")}
              </TabsTrigger>
              <TabsTrigger value="holdings" className="flex items-center gap-2">
                <Icons.Wallet className="h-4 w-4" />
                {t("form.tabs.holdings")}
              </TabsTrigger>
              <TabsTrigger value="cash" className="flex items-center gap-2">
                <Icons.DollarSign className="h-4 w-4" />
                {t("form.tabs.cash")}
              </TabsTrigger>
              <TabsTrigger value="income" className="flex items-center gap-2">
                <Icons.Income className="h-4 w-4" />
                {t("form.tabs.income")}
              </TabsTrigger>
              <TabsTrigger value="other" className="flex items-center gap-2">
                <Icons.FileText className="h-4 w-4" />
                {t("form.tabs.other")}
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
                  <HoldingsForm accounts={accounts} />
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
                    {t("form.cancel")}
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
                    {activity?.id ? t("form.updateActivity") : t("addActivity")}
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
