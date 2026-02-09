import type { AddonContext } from "@wealthfolio/addon-sdk";
import {
  AnimatedToggleGroup,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GainAmount,
  GainPercent,
  Icons,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
} from "@wealthfolio/ui";
import { useState } from "react";
import { AdaptiveCalendarView } from "../components/adaptive-calendar-view";
import { DistributionCharts } from "../components/distribution-charts";
import { EquityCurveChart } from "../components/equity-curve-chart";
import { OpenTradesTable } from "../components/open-trades-table";
import { useSwingDashboard } from "../hooks/use-swing-dashboard";
import { useSwingPreferences } from "../hooks/use-swing-preferences";

const periods = [
  { value: "1M" as const, label: "1M" },
  { value: "3M" as const, label: "3M" },
  { value: "6M" as const, label: "6M" },
  { value: "YTD" as const, label: "YTD" },
  { value: "1Y" as const, label: "1Y" },
  { value: "ALL" as const, label: "ALL" },
];

// Chart period type is now automatically determined based on selected period
const getChartPeriodDisplay = (period: "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL") => {
  switch (period) {
    case "1M":
      return {
        type: "Daily",
        description: "Daily P/L and cumulative equity performance",
      };
    case "3M":
      return {
        type: "Weekly",
        description: "Weekly P/L and cumulative equity performance",
      };
    default:
      return {
        type: "Monthly",
        description: "Monthly P/L and cumulative equity performance",
      };
  }
};

const PeriodSelector: React.FC<{
  selectedPeriod: "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
  onPeriodSelect: (period: "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL") => void;
}> = ({ selectedPeriod, onPeriodSelect }) => (
  <AnimatedToggleGroup
    items={periods}
    value={selectedPeriod}
    onValueChange={onPeriodSelect}
    variant="secondary"
    size="sm"
  />
);

interface DashboardPageProps {
  ctx: AddonContext;
}

