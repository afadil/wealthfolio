import { logger } from "@/adapters";
import { getAccounts } from "@/commands/account";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Form } from "@wealthfolio/ui/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { ActivityType, DataSource } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Account, ActivityDetails } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, Icons, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import { useMemo } from "react";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AccountSelectOption } from "./components/activity-form";
import { CashForm } from "./components/forms/cash-form";
import { HoldingsForm } from "./components/forms/holdings-form";
import { IncomeForm } from "./components/forms/income-form";
import { OtherForm } from "./components/forms/other-form";
import { newActivitySchema, type NewActivityFormValues } from "./components/forms/schemas";
import { TradeForm } from "./components/forms/trade-form";
import { MobileActivityForm } from "./components/mobile-forms/mobile-activity-form";
import { useActivityMutations } from "./hooks/use-activity-mutations";

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
  FEE: "other",
  TAX: "other",
  ADD_HOLDING: "holdings",
  REMOVE_HOLDING: "holdings",
};

const ActivityManagerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobileViewport = useIsMobileViewport();

  // Parse URL parameters
  const typeParam = searchParams.get("type") as ActivityType | null;
  const accountParam = searchParams.get("account");
  const symbolParam = searchParams.get("symbol");
  const redirectTo = searchParams.get("redirect-to");

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  // Prepare account options for the form
  const accountOptions: AccountSelectOption[] = useMemo(
    () =>
      (accountsData ?? [])
        .filter((acc) => acc.isActive)
        .map((account) => ({
          value: account.id,
          label: account.name,
          currency: account.currency,
        })),
    [accountsData],
  );

  const handleClose = () => {
    if (redirectTo) {
      navigate(redirectTo);
      return;
    }
    navigate(-1);
  };

  const { addActivityMutation, updateActivityMutation } = useActivityMutations(handleClose);

  // Get the account name if pre-selected
  const selectedAccountName = useMemo(() => {
    if (accountParam && accountsData) {
      const account = accountsData.find((acc) => acc.id === accountParam);
      return account?.name;
    }
    return null;
  }, [accountParam, accountsData]);

  // Build initial activity from URL params
  const initialActivity: Partial<ActivityDetails> = useMemo(() => {
    const activity: Partial<ActivityDetails> = {};

    if (typeParam) {
      activity.activityType = typeParam;
    }

    if (accountParam) {
      activity.accountId = accountParam;
    }

    if (symbolParam) {
      // Set the symbol as assetId - the form will handle the lookup
      activity.assetId = symbolParam;
    }

    return activity;
  }, [typeParam, accountParam, symbolParam]);

  const isValidActivityType = (
    type: string | undefined,
  ): type is NewActivityFormValues["activityType"] => {
    return type ? Object.keys(ACTIVITY_TYPE_TO_TAB).includes(type) : false;
  };

  const defaultValues: Partial<NewActivityFormValues> = {
    id: initialActivity?.id,
    accountId: initialActivity?.accountId ?? "",
    activityType: isValidActivityType(initialActivity?.activityType)
      ? initialActivity.activityType
      : undefined,
    amount: initialActivity?.amount,
    quantity: initialActivity?.quantity,
    unitPrice: initialActivity?.unitPrice,
    fee: initialActivity?.fee ?? 0,
    isDraft: initialActivity?.isDraft ?? false,
    comment: initialActivity?.comment ?? null,
    assetId: initialActivity?.assetId,
    activityDate: initialActivity?.date
      ? new Date(initialActivity.date)
      : (() => {
          const date = new Date();
          date.setHours(16, 0, 0, 0);
          return date;
        })(),
    currency: initialActivity?.currency ?? "",
    assetDataSource: initialActivity?.assetDataSource ?? DataSource.YAHOO,
    showCurrencySelect: false,
  };

  const form = useForm<NewActivityFormValues>({
    resolver: zodResolver(newActivitySchema) as Resolver<NewActivityFormValues>,
    defaultValues,
  });

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  const onSubmit: SubmitHandler<NewActivityFormValues> = async (data) => {
    try {
      const {
        showCurrencySelect: _showCurrencySelect,
        id,
        ...submitData
      } = {
        ...data,
        isDraft: false,
      };
      const account = accountOptions.find((a) => a.value === submitData.accountId);

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
        submitData.currency = submitData.currency ?? account.currency;
      }

      if (id) {
        await updateActivityMutation.mutateAsync({ id, ...submitData });
      } else {
        await addActivityMutation.mutateAsync(submitData);
      }
    } catch (error) {
      logger.error(
        `Activity Form Submit Error: ${JSON.stringify({ error, formValues: form.getValues() })}`,
      );
    }
  };

  const defaultTab = ACTIVITY_TYPE_TO_TAB[initialActivity?.activityType ?? ""] ?? "trade";

  // For mobile, use the existing mobile form component
  if (isMobileViewport) {
    return (
      <Page>
        <PageHeader
          heading="Add Activity"
          text={
            selectedAccountName
              ? `Add a new transaction to ${selectedAccountName}`
              : "Create a new transaction or activity for your account"
          }
          onBack={handleClose}
        />
        <PageContent>
          <MobileActivityForm
            key={initialActivity?.id ?? "new"}
            accounts={accountOptions}
            activity={initialActivity}
            open={true}
            onClose={handleClose}
          />
        </PageContent>
      </Page>
    );
  }

  // Desktop inline form
  return (
    <Page>
      <PageHeader
        heading="Add Activity"
        text={
          selectedAccountName
            ? `Add a new transaction to ${selectedAccountName}`
            : "Create a new transaction or activity for your account"
        }
        onBack={handleClose}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a
              href="https://wealthfolio.app/docs/concepts/activity-types"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
            >
              <Icons.HelpCircle className="h-4 w-4" />
              Learn more
            </a>
          </Button>
        }
      />
      <PageContent>
        <div className="mx-auto max-w-5xl">
          <Card>
            <CardContent className="p-6">
              <Tabs defaultValue={defaultTab} className="w-full">
                {/* Transaction Type Tabs */}
                {!initialActivity?.id && (
                  <div className="mb-6">
                    <TabsList className="grid h-auto w-full grid-cols-5 p-1">
                      <TabsTrigger
                        value="trade"
                        className="data-[state=active]:bg-background flex flex-col items-center gap-1.5 rounded-lg px-4 py-3 data-[state=active]:shadow-sm"
                      >
                        <Icons.ArrowRightLeft className="h-5 w-5" />
                        <span className="text-xs font-medium">Trade</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="holdings"
                        className="data-[state=active]:bg-background flex flex-col items-center gap-1.5 rounded-lg px-4 py-3 data-[state=active]:shadow-sm"
                      >
                        <Icons.Wallet className="h-5 w-5" />
                        <span className="text-xs font-medium">Holdings</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="cash"
                        className="data-[state=active]:bg-background flex flex-col items-center gap-1.5 rounded-lg px-4 py-3 data-[state=active]:shadow-sm"
                      >
                        <Icons.DollarSign className="h-5 w-5" />
                        <span className="text-xs font-medium">Cash</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="income"
                        className="data-[state=active]:bg-background flex flex-col items-center gap-1.5 rounded-lg px-4 py-3 data-[state=active]:shadow-sm"
                      >
                        <Icons.Income className="h-5 w-5" />
                        <span className="text-xs font-medium">Income</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="other"
                        className="data-[state=active]:bg-background flex flex-col items-center gap-1.5 rounded-lg px-4 py-3 data-[state=active]:shadow-sm"
                      >
                        <Icons.FileText className="h-5 w-5" />
                        <span className="text-xs font-medium">Other</span>
                      </TabsTrigger>
                    </TabsList>
                  </div>
                )}

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Error indicator */}
                    {Object.keys(form.formState.errors).length > 0 && (
                      <div className="bg-destructive/10 border-destructive/20 flex items-start gap-3 rounded-lg border p-4">
                        <Icons.AlertCircle className="text-destructive mt-0.5 h-5 w-5 flex-shrink-0" />
                        <div className="space-y-1">
                          <h4 className="font-semibold">Please Review Your Entry</h4>
                          <ul className="text-muted-foreground list-disc space-y-1 pl-4 text-sm">
                            {Object.entries(form.formState.errors).map(([field, error]) => (
                              <li key={field}>
                                <span className="font-medium">
                                  {field === "activityType" ? "Transaction Type" : field}
                                </span>
                                {": "}
                                {error?.message?.toString() ?? "Invalid value"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    <TabsContent value="trade" className="mt-0">
                      <TradeForm accounts={accountOptions} />
                    </TabsContent>
                    <TabsContent value="holdings" className="mt-0">
                      <HoldingsForm accounts={accountOptions} />
                    </TabsContent>
                    <TabsContent value="cash" className="mt-0">
                      <CashForm accounts={accountOptions} />
                    </TabsContent>
                    <TabsContent value="income" className="mt-0">
                      <IncomeForm accounts={accountOptions} />
                    </TabsContent>
                    <TabsContent value="other" className="mt-0">
                      <OtherForm accounts={accountOptions} />
                    </TabsContent>

                    {/* Action Footer */}
                    <div className="border-border flex items-center justify-between border-t pt-6">
                      <p className="text-muted-foreground text-sm">
                        {initialActivity?.id
                          ? "Update your transaction details"
                          : "All fields are required unless marked as optional"}
                      </p>
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleClose}
                          disabled={isLoading}
                          size="lg"
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading} size="lg">
                          {isLoading ? (
                            <>
                              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : initialActivity?.id ? (
                            <>
                              <Icons.Check className="mr-2 h-4 w-4" />
                              Update Transaction
                            </>
                          ) : (
                            <>
                              <Icons.Plus className="mr-2 h-4 w-4" />
                              Add Transaction
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </form>
                </Form>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </Page>
  );
};

export default ActivityManagerPage;
