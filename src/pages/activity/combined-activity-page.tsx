import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Icons,
  Page,
  PageContent,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
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

type ActivityTab = "assets" | "cash";

export default function CombinedActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as ActivityTab | null;
  const currentTab: ActivityTab = tabFromUrl === "cash" ? "cash" : "assets";

  const [assetsActions, setAssetsActions] = useState<React.ReactNode>(null);
  const [cashActions, setCashActions] = useState<React.ReactNode>(null);

  const handleAssetsActions = useCallback((actions: React.ReactNode) => {
    setAssetsActions(actions);
  }, []);

  const handleCashActions = useCallback((actions: React.ReactNode) => {
    setCashActions(actions);
  }, []);

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams],
  );

  // Get actions for current tab
  const currentActions = useMemo(() => {
    return currentTab === "assets" ? assetsActions : cashActions;
  }, [currentTab, assetsActions, cashActions]);

  return (
    <Page>
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <PageHeader actions={currentActions}>
          <TabsList>
            <TabsTrigger value="assets">
              <Icons.Activity className="mr-2 size-4" />
              Asset Accounts
            </TabsTrigger>
            <TabsTrigger value="cash">
              <Icons.Wallet className="mr-2 size-4" />
              Cash Accounts
            </TabsTrigger>
          </TabsList>
        </PageHeader>
        <PageContent withPadding={false}>
          <TabsContent value="assets" className="mt-0">
            <Suspense fallback={<ActivityLoader />}>
              <ActivityPage renderActions={handleAssetsActions} />
            </Suspense>
          </TabsContent>
          <TabsContent value="cash" className="mt-0">
            <Suspense fallback={<ActivityLoader />}>
              <CashActivitiesPage renderActions={handleCashActions} />
            </Suspense>
          </TabsContent>
        </PageContent>
      </Tabs>
    </Page>
  );
}