export default function DashboardPage({ ctx }: DashboardPageProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<"1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL">(
    "YTD",
  );
  const [selectedYear, setSelectedYear] = useState(new Date());

  const { data: dashboardData, isLoading, error, refetch } = useSwingDashboard(ctx, selectedPeriod);
  const { preferences } = useSwingPreferences(ctx);

  const handleNavigateToActivities = () => {
    ctx.api.navigation.navigate("/addons/swingfolio/activities");
  };

  const handleNavigateToSettings = () => {
    ctx.api.navigation.navigate("/addons/swingfolio/settings");
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !dashboardData) {
    return (
      <Page>
        <PageHeader heading="Trading Dashboard" />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <div className="px-4 text-center">
              <Icons.AlertCircle className="text-muted-foreground mx-auto mb-4 h-10 w-10 sm:h-12 sm:w-12" />
              <h3 className="mb-2 text-base font-semibold sm:text-lg">Failed to load dashboard</h3>
              <p className="text-muted-foreground mb-4 text-sm sm:text-base">
                {error?.message || "Unable to load swing trading data"}
              </p>
              <Button onClick={() => refetch()}>Try Again</Button>
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
        <PageHeader heading="Trading Dashboard" />
        <PageContent>
          <div className="flex h-[calc(100vh-200px)] items-center justify-center">
            <div className="px-4 text-center">
              <Icons.BarChart className="text-muted-foreground mx-auto mb-4 h-10 w-10 sm:h-12 sm:w-12" />
              <h3 className="mb-2 text-base font-semibold sm:text-lg">
                No Swing Trading Activities Selected
              </h3>
              <p className="text-muted-foreground mb-4 text-sm sm:text-base">
                Select BUY and SELL activities to start tracking your swing trading performance
              </p>
              <Button onClick={handleNavigateToActivities} className="mx-auto">
                <Icons.Plus className="mr-2 h-4 w-4" />
                Select Activities
              </Button>
            </div>
          </div>
        </PageContent>
      </Page>
    );
  }

  // Transform PeriodPL data to EquityPoint format for the chart
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
      <PeriodSelector selectedPeriod={selectedPeriod} onPeriodSelect={setSelectedPeriod} />
      <Button
        variant="outline"
        className="hidden rounded-full sm:inline-flex"
        onClick={handleNavigateToActivities}
      >
        <Icons.ListChecks className="mr-2 h-4 w-4" />
        <span>Select Activities</span>
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
        onClick={handleNavigateToSettings}
        className="rounded-full"
      >
        <Icons.Settings className="size-4" />
      </Button>
    </>
  );

  return (
    <Page>
      <PageHeader heading="Trading Dashboard" actions={headerActions} />

      <PageContent>
        <div className="space-y-4 sm:space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            {/* Widget 1: Overall P/L Summary - Clean Design */}

            <Card
              className={`${metrics.totalPL >= 0 ? "border-success/10 bg-success/10" : "border-destructive/10 bg-destructive/10"}`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pb-3">
                <CardTitle className="text-sm font-medium">P/L</CardTitle>
                <GainAmount
                  className="text-xl font-bold sm:text-2xl"
                  value={metrics.totalPL}
                  currency={metrics.currency}
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Details Below - Labels Left, Amounts Right */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">
                      Realized ({metrics.totalTrades} trades)
                    </span>
                    <div className="flex items-center gap-2">
                      <GainAmount
                        value={metrics.totalRealizedPL}
                        currency={metrics.currency}
                        className="font-medium"
                        displayDecimal={false}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">
                      Unrealized ({metrics.openPositions} open)
                    </span>
                    <div className="flex items-center gap-2">
                      <GainAmount
                        value={metrics.totalUnrealizedPL}
                        currency={metrics.currency}
                        className="font-medium"
                        displayDecimal={false}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Widget 2: Core Performance */}
            <Card className="border-blue-500/10 bg-blue-500/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Core Performance</CardTitle>
                <Icons.CheckCircle className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Win Rate</span>
                    <GainPercent
                      value={metrics.winRate}
                      className="text-sm font-semibold"
                      showSign={false}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Avg Win</span>
                    <GainAmount
                      value={metrics.averageWin}
                      currency={metrics.currency}
                      className="text-sm font-semibold"
                      displayDecimal={false}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Avg Loss</span>
                    <GainAmount
                      value={-metrics.averageLoss}
                      currency={metrics.currency}
                      className="text-sm font-semibold"
                      displayDecimal={false}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Total Trades</span>
                    <span className="text-sm font-semibold">{metrics.totalTrades}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Widget 3: Analytics & Ratios */}
            <Card className="border-purple-500/10 bg-purple-500/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Analytics & Ratios</CardTitle>
                <Icons.BarChart className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Expectancy</span>
                    <GainAmount
                      value={metrics.expectancy}
                      currency={metrics.currency}
                      className="text-sm font-semibold"
                      displayDecimal={false}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Profit Factor</span>
                    <span className="text-sm font-semibold">
                      {metrics.profitFactor === Number.POSITIVE_INFINITY
                        ? "∞"
                        : metrics.profitFactor.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">Avg Hold Time</span>
                    <span className="text-sm font-semibold">
                      {metrics.averageHoldingDays.toFixed(1)} days
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row - Equity Curve and Calendar */}
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
            {/* Equity Curve */}
            <Card className="flex flex-col">
              <CardHeader className="shrink-0 pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base sm:text-lg">
                      {getChartPeriodDisplay(selectedPeriod).type} Equity Curve
                    </CardTitle>
                    <p className="text-muted-foreground text-xs sm:text-sm">
                      {getChartPeriodDisplay(selectedPeriod).description}
                    </p>
                  </div>
                  <div className="bg-secondary text-muted-foreground self-start rounded-full px-2 py-1 text-xs whitespace-nowrap sm:self-auto">
                    {selectedPeriod} → {getChartPeriodDisplay(selectedPeriod).type}
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
              <CardTitle className="text-base sm:text-lg">Open Positions</CardTitle>
              <span className="text-muted-foreground text-sm">
                {openPositions.length} {openPositions.length === 1 ? "position" : "positions"}
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
