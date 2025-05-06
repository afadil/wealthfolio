import { useMemo, useState } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';

import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import IntervalSelector from '@/components/interval-selector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { useParams } from 'react-router-dom';
import AccountMetrics from './account-metrics';
import AccountHoldings from './account-holdings';
import { AccountValuation, DateRange, TrackedItem, TimePeriod } from '@/lib/types';
import { useAccounts } from '@/hooks/use-accounts';
import { AccountContributionLimit } from './account-contribution-limit';
import { PrivacyAmount } from '@/components/privacy-amount';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { useValuationHistory } from '@/hooks/use-valuation-history';
import { PortfolioUpdateTrigger } from '@/pages/dashboard/portfolio-update-trigger';
import { useCalculatePerformanceHistory } from '@/pages/performance/hooks/use-performance-data';
import { subMonths } from 'date-fns';

interface HistoryChartData {
  date: string;
  totalValue: number;
  netContribution: number;
  currency: string;
}

// Helper function to get the initial date range (copied from dashboard)
const getInitialDateRange = (): DateRange => ({
  from: subMonths(new Date(), 3),
  to: new Date(),
});

// Define the initial interval code (consistent with other pages)
const INITIAL_INTERVAL_CODE: TimePeriod = '3M';

const AccountPage = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialDateRange());
  const [selectedIntervalCode, setSelectedIntervalCode] = useState<TimePeriod>(INITIAL_INTERVAL_CODE);

  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const account = useMemo(() => accounts?.find((acc) => acc.id === id), [accounts, id]);

  const accountTrackedItem: TrackedItem | undefined = useMemo(() => {
    if (account) {
      return { id: account.id, type: 'account', name: account.name };
    }
    return undefined;
  }, [account]);

  const { data: performanceResponse, isLoading: isPerformanceHistoryLoading } =
    useCalculatePerformanceHistory({
      selectedItems: accountTrackedItem ? [accountTrackedItem] : [],
      dateRange: dateRange,
    });

  const accountPerformance = performanceResponse?.[0] || null;

  const { valuationHistory, isLoading: isValuationHistoryLoading } = useValuationHistory(
    dateRange,
    id,
  );

  const chartData: HistoryChartData[] = useMemo(() => {
    if (!valuationHistory) return [];
    return valuationHistory.map((valuation: AccountValuation) => ({
      date: valuation.valuationDate,
      totalValue: valuation.totalValue,
      netContribution: valuation.netContribution,
      currency: valuation.accountCurrency,
    }));
  }, [valuationHistory]);

  const currentValuation = valuationHistory?.[valuationHistory.length - 1];

  const isLoading = isAccountsLoading || isValuationHistoryLoading;
  const isDetailsLoading = isLoading || isPerformanceHistoryLoading;

  // Callback for IntervalSelector
  const handleIntervalSelect = (
    code: TimePeriod,
    _description: string,
    range: DateRange | undefined
  ) => {
    setSelectedIntervalCode(code);
    setDateRange(range);
  };

  const percentageToDisplay = useMemo(() => {
    if (!accountPerformance) return 0;

    if (selectedIntervalCode === 'ALL') {
      return accountPerformance.simpleReturn ?? 0;
    }
    return accountPerformance.cumulativeMwr ?? 0;
  }, [accountPerformance, selectedIntervalCode]);

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
                        value={accountPerformance?.gainLossAmount ?? 0}
                        currency={account?.currency || 'USD'}
                        displayCurrency={false}
                      />
                      <div className="my-1 border-r border-muted-foreground pr-2" />
                      <GainPercent
                        className="text-sm font-light"
                        value={percentageToDisplay}
                        animated={true}
                      />
                    </div>
                  </div>
                  <PrivacyToggle className="mt-3" />
                </div>
              </PortfolioUpdateTrigger>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full p-0">
              <div className="flex w-full flex-col">
                <div className="h-[440px] w-full">
                  <HistoryChart data={chartData} isLoading={false} />
                  <IntervalSelector
                    className="relative bottom-10 left-0 right-0 z-10"
                    onIntervalSelect={handleIntervalSelect}
                    isLoading={isValuationHistoryLoading}
                    initialSelection={INITIAL_INTERVAL_CODE}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col space-y-4">
          <AccountMetrics
            valuation={currentValuation}
            performance={accountPerformance}
            className="flex-grow"
            isLoading={isDetailsLoading || isPerformanceHistoryLoading}
          />
          <AccountContributionLimit accountId={id} />
        </div>
      </div>

      <AccountHoldings accountId={id} />
    </ApplicationShell>
  );
};

export default AccountPage;
