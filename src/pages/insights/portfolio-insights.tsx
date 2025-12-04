import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons, Page, PageContent, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
import { Suspense, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import HoldingsInsightsPage from "../holdings/holdings-insights-page";
import PerformancePage from "@/pages/performance/performance-page";

const DashboardLoader = () => (
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
      <span className="text-muted-foreground text-sm">Loading dashboard...</span>
    </div>
  </div>
);

type InsightsTab = "holdings" | "performance";

export default function PortfolioInsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as InsightsTab | null;
  const currentTab: InsightsTab = tabFromUrl === "performance" ? "performance" : "holdings";

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams],
  );

  return (
    <Page>
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <PageHeader>
          <TabsList>
            <TabsTrigger value="holdings">
              <Icons.PieChart className="mr-2 size-4" />
              Holdings
            </TabsTrigger>
            <TabsTrigger value="performance">
              <Icons.TrendingUp className="mr-2 size-4" />
              Performance
            </TabsTrigger>
          </TabsList>
        </PageHeader>
        <PageContent withPadding={false}>
          <TabsContent value="holdings" className="mt-0">
            <Suspense fallback={<DashboardLoader />}>
              <div className="px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
                <HoldingsInsightsPage />
              </div>
            </Suspense>
          </TabsContent>
          <TabsContent value="performance" className="mt-0">
            <Suspense fallback={<DashboardLoader />}>
              <div className="px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
                <PerformancePage />
              </div>
            </Suspense>
          </TabsContent>
        </PageContent>
      </Tabs>
    </Page>
  );
}
