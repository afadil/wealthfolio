import { useState } from 'react';
import {
  ApplicationShell,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GainAmount,
  GainPercent,
  Button,
  Skeleton,
  Icons,
} from '@wealthfolio/ui';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { useSwingDashboard } from '../hooks/use-swing-dashboard';
import { useSwingPreferences } from '../hooks/use-swing-preferences';
import { useSwingPreferences } from '../hooks/use-swing-preferences';
import { EquityCurveChart } from '../components/equity-curve-chart';
import { OpenTradesTable } from '../components/open-trades-table';
import { DistributionCharts } from '../components/distribution-charts';
import { AdaptiveCalendarView } from '../components/adaptive-calendar-view';

const periods: { code: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'; label: string }[] = [
  { code: '1M', label: '1M' },
  { code: '3M', label: '3M' },
  { code: '6M', label: '6M' },
  { code: 'YTD', label: 'YTD' },
  { code: '1Y', label: '1Y' },
  { code: 'ALL', label: 'ALL' },
];

// Chart period type is now automatically determined based on selected period
const getChartPeriodDisplay = (period: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL') => {
  switch (period) {
    case '1M':
      return { type: 'Daily', description: 'Daily P/L and cumulative equity performance' };
    case '3M':
      return { type: 'Weekly', description: 'Weekly P/L and cumulative equity performance' };
    default:
      return { type: 'Monthly', description: 'Monthly P/L and cumulative equity performance' };
  }
};

