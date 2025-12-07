import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons, Page, PageContent, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SpendingPage from "@/pages/spending/spending-page";
import IncomePage from "@/pages/income/income-page";
import EventsPage from "@/pages/events/events-page";

const CashflowLoader = () => (
  <div className="flex h-full w-full flex-col space-y-4 p-4">
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
    <div className="flex items-center justify-center py-8">
      <span className="text-muted-foreground text-sm">Loading cashflow data...</span>
    </div>
  </div>
);

type CashflowTab = "spending" | "income" | "events";

export default function CashflowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as CashflowTab | null;
  const currentTab: CashflowTab = tabFromUrl === "income" ? "income" : tabFromUrl === "events" ? "events" : "spending";

  // State to capture actions from child pages
  const [spendingActions, setSpendingActions] = useState<React.ReactNode>(null);
  const [incomeActions, setIncomeActions] = useState<React.ReactNode>(null);
  const [eventsActions, setEventsActions] = useState<React.ReactNode>(null);

  // Callbacks to capture actions from child pages
  const handleSpendingActions = useCallback((actions: React.ReactNode) => {
    setSpendingActions(actions);
  }, []);

  const handleIncomeActions = useCallback((actions: React.ReactNode) => {
    setIncomeActions(actions);
  }, []);

  const handleEventsActions = useCallback((actions: React.ReactNode) => {
    setEventsActions(actions);
  }, []);

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams],
  );

  // Get actions for current tab
  const currentActions = useMemo(() => {
    switch (currentTab) {
      case "spending":
        return spendingActions;
      case "income":
        return incomeActions;
      case "events":
        return eventsActions;
      default:
        return spendingActions;
    }
  }, [currentTab, spendingActions, incomeActions, eventsActions]);

  return (
    <Page>
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <PageHeader actions={currentActions}>
          <TabsList>
            <TabsTrigger value="spending">
              <Icons.CreditCard className="mr-2 size-4" />
              Spending
            </TabsTrigger>
            <TabsTrigger value="income">
              <Icons.Income className="mr-2 size-4" />
              Income
            </TabsTrigger>
            <TabsTrigger value="events">
              <Icons.Calendar className="mr-2 size-4" />
              Events
            </TabsTrigger>
          </TabsList>
        </PageHeader>
        <PageContent withPadding={false}>
          <TabsContent value="spending" className="mt-0">
            <Suspense fallback={<CashflowLoader />}>
              <SpendingPage renderActions={handleSpendingActions} />
            </Suspense>
          </TabsContent>
          <TabsContent value="income" className="mt-0">
            <Suspense fallback={<CashflowLoader />}>
              <IncomePage renderActions={handleIncomeActions} />
            </Suspense>
          </TabsContent>
          <TabsContent value="events" className="mt-0">
            <Suspense fallback={<CashflowLoader />}>
              <EventsPage renderActions={handleEventsActions} />
            </Suspense>
          </TabsContent>
        </PageContent>
      </Tabs>
    </Page>
  );
}
