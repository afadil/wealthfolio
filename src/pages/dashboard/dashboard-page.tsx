import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import IntervalSelector from '@/components/interval-selector';
import Balance from './balance';
import { Skeleton } from '@/components/ui/skeleton';
import SavingGoals from './goals';
import { useMemo } from 'react';

import { PrivacyToggle } from '@/components/privacy-toggle';
import { AccountsSummary } from './accounts-summary';
import { useSettingsContext } from '@/lib/settings-provider';
import { useValuationHistory } from '@/hooks/use-valuation-history';
import { PortfolioUpdateTrigger } from '@/pages/dashboard/portfolio-update-trigger';
import { PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';
import { useDerivedValuationMetrics } from '@/hooks/use-derived-valuation-metrics';

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

export default function DashboardPage() {
  const {
    valuationHistory,
    isLoading: isValuationHistoryLoading,
    interval,
    setInterval,
  } = useValuationHistory('3M');

  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency || 'USD';

  const { 
    gainLossAmount, 
    simpleReturn, 
    currentValuation 
  } = useDerivedValuationMetrics(valuationHistory);

  const chartData = useMemo(() => {
    return valuationHistory?.map(item => ({
      date: item.valuationDate,
      totalValue: item.totalValue,
      netContribution: item.netContribution,
      currency: item.baseCurrency || baseCurrency,
    })) || [];
  }, [valuationHistory, baseCurrency]);

  if (isValuationHistoryLoading && !valuationHistory) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div data-tauri-drag-region="true" className="draggable h-8 w-full"></div>
      <div className="flex px-4 py-2 md:px-6 lg:px-10">
        <PortfolioUpdateTrigger lastCalculatedAt={currentValuation?.calculatedAt}>
          <div className="flex items-start gap-2">
            <div>
              <Balance
                targetValue={currentValuation?.totalValue || 0}
                currency={baseCurrency}
                displayCurrency={true}
              />
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
              </div>
            </div>
            <PrivacyToggle className="mt-2" />
          </div>
        </PortfolioUpdateTrigger>
      </div>

      <div className="h-[300px]">
        {valuationHistory && chartData.length > 0 ? (
          <>
            <HistoryChart data={chartData} />
            <IntervalSelector
              className="relative bottom-0 left-0 right-0 z-10"
              selectedInterval={interval}
              onIntervalSelect={(newInterval) => {
                setInterval(newInterval as '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL');
              }}
              isLoading={isValuationHistoryLoading}
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
