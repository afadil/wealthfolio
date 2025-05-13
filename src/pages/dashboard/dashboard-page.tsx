import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import IntervalSelector from '@/components/interval-selector';
import Balance from './balance';
import { Skeleton } from '@/components/ui/skeleton';
import SavingGoals from './goals';
import { useMemo, useState } from 'react';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { AccountsSummary } from './accounts-summary';
import { useSettingsContext } from '@/lib/settings-provider';
import { useValuationHistory } from '@/hooks/use-valuation-history';
import { PortfolioUpdateTrigger } from '@/pages/dashboard/portfolio-update-trigger';
import { PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';
import { useCalculatePerformanceHistory } from '@/pages/performance/hooks/use-performance-data';
import { TrackedItem, DateRange, TimePeriod } from '@/lib/types';
import { subMonths } from 'date-fns';

const PORTFOLIO_TOTAL_ITEM: TrackedItem = {
  id: PORTFOLIO_ACCOUNT_ID,
  type: 'account',
  name: 'Portfolio Total',
};

function DashboardSkeleton() {
  return (
    <div className="grid h-full gap-4 sm:grid-cols-1 md:grid-cols-3">
      <div className="flex h-full p-4 md:col-span-2">
        <Skeleton className="h-full w-full" />
      </div>
      <div className="h-full w-full space-y-4 p-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

// Helper function to get the initial date range for 3M
const getInitialDateRange = (): DateRange => ({
  from: subMonths(new Date(), 3),
  to: new Date(),
});

const INITIAL_INTERVAL_CODE: TimePeriod = '3M';

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialDateRange());
  const [selectedIntervalCode, setSelectedIntervalCode] = useState<TimePeriod>(INITIAL_INTERVAL_CODE);
  const [selectedIntervalDescription, setSelectedIntervalDescription] = useState<string>('Last 3 months');

  const {
    valuationHistory,
    isLoading: isValuationHistoryLoading,
  } = useValuationHistory(dateRange);

  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency || 'USD';

  const { data: performanceDataArray, isLoading: isPerformanceLoading } =
    useCalculatePerformanceHistory({
      selectedItems: [PORTFOLIO_TOTAL_ITEM],
      dateRange: dateRange,
    });

  const performanceMetrics = performanceDataArray?.[0] || null;

  const gainLossAmount = performanceMetrics?.gainLossAmount ?? 0;
  const simpleReturn = performanceMetrics?.simpleReturn ?? 0;

  const currentValuation = useMemo(() => {
    return valuationHistory && valuationHistory.length > 0
      ? valuationHistory[valuationHistory.length - 1]
      : null;
  }, [valuationHistory]);

  const chartData = useMemo(() => {
    return valuationHistory?.map(item => ({
      date: item.valuationDate,
      totalValue: item.totalValue,
      netContribution: item.netContribution,
      currency: item.baseCurrency || baseCurrency,
    })) || [];
  }, [valuationHistory, baseCurrency]);

  const isLoading = isValuationHistoryLoading || (isPerformanceLoading && !performanceMetrics);


  if (isLoading && !valuationHistory && !performanceMetrics) {
    return <DashboardSkeleton />;
  }

  // Callback for IntervalSelector
  const handleIntervalSelect = (
    code: TimePeriod, 
    description: string,
    range: DateRange | undefined
  ) => {
    setSelectedIntervalCode(code);
    setSelectedIntervalDescription(description);
    setDateRange(range); 
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div data-tauri-drag-region="true" className="draggable h-8 w-full"></div>
      <div className="flex px-4 py-2 md:px-6 lg:px-10">
        <PortfolioUpdateTrigger lastCalculatedAt={currentValuation?.calculatedAt}>
          <div className="flex items-start gap-2">
            <div>
              <div className="flex items-center gap-3">
                <Balance
                  targetValue={currentValuation?.totalValue || 0}
                  currency={baseCurrency}
                  displayCurrency={true}
                />
                <PrivacyToggle />
              </div>
              <div className="text-md flex space-x-3">
                <GainAmount
                  className="text-md font-light"
                  value={gainLossAmount}
                  currency={baseCurrency}
                  displayCurrency={false}
                ></GainAmount>
                <div className="my-1 border-r border-secondary pr-2" />
                <GainPercent
                  className="text-md font-light"
                  value={simpleReturn}
                  animated={true}
                ></GainPercent>
                {selectedIntervalDescription && (
                  <span className="text-md ml-1 font-light text-muted-foreground">
                    {selectedIntervalDescription}
                  </span>
                )}
              </div>
            </div>
          </div>
        </PortfolioUpdateTrigger>
      </div>

      <div className="h-[300px]">
        {valuationHistory && chartData.length > 0 ? (
          <>
            <HistoryChart data={chartData} />
            <IntervalSelector
              className="relative bottom-0 left-0 right-0 z-10"
              onIntervalSelect={handleIntervalSelect}
              isLoading={isValuationHistoryLoading}
              initialSelection={INITIAL_INTERVAL_CODE}
            />
          </>
        ) : null}
      </div>

      <div className="flex-grow bg-gradient-to-t from-success/30 via-success/15 to-success/10 px-4 pt-8 md:px-6 md:pt-12 lg:px-10 lg:pt-20">
        <div className="grid gap-12 sm:grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2">
            <AccountsSummary className="border-none bg-transparent shadow-none" />
          </div>
          <div className="sm:col-span-1">
            <SavingGoals />
          </div>
        </div>
      </div>
    </div>
  );
}
