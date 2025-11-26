import type { AddonContext } from "@wealthfolio/addon-sdk";
import {
  Card,
  CardContent,
  CardHeader,
  EmptyPlaceholder,
  Icons,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
  useBalancePrivacy,
} from "@wealthfolio/ui";
import React, { useState } from "react";
import {
  AccountBreakdown,
  FeeHistoryChart,
  FeeOverviewCards,
  FeePeriodSelector,
} from "../components";
import { useFeeAnalytics, useFeeSummary } from "../hooks";

interface FeesPageProps {
  ctx: AddonContext;
}

export default function FeesPage({ ctx }: FeesPageProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"TOTAL" | "YTD" | "LAST_YEAR">("YTD");

  const { data: feeData, isLoading: isLoadingFees, error: feeError } = useFeeSummary({ ctx });

  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    error: analyticsError,
  } = useFeeAnalytics({ ctx, period: selectedPeriod });

  const { isBalanceHidden } = useBalancePrivacy();

  const headerActions = (
    <FeePeriodSelector selectedPeriod={selectedPeriod} onPeriodSelect={setSelectedPeriod} />
  );

  if (isLoadingFees || isLoadingAnalytics) {
    return <FeesDashboardSkeleton actions={headerActions} />;
  }

  if (feeError) {
    ctx.api.logger.error("Fee data error: " + feeError.message);
  }
  if (analyticsError) {
    ctx.api.logger.error("Analytics data error: " + analyticsError.message);
  }

  if (feeError || analyticsError || !feeData || !analyticsData) {
    const errorMessage =
      feeError?.message || analyticsError?.message || "Unable to load fee information.";

    return (
      <Page>
        <PageHeader heading="Fees Tracker" actions={headerActions} />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <EmptyPlaceholder
              className="border-border/50 w-full max-w-[420px] border border-dashed"
              icon={<Icons.CreditCard className="h-10 w-10" />}
              title="Failed to load fee data"
              description={errorMessage}
            />
          </div>
        </PageContent>
      </Page>
    );
  }

  const periodSummary = feeData.find((summary) => summary.period === selectedPeriod);
  const totalSummary = feeData.find((summary) => summary.period === "TOTAL");

  if (!periodSummary || !totalSummary) {
    return (
      <Page>
        <PageHeader heading="Fees Tracker" actions={headerActions} />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <EmptyPlaceholder
              className="border-border/50 w-full max-w-[420px] border border-dashed"
              icon={<Icons.CreditCard className="h-10 w-10" />}
              title="No fee data available"
              description="There is no fee data for the selected period. Try selecting a different time range or check back later."
            />
          </div>
        </PageContent>
      </Page>
    );
  }

  // Prepare monthly fee data for chart
  const monthlyFeeData: [string, number][] = Object.entries(periodSummary.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(selectedPeriod === "TOTAL" ? -12 : 0) // Show last 12 months for TOTAL
    .map(([month, fees]) => [month, Number(fees) || 0]);

  // Get previous period data for comparison
  const getPreviousPeriodData = (currentMonth: string): number => {
    const [year, month] = currentMonth.split("-");
    const previousYear = parseInt(year) - 1;

    if (selectedPeriod === "YTD") {
      return totalSummary.byMonth[`${previousYear}-${month}`] || 0;
    } else if (selectedPeriod === "LAST_YEAR") {
      // For last year, compare with two years ago
      const twoYearsAgo = previousYear - 1;
      return totalSummary.byMonth[`${twoYearsAgo}-${month}`] || 0;
    }

    // For TOTAL, compare with previous year's same month
    return totalSummary.byMonth[`${previousYear}-${month}`] || 0;
  };

  const previousMonthlyFeeData: [string, number][] = monthlyFeeData.map(([month]) => [
    month,
    getPreviousPeriodData(month),
  ]);

  return (
    <Page>
      <PageHeader heading="Fees Tracker" actions={headerActions} />
      <PageContent>
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 xl:grid-cols-3">
          <FeeOverviewCards
            feeSummary={periodSummary}
            feeAnalytics={analyticsData}
            isBalanceHidden={isBalanceHidden}
          />
        </div>
        <div className="grid auto-rows-min gap-4 sm:gap-6 items-stretch md:grid-cols-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="md:col-span-2 lg:col-auto">
            <FeeHistoryChart
              monthlyFeeData={monthlyFeeData}
              previousMonthlyFeeData={previousMonthlyFeeData}
              selectedPeriod={selectedPeriod}
              currency={periodSummary.currency}
              isBalanceHidden={isBalanceHidden}
            />
          </div>

          <div className="md:col-span-1 lg:col-auto">
            <AccountBreakdown
              feeAnalytics={analyticsData}
              currency={periodSummary.currency}
              isBalanceHidden={isBalanceHidden}
            />
          </div>
        </div>
      </PageContent>
    </Page>
  );
}

function FeesDashboardSkeleton({ actions }: { actions: React.ReactNode }) {
  return (
    <Page>
      <PageHeader heading="Fees Tracker" actions={actions} />

      <PageContent>
        <div className="grid gap-6 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[150px]" />
                <Skeleton className="mt-2 h-4 w-[100px]" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-[200px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-4 w-[80px]" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </Page>
  );
}
