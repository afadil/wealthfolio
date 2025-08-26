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
import { EquityCurveChart } from '../components/equity-curve-chart';
import { OpenTradesTable } from '../components/open-trades-table';
import { DistributionCharts } from '../components/distribution-charts';
import { YearlyCalendarView } from '../components/yearly-calendar-view';


const periods: { code: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'; label: string }[] = [
  { code: '1M', label: '1M' },
  { code: '3M', label: '3M' },
  { code: '6M', label: '6M' },
  { code: 'YTD', label: 'YTD' },
  { code: '1Y', label: '1Y' },
  { code: 'ALL', label: 'ALL' },
];

type ChartPeriodType = 'daily' | 'monthly';

const ChartPeriodSelector: React.FC<{
  selectedType: ChartPeriodType;
  onTypeSelect: (type: ChartPeriodType) => void;
}> = ({ selectedType, onTypeSelect }) => (
  <div className="flex justify-end">
    <div className="flex space-x-1 rounded-full bg-secondary p-1">
      <Button
        size="sm"
        className="h-8 rounded-full px-2 text-xs"
        variant={selectedType === 'daily' ? 'default' : 'ghost'}
        onClick={() => onTypeSelect('daily')}
      >
        Daily
      </Button>
      <Button
        size="sm"
        className="h-8 rounded-full px-2 text-xs"
        variant={selectedType === 'monthly' ? 'default' : 'ghost'}
        onClick={() => onTypeSelect('monthly')}
      >
        Monthly
      </Button>
    </div>
  </div>
);

const PeriodSelector: React.FC<{
  selectedPeriod: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
  onPeriodSelect: (period: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL') => void;
}> = ({ selectedPeriod, onPeriodSelect }) => (
  <div className="flex justify-end">
    <div className="flex space-x-1 rounded-full bg-secondary p-1">
      {periods.map(({ code, label }) => (
        <Button
          key={code}
          size="sm"
          className="h-8 rounded-full px-2 text-xs"
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
  const [chartPeriodType, setChartPeriodType] = useState<ChartPeriodType>('monthly');
  const [selectedYear, setSelectedYear] = useState(new Date());

  const { data: dashboardData, isLoading, error, refetch } = useSwingDashboard(ctx, selectedPeriod, chartPeriodType);

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
      <ApplicationShell className="p-6">
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center">
            <Icons.AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Failed to load dashboard</h3>
            <p className="mb-4 text-muted-foreground">
              {error?.message || 'Unable to load swing trading data'}
            </p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </div>
        </div>
      </ApplicationShell>
    );
  }

  const { metrics, closedTrades, openPositions, periodPL, distribution, calendar } = dashboardData;

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
    <ApplicationShell className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Swingfolio Dashboard</h1>
          <p className="text-muted-foreground">
            Track your swing trading performance and analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodSelect={setSelectedPeriod}
          />
          <Button variant="outline" onClick={handleNavigateToActivities}>
            <Icons.Settings className="mr-2 h-4 w-4" />
            Select Activities
          </Button>
          <Button variant="outline" size="icon" onClick={handleNavigateToSettings}>
            <Icons.Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P/L</CardTitle>
              <Icons.TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <GainAmount value={metrics.totalPL} currency={metrics.currency} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {metrics.totalTrades + metrics.openPositions} positions
                </p>
                <div className="text-xs font-medium text-muted-foreground">
                  Combined P/L
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Realized P/L</CardTitle>
              <Icons.CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                <GainAmount value={metrics.totalRealizedPL} currency={metrics.currency} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {metrics.totalTrades} closed trades
                </p>
                <GainPercent 
                  value={metrics.winRate / 100} 
                  className="text-xs"
                  showSign={false}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unrealized P/L</CardTitle>
              <Icons.Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {metrics.totalUnrealizedPL === 0 && metrics.openPositions > 0 ? (
                  <span className="text-muted-foreground">Market data needed</span>
                ) : (
                  <GainAmount value={metrics.totalUnrealizedPL} currency={metrics.currency} />
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {metrics.openPositions} open positions
                </p>
                {metrics.totalUnrealizedPL !== 0 && (
                  <div className="text-xs font-medium text-muted-foreground">
                    Mark to market
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Key Metrics</CardTitle>
              <Icons.BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Win Rate</span>
                  <GainPercent value={metrics.winRate / 100} className="text-sm font-semibold" showSign={false} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Profit Factor</span>
                  <span className="text-sm font-semibold">
                    {metrics.profitFactor === Number.POSITIVE_INFINITY ? '∞' : metrics.profitFactor.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Expectancy</span>
                  <GainAmount 
                    value={metrics.expectancy} 
                    currency={metrics.currency} 
                    className="text-sm font-semibold"
                    displayDecimal={false}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row - Equity Curve 3/4 and Performance Metrics 1/4 */}
        <div className="grid gap-6 md:grid-cols-4">
          {/* Equity Curve */}
          <Card className="md:col-span-3">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className='text-lg'>
                    {chartPeriodType === 'daily' ? 'Daily' : 'Monthly'} Equity Curve
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {chartPeriodType === 'daily' ? 'Daily' : 'Monthly'} P/L and cumulative equity performance
                  </p>
                </div>
                <ChartPeriodSelector
                  selectedType={chartPeriodType}
                  onTypeSelect={setChartPeriodType}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0">
                <EquityCurveChart 
                  data={chartEquityData} 
                  currency={metrics.currency} 
                  periodType={chartPeriodType}
                />
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-4">
              <CardTitle className='text-lg'>Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-6">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Expectancy</span>
                <span className="text-sm font-medium">
                  <GainAmount value={metrics.expectancy} currency={metrics.currency} />
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Avg Win</span>
                <span className="text-sm font-medium">
                  <GainAmount value={metrics.averageWin} currency={metrics.currency} />
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Avg Loss</span>
                <span className="text-sm font-medium">
                  <GainAmount value={-metrics.averageLoss} currency={metrics.currency} />
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Avg Hold Days</span>
                <span className="text-sm font-medium">{metrics.averageHoldingDays.toFixed(1)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendar and Open Positions */}
        <div className="grid gap-6 lg:grid-cols-2">
        
              <YearlyCalendarView
                calendar={calendar}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
                currency={metrics.currency}
              />
          

          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Open Positions</CardTitle>
              <p className='text-sm text-muted-foreground'>  {openPositions.length} open position{openPositions.length !== 1 ? "s" : ""}</p>
            </CardHeader>
            <CardContent>
              <OpenTradesTable positions={openPositions} />
            </CardContent>
          </Card>
        </div>

        {/* Distribution Charts */}
        <DistributionCharts distribution={distribution} currency={metrics.currency} />
      </div>
    </ApplicationShell>
  );
}

function DashboardSkeleton() {
  return (
    <ApplicationShell className="p-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <Skeleton className="h-8 w-[300px]" />
          <Skeleton className="mt-2 h-5 w-[400px]" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[140px]" />
          <Skeleton className="h-10 w-[100px]" />
        </div>
      </div>

      <div className="space-y-6">
        {/* KPI Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, index) => (
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

        {/* Charts Skeleton */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-[180px]" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="flex justify-between">
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[80px]" />
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
