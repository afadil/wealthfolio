import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons, Page, PageContent, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui";
import React, { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MonthAnalysisPage from "./month-analysis-page";

const ReportsLoader = () => (
  <div className="flex h-full w-full flex-col space-y-4 p-4">
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  </div>
);

type ReportsTab = "month";

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") as ReportsTab | null;
  const currentTab: ReportsTab = tabFromUrl === "month" ? "month" : "month";

  const [monthActions, setMonthActions] = useState<React.ReactNode>(null);

  const handleMonthActions = useCallback((actions: React.ReactNode) => {
    setMonthActions(actions);
  }, []);

  const handleTabChange = useCallback(
    (value: string) => {
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams],
  );

  const currentActions = useMemo(() => {
    switch (currentTab) {
      case "month":
        return monthActions;
      default:
        return monthActions;
    }
  }, [currentTab, monthActions]);

  return (
    <Page>
      <Tabs value={currentTab} onValueChange={handleTabChange}>
        <PageHeader actions={currentActions}>
          <TabsList>
            <TabsTrigger value="month">
              <Icons.Calendar className="mr-2 size-4" />
              Monthly Analysis
            </TabsTrigger>
          </TabsList>
        </PageHeader>
        <PageContent withPadding={false}>
          <TabsContent value="month" className="mt-0">
            <Suspense fallback={<ReportsLoader />}>
              <MonthAnalysisPage renderActions={handleMonthActions} />
            </Suspense>
          </TabsContent>
        </PageContent>
      </Tabs>
    </Page>
  );
}
