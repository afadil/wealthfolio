import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons, Page, PageContent, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ActivityPage from "./activity-page";
import CashActivitiesPage from "@/pages/cash/activities/cash-activities-page";

const ActivityLoader = () => (
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
      <span className="text-muted-foreground text-sm">Loading activities...</span>
    </div>
  </div>
);

type ActivityTab = "trades" | "transactions";

export default function CombinedActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as ActivityTab | null;
  const currentTab: ActivityTab = tabFromUrl === "transactions" ? "transactions" : "trades";

  const [tradesActions, setTradesActions] = useState<React.ReactNode>(null);
  const [transactionsActions, setTransactionsActions] = useState<React.ReactNode>(null);

  const handleTradesActions = useCallback((actions: React.ReactNode) => {
    setTradesActions(actions);
  }, []);

  const handleTransactionsActions = useCallback((actions: React.ReactNode) => {
    setTransactionsActions(actions);
  }, []);

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams],
  );

  // Get actions for current tab
  const currentActions = useMemo(() => {
    return currentTab === "trades" ? tradesActions : transactionsActions;
  }, [currentTab, tradesActions, transactionsActions]);

  return (
    <Page>
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <PageHeader actions={currentActions}>
          <TabsList>
            <TabsTrigger value="trades">
              <Icons.Activity className="mr-2 size-4" />
              Trades
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <Icons.Wallet className="mr-2 size-4" />
              Transactions
            </TabsTrigger>
          </TabsList>
        </PageHeader>
        <PageContent withPadding={false}>
          <TabsContent value="trades" className="mt-0">
            <Suspense fallback={<ActivityLoader />}>
              <ActivityPage renderActions={handleTradesActions} />
            </Suspense>
          </TabsContent>
          <TabsContent value="transactions" className="mt-0">
            <Suspense fallback={<ActivityLoader />}>
              <CashActivitiesPage renderActions={handleTransactionsActions} />
            </Suspense>
          </TabsContent>
        </PageContent>
      </Tabs>
    </Page>
  );
}