const PeriodSelector: React.FC<{
  selectedPeriod: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
  onPeriodSelect: (period: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL') => void;
}> = ({ selectedPeriod, onPeriodSelect }) => (
  <div className="flex justify-center sm:justify-end">
    <div className="flex space-x-0.5 sm:space-x-1 rounded-full bg-secondary p-1 w-full sm:w-auto overflow-x-auto">
  <div className="flex justify-center sm:justify-end">
    <div className="flex space-x-0.5 sm:space-x-1 rounded-full bg-secondary p-1 w-full sm:w-auto overflow-x-auto">
      {periods.map(({ code, label }) => (
        <Button
          key={code}
          size="sm"
          className="h-7 sm:h-8 rounded-full px-2 sm:px-3 text-xs whitespace-nowrap flex-shrink-0"
          className="h-7 sm:h-8 rounded-full px-2 sm:px-3 text-xs whitespace-nowrap flex-shrink-0"
          variant={selectedPeriod === code ? 'default' : 'ghost'}
          onClick={() => onPeriodSelect(code)}
        >
          {label}
        </Button>
      ))}
    </div>
  </div>
);

interface DashboardPageProps {
  ctx: AddonContext;
}

export default function DashboardPage({ ctx }: DashboardPageProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'>(
    'YTD',
  );
  const [selectedYear, setSelectedYear] = useState(new Date());

  const { data: dashboardData, isLoading, error, refetch } = useSwingDashboard(ctx, selectedPeriod);
  const { preferences } = useSwingPreferences(ctx);
  const { preferences } = useSwingPreferences(ctx);

  const handleNavigateToActivities = () => {
    ctx.api.navigation.navigate('/addons/swingfolio/activities');
  };

  const handleNavigateToSettings = () => {
    ctx.api.navigation.navigate('/addons/swingfolio/settings');
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !dashboardData) {
    return (
      <ApplicationShell className="p-3 sm:p-6">
      <ApplicationShell className="p-3 sm:p-6">
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center px-4">
            <Icons.AlertCircle className="mx-auto mb-4 h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground" />
            <h3 className="mb-2 text-base sm:text-lg font-semibold">Failed to load dashboard</h3>
            <p className="mb-4 text-sm sm:text-base text-muted-foreground">
          <div className="text-center px-4">
            <Icons.AlertCircle className="mx-auto mb-4 h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground" />
            <h3 className="mb-2 text-base sm:text-lg font-semibold">Failed to load dashboard</h3>
            <p className="mb-4 text-sm sm:text-base text-muted-foreground">
              {error?.message || 'Unable to load swing trading data'}
            </p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </div>
        </div>
      </ApplicationShell>
    );
  }

  const { metrics, openPositions, periodPL, distribution, calendar } = dashboardData;

  // Check if no activities are selected at all (not period-specific)
  const hasSelectedActivities = preferences.selectedActivityIds.length > 0 || preferences.includeSwingTag;
  if (!hasSelectedActivities) {
  // Check if no activities are selected at all (not period-specific)
  const hasSelectedActivities = preferences.selectedActivityIds.length > 0 || preferences.includeSwingTag;
  if (!hasSelectedActivities) {
    return (
      <ApplicationShell className="p-3 sm:p-6">
      <ApplicationShell className="p-3 sm:p-6">
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center px-4">
            <Icons.BarChart className="mx-auto mb-4 h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground" />
            <h3 className="mb-2 text-base sm:text-lg font-semibold">No Swing Trading Activities Selected</h3>
            <p className="mb-4 text-sm sm:text-base text-muted-foreground">
          <div className="text-center px-4">
            <Icons.BarChart className="mx-auto mb-4 h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground" />
            <h3 className="mb-2 text-base sm:text-lg font-semibold">No Swing Trading Activities Selected</h3>
            <p className="mb-4 text-sm sm:text-base text-muted-foreground">
              Select BUY and SELL activities to start tracking your swing trading performance
            </p>
            <Button onClick={handleNavigateToActivities} className="mx-auto">
              <Icons.Plus className="mr-2 h-4 w-4" />
              Select Activities
            </Button>
          </div>
        </div>
      </ApplicationShell>
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

  return (
    <ApplicationShell className="p-3 sm:p-6">
      {/* Header - Responsive */}
      <div className="flex flex-col space-y-4 pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:pb-6">
    <ApplicationShell className="p-3 sm:p-6">
      {/* Header - Responsive */}
      <div className="flex flex-col space-y-4 pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Trading Dashboard</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Track your trading performance and analytics
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Trading Dashboard</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Track your trading performance and analytics
          </p>
        </div>
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:gap-2 sm:space-y-0">
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:gap-2 sm:space-y-0">
          <PeriodSelector selectedPeriod={selectedPeriod} onPeriodSelect={setSelectedPeriod} />
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleNavigateToActivities}
              className="flex-1 rounded-full sm:flex-none"
            >
              <Icons.ListChecks className="mr-1 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Select Activities</span>
              <span className="sm:hidden">Activities</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNavigateToSettings}
              className="rounded-full"
            >
              <Icons.Settings className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleNavigateToActivities}
              className="flex-1 rounded-full sm:flex-none"
            >
              <Icons.ListChecks className="mr-1 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Select Activities</span>
              <span className="sm:hidden">Activities</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNavigateToSettings}
              className="rounded-full"
            >
              <Icons.Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6">
      <div className="space-y-4 sm:space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
          {/* Widget 1: Overall P/L Summary - Clean Design */}

          <Card className={`${metrics.totalPL >= 0 ? 'border-success/10 bg-success/10' : 'border-destructive/10 bg-destructive/10'}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-4">
              <CardTitle className="text-sm font-medium">P/L</CardTitle>
              <GainAmount
                className="text-xl font-bold sm:text-2xl"
                value={metrics.totalPL}
                currency={metrics.currency}
              />
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
          {/* Widget 1: Overall P/L Summary - Clean Design */}

          <Card className={`${metrics.totalPL >= 0 ? 'border-success/10 bg-success/10' : 'border-destructive/10 bg-destructive/10'}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-4">
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
                  <span className="text-xs text-muted-foreground">
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
                  <span className="text-xs text-muted-foreground">
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
            <CardContent className="space-y-3">
              {/* Details Below - Labels Left, Amounts Right */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-muted-foreground">
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
                  <span className="text-xs text-muted-foreground">
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
          {/* Widget 2: Core Performance */}
          <Card className="border-blue-500/10 bg-blue-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Core Performance</CardTitle>
              <CardTitle className="text-sm font-medium">Core Performance</CardTitle>
              <Icons.CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Win Rate</span>
                  <GainPercent
                    value={metrics.winRate}
                    className="text-sm font-semibold"
                    showSign={false}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Win</span>
                  <GainAmount
                    value={metrics.averageWin}
                    currency={metrics.currency}
                    className="text-sm font-semibold"
                    displayDecimal={false}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Loss</span>
                  <GainAmount
                    value={-metrics.averageLoss}
                    currency={metrics.currency}
                    className="text-sm font-semibold"
                    displayDecimal={false}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total Trades</span>
                  <span className="text-sm font-semibold">{metrics.totalTrades}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Widget 3: Analytics & Ratios */}
          <Card className="border-purple-500/10 bg-purple-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Analytics & Ratios</CardTitle>
              <Icons.BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Expectancy</span>
                  <GainAmount
                    value={metrics.expectancy}
                    currency={metrics.currency}
                    className="text-sm font-semibold"
                    displayDecimal={false}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Profit Factor</span>
                  <span className="text-sm font-semibold">
                    {metrics.profitFactor === Number.POSITIVE_INFINITY
                      ? '∞'
                      : metrics.profitFactor.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Avg Hold Time</span>
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
            <CardHeader className="flex-shrink-0 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Card className="flex flex-col">
            <CardHeader className="flex-shrink-0 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg">
                  <CardTitle className="text-base sm:text-lg">
                    {getChartPeriodDisplay(selectedPeriod).type} Equity Curve
                  </CardTitle>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {getChartPeriodDisplay(selectedPeriod).description}
                  </p>
                </div>
                <div className="self-start whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground sm:self-auto">
                <div className="self-start whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground sm:self-auto">
                  {selectedPeriod} → {getChartPeriodDisplay(selectedPeriod).type}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col py-4 sm:py-6">
            <CardContent className="flex min-h-0 flex-1 flex-col py-4 sm:py-6">
              <EquityCurveChart
                data={chartEquityData}
                currency={metrics.currency}
                periodType={
                  selectedPeriod === '1M' ? 'daily' : selectedPeriod === '3M' ? 'weekly' : 'monthly'
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
            <span className="text-sm text-muted-foreground">
              {openPositions.length} {openPositions.length === 1 ? 'position' : 'positions'}
            </span>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <OpenTradesTable positions={openPositions} />
          </CardContent>
        </Card>

        {/* Open Positions - Full Width on Mobile */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base sm:text-lg">Open Positions</CardTitle>
            <span className="text-sm text-muted-foreground">
              {openPositions.length} {openPositions.length === 1 ? 'position' : 'positions'}
            </span>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <OpenTradesTable positions={openPositions} />
          </CardContent>
        </Card>

        {/* Distribution Charts */}
        <DistributionCharts distribution={distribution} currency={metrics.currency} />
      </div>
    </ApplicationShell>
  );
}

function DashboardSkeleton() {
  return (
    <ApplicationShell className="p-3 sm:p-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-4 sm:pb-6">
    <ApplicationShell className="p-3 sm:p-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-4 sm:pb-6">
        <div>
          <Skeleton className="h-6 sm:h-8 w-[250px] sm:w-[300px]" />
          <Skeleton className="mt-2 h-4 sm:h-5 w-[300px] sm:w-[400px]" />
          <Skeleton className="h-6 sm:h-8 w-[250px] sm:w-[300px]" />
          <Skeleton className="mt-2 h-4 sm:h-5 w-[300px] sm:w-[400px]" />
        </div>
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:gap-2">
          <Skeleton className="h-8 sm:h-10 w-full sm:w-[200px]" />
          <div className="flex gap-2">
            <Skeleton className="h-8 sm:h-10 w-[100px] sm:w-[140px]" />
            <Skeleton className="h-8 sm:h-10 w-8 sm:w-10" />
          </div>
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:gap-2">
          <Skeleton className="h-8 sm:h-10 w-full sm:w-[200px]" />
          <div className="flex gap-2">
            <Skeleton className="h-8 sm:h-10 w-[100px] sm:w-[140px]" />
            <Skeleton className="h-8 sm:h-10 w-8 sm:w-10" />
          </div>
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6">
      <div className="space-y-4 sm:space-y-6">
        {/* KPI Cards Skeleton */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[100px] sm:w-[120px]" />
                <Skeleton className="h-4 w-[100px] sm:w-[120px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-6 sm:h-8 w-[120px] sm:w-[150px]" />
                <Skeleton className="mt-2 h-3 sm:h-4 w-[80px] sm:w-[100px]" />
                <Skeleton className="h-6 sm:h-8 w-[120px] sm:w-[150px]" />
                <Skeleton className="mt-2 h-3 sm:h-4 w-[80px] sm:w-[100px]" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 xl:grid-cols-2">
          <Card>
        <div className="grid gap-4 sm:gap-6 grid-cols-1 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 sm:h-6 w-[120px] sm:w-[150px]" />
              <Skeleton className="h-5 sm:h-6 w-[120px] sm:w-[150px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[250px] sm:h-[300px] w-full" />
              <Skeleton className="h-[250px] sm:h-[300px] w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 sm:h-6 w-[150px] sm:w-[180px]" />
              <Skeleton className="h-5 sm:h-6 w-[150px] sm:w-[180px]" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3 sm:space-y-4">
              <div className="space-y-3 sm:space-y-4">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="flex justify-between">
                    <Skeleton className="h-3 sm:h-4 w-[80px] sm:w-[100px]" />
                    <Skeleton className="h-3 sm:h-4 w-[60px] sm:w-[80px]" />
                    <Skeleton className="h-3 sm:h-4 w-[80px] sm:w-[100px]" />
                    <Skeleton className="h-3 sm:h-4 w-[60px] sm:w-[80px]" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ApplicationShell>
  );
}
