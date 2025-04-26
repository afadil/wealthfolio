import { useMemo } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';

import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import IntervalSelector from '@/components/interval-selector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { useParams } from 'react-router-dom';
import AccountDetail from './account-detail';
import AccountHoldings from './account-holdings';
import { AccountValuation, TimePeriod, SimplePerformanceMetrics } from '@/lib/types';
import { useAccountsSimplePerformance } from '@/hooks/use-accounts-simple-performance';
import { useAccounts } from '@/hooks/use-accounts';
import { AccountContributionLimit } from './account-contribution-limit';
import { PrivacyAmount } from '@/components/privacy-amount';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { useValuationHistory } from '@/hooks/use-valuation-history';
import { PortfolioUpdateTrigger } from '@/pages/dashboard/portfolio-update-trigger';
import { useDerivedValuationMetrics } from '@/hooks/use-derived-valuation-metrics';

interface HistoryChartData {
  date: string;
  totalValue: number;
  netContribution: number;
  currency: string;
}

const AccountPage = () => {
  const { id = '' } = useParams<{ id: string }>();

  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const account = useMemo(() => accounts?.find((acc) => acc.id === id), [accounts, id]);

  const { 
    data: performanceData, 
    isLoading: isPerformanceLoading, 
    isFetching: isPerformanceFetching 
  } = useAccountsSimplePerformance(account ? [account] : []);

  const performance: SimplePerformanceMetrics | undefined = useMemo(() => {
    if (performanceData && performanceData.length > 0) {
        return performanceData.find(p => p.accountId === id);
    }
    return undefined;
  }, [performanceData, id]);

  const {
    valuationHistory,
    isLoading: isValuationHistoryLoading,
    interval,
    setInterval,
  } = useValuationHistory('3M', id);

  const chartData: HistoryChartData[] = useMemo(() => {
    if (!valuationHistory) return [];
    return valuationHistory.map((valuation: AccountValuation) => ({
      date: valuation.valuationDate,
      totalValue: valuation.totalValue,
      netContribution: valuation.netContribution,
      currency: valuation.accountCurrency,
    }));
  }, [valuationHistory]);

  const {
    gainLossAmount,
    simpleReturn,
    currentValuation,
  } = useDerivedValuationMetrics(valuationHistory);

  const isLoading = isAccountsLoading || isValuationHistoryLoading;
  const isDetailsLoading = isPerformanceLoading || isPerformanceFetching;

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader
        heading={account?.name || 'Account'}
        headingPrefix={account?.group || account?.currency}
        displayBack={true}
      />
      <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
        <Card className="col-span-1 md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-md">
              {isLoading || !account ? (
                <Skeleton className="h-20 w-48" />
              ) : (
                <PortfolioUpdateTrigger lastCalculatedAt={currentValuation?.calculatedAt}>
                  <div className="flex items-start gap-2">
                    <div>
                      <p className="pt-3 text-xl font-bold">
                        <PrivacyAmount
                          value={currentValuation?.totalValue || 0}
                          currency={account?.currency || 'USD'}
                        />
                      </p>
                      <div className="flex space-x-3 text-sm">
                        <GainAmount
                          className="text-sm font-light"
                          value={gainLossAmount}
                          currency={account?.currency || 'USD'}
                          displayCurrency={false}
                        />
                        <div className="my-1 border-r border-muted-foreground pr-2" />
                        <GainPercent
                          className="text-sm font-light"
                          value={simpleReturn}
                          animated={true}
                        />
                      </div>
                    </div>
                    <PrivacyToggle className="mt-3" />
                  </div>
                </PortfolioUpdateTrigger>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full p-0">
              <div className="flex w-full flex-col">
                {isValuationHistoryLoading ? (
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (
                  <div className="h-[400px] w-full">
                    <HistoryChart data={chartData} />
                    <IntervalSelector
                      className="relative bottom-10 left-0 right-0 z-10"
                      selectedInterval={interval}
                      onIntervalSelect={(newInterval: TimePeriod) => {
                        setInterval(newInterval);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {isDetailsLoading || !performance ? (
          <Skeleton className="h-full" />
        ) : (
          <div className="flex flex-col space-y-4">
            <AccountDetail data={performance} className="flex-grow" />
            <AccountContributionLimit accountId={id} />
          </div>
        )}
      </div>

      <AccountHoldings accountId={id} />
    </ApplicationShell>
  );
};

export default AccountPage;
