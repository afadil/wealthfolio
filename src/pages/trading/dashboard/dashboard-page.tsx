import { AdaptiveCalendarView } from "../components/adaptive-calendar-view";
import { DistributionCharts } from "../components/distribution-charts";
import { EquityCurveChart } from "../components/equity-curve-chart";
import { OpenTradesTable } from "@/components/open-trades-table";
import { PeriodSelector, getChartPeriodDisplay } from "../components/period-selector";
import { SettingsSheet } from "../components/settings-sheet";
import { useSwingDashboard } from "../hooks/use-swing-dashboard";
import { useSwingPreferences } from "../hooks/use-swing-preferences";
import { KPISummaryCards } from "../components/kpi-summary-cards";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icons,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
} from "@wealthvn/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const { t } = useTranslation("trading");
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<"1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL">(
    "YTD",
  );
  const [selectedYear, setSelectedYear] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: dashboardData, isLoading, error, refetch } = useSwingDashboard(selectedPeriod);
  const { preferences } = useSwingPreferences();

  console.log('[DashboardPage] Dashboard data:', dashboardData);
  console.log('[DashboardPage] Preferences:', preferences);
  console.log('[DashboardPage] Selected activity IDs:', preferences.selectedActivityIds);

  const handleNavigateToActivities = () => {
    navigate("/trading/activities");
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !dashboardData) {
    return (
      <Page>
        <PageHeader heading={t("dashboard.heading")} />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <div className="px-4 text-center">
              <Icons.AlertCircle className="text-muted-foreground mx-auto mb-4 h-10 w-10 sm:h-12 sm:w-12" />
              <h3 className="mb-2 text-base font-semibold sm:text-lg">
                {t("dashboard.error.heading")}
              </h3>
              <p className="text-muted-foreground mb-4 text-sm sm:text-base">
                {error?.message || t("dashboard.error.message")}
              </p>
              <Button onClick={() => refetch()}>{t("dashboard.tryAgain")}</Button>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  const { metrics, openPositions = [], periodPL = [], distribution, calendar = [] } = dashboardData;

  const hasSelectedActivities =
    preferences.selectedActivityIds.length > 0 || preferences.includeSwingTag;
  if (!hasSelectedActivities) {
    return (
      <Page>
        <PageHeader heading={t("dashboard.heading")} />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <div className="px-4 text-center">
              <Icons.BarChart className="text-muted-foreground mx-auto mb-4 h-10 w-10 sm:h-12 sm:w-12" />
              <h3 className="mb-2 text-base font-semibold sm:text-lg">
                {t("dashboard.emptyState.heading")}
              </h3>
              <p className="text-muted-foreground mb-4 text-sm sm:text-base">
                {t("dashboard.emptyState.message")}
              </p>
              <Button onClick={handleNavigateToActivities} className="mx-auto">
                <Icons.Plus className="mr-2 h-4 w-4" />
                {t("dashboard.emptyState.button")}
              </Button>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  // Transform PeriodPL data to EquityPoint format for chart
  const chartEquityData = periodPL.map((period, index) => {
    // Calculate cumulative P/L up to this period
    const cumulativeRealizedPL = periodPL
      .slice(0, index + 1)
      .reduce((sum, p) => sum + p.realizedPL, 0);

    return {
      date: period.date,
      cumulativeRealizedPL,
      cumulativeTotalPL: cumulativeRealizedPL, // For now, same as realized
      currency: period.currency,
    };
  });

  const headerActions = (
    <>
      <PeriodSelector selectedPeriod={selectedPeriod} onPeriodSelect={setSelectedPeriod} t={t} />
      <Button
        variant="outline"
        className="hidden rounded-full sm:inline-flex"
        onClick={handleNavigateToActivities}
      >
        <Icons.ListChecks className="mr-2 h-4 w-4" />
        <span>{t("dashboard.selectActivities")}</span>
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={handleNavigateToActivities}
        className="sm:hidden"
        aria-label="Select activities"
      >
        <Icons.ListChecks className="h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={() => setSettingsOpen(true)}
        className="rounded-full"
      >
        <Icons.Settings className="size-4" />
      </Button>
    </>
  );

  return (
    <Page>
      <PageHeader heading={t("dashboard.heading")} actions={headerActions} />

      <PageContent>
        <div className="space-y-4 sm:space-y-6">
          <KPISummaryCards metrics={metrics} t={t} />

          {/* Charts Row - Equity Curve and Calendar */}
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
            {/* Equity Curve */}
            <Card className="flex flex-col">
              <CardHeader className="shrink-0 pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">
                      {t("dashboard.charts.equityCurve.title", {
                        period: getChartPeriodDisplay(selectedPeriod, t).type,
                      })}
                    </CardTitle>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      {getChartPeriodDisplay(selectedPeriod, t).description}
                    </p>
                  </div>
                  <div className="bg-secondary text-muted-foreground self-start rounded-full px-2 py-1 text-xs whitespace-nowrap sm:self-auto">
                    {t("dashboard.charts.equityCurve.periodDisplay", {
                      selectedPeriod: selectedPeriod,
                      periodType: getChartPeriodDisplay(selectedPeriod, t).type,
                    })}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col py-4 sm:py-6">
                <EquityCurveChart
                  data={chartEquityData}
                  currency={metrics.currency}
                  periodType={
                    selectedPeriod === "1M"
                      ? "daily"
                      : selectedPeriod === "3M"
                        ? "weekly"
                        : "monthly"
                  }
                />
              </CardContent>
            </Card>
            <Card className="flex flex-col pt-0">
              <CardContent className="flex min-h-0 flex-1 flex-col py-4 sm:py-6">
                <AdaptiveCalendarView
                  calendar={calendar}
                  selectedPeriod={selectedPeriod}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                  currency={metrics.currency}
                />
              </CardContent>
            </Card>
          </div>

          {/* Open Positions - Full Width on Mobile */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base sm:text-lg">
                {t("dashboard.openPositions.title")}
              </CardTitle>
              <span className="text-muted-foreground text-sm">
                {openPositions.length}{" "}
                {openPositions.length === 1
                  ? t("dashboard.openPositions.position")
                  : t("dashboard.openPositions.positions")}
              </span>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <OpenTradesTable positions={openPositions} />
            </CardContent>
          </Card>

          {/* Distribution Charts */}
          <DistributionCharts distribution={distribution} currency={metrics.currency} />
        </div>
      </PageContent>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Page>
  );
}

function DashboardSkeleton() {
  return (
    <Page>
      <PageHeader
        heading="Trading Dashboard"
        text="Track your trading performance and analytics"
        actions={
          <>
            <Skeleton className="h-9 w-[280px]" />
            <Skeleton className="h-9 w-[100px] sm:w-[140px]" />
            <Skeleton className="h-9 w-9" />
          </>
        }
      />

      <PageContent>
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, index) => (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-[100px] sm:w-[120px]" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-6 w-[120px] sm:h-8 sm:w-[150px]" />
                  <Skeleton className="mt-2 h-3 w-[80px] sm:h-4 sm:w-[100px]" />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-[120px] sm:h-6 sm:w-[150px]" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[250px] w-full sm:h-[300px]" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-[150px] sm:h-6 sm:w-[180px]" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3 sm:space-y-4">
                  {[...Array(5)].map((_, index) => (
                    <div key={index} className="flex justify-between">
                      <Skeleton className="h-3 w-[80px] sm:h-4 sm:w-[100px]" />
                      <Skeleton className="h-3 w-[60px] sm:h-4 sm:w-[80px]" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContent>
    </Page>
  );
}
