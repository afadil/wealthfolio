import { useState, useMemo } from 'react';
import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import IntervalSelector from '@/components/interval-selector';
import Balance from './balance';
import { useQuery } from '@tanstack/react-query';
import { PortfolioHistory, AccountSummary, AccountGroup } from '@/lib/types';
import { getHistory, getAccountsSummary, getPortfolioSummary } from '@/commands/portfolio';
import { Skeleton } from '@/components/ui/skeleton';
import SavingGoals from './goals';
import { QueryKeys } from '@/lib/query-keys';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { format, subDays, subWeeks, subMonths, subYears, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { AccountsSummary } from './accounts-summary';
import { useCalculatePerformance } from '../performance/hooks/use-performance-data';
import { PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';

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
  const [interval, setInterval] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('3M');
  const updatePortfolioMutation = useCalculateHistoryMutation({
    successTitle: 'Portfolio recalculated successfully',
    errorTitle: 'Failed to recalculate portfolio',
  });

  const { data: accounts, isLoading: isAccountsLoading } = useQuery<AccountSummary[], Error>({
    queryKey: [QueryKeys.ACCOUNTS_SUMMARY],
    queryFn: getAccountsSummary,
  });

  const { data: portfolioHistory, isLoading: isPortfolioHistoryLoading } = useQuery<
    PortfolioHistory[],
    Error
  >({
    queryKey: QueryKeys.accountHistory('TOTAL'),
    queryFn: () => getHistory('TOTAL'),
  });

  const { data: portfolioSummary, isLoading: isPortfolioSummaryLoading } = useQuery<
    AccountGroup[],
    Error
  >({
    queryKey: [QueryKeys.PORTFOLIO_SUMMARY],
    queryFn: getPortfolioSummary,
  });

  const dynamicDateRange = useMemo(() => {
    const to = new Date();
    let from: Date | undefined;

    switch (interval) {
      case '1D':
        from = subDays(to, 1);
        break;
      case '1W':
        from = subWeeks(to, 7);
        break;
      case '1M':
        from = subMonths(to, 1);
        break;
      case '3M':
        from = subMonths(to, 3);
        break;
      case '1Y':
        from = subYears(to, 1);
        break;
      case 'ALL':
        if (portfolioHistory && portfolioHistory.length > 0) {
          // Ensure the date string is valid before parsing
          try {
            from = parseISO(portfolioHistory[0].date);
          } catch (e) {
            console.error("Error parsing date from portfolio history:", e);
            // Fallback if parsing fails, e.g., 1 year
            from = subYears(to, 1);
          }
        } else {
          // Fallback if no history, e.g., 1 year
          from = subYears(to, 1);
        }
        break;
      default:
        from = subMonths(to, 3); // Default to 3M
    }

    return from ? { from, to } : undefined;
  }, [interval, portfolioHistory]);

  const {
    data: performanceData,
    isLoading: isLoadingPerformance,
  } = useCalculatePerformance({
    selectedItems: [
      {
        id: PORTFOLIO_ACCOUNT_ID,
        type: 'account',
        name: 'Portfolio Total',
      },
    ],
    dateRange: dynamicDateRange,
  });

  console.log('performanceData', performanceData);

  const totalPortfolioValueFromSummary = useMemo(() => {
    if (!portfolioSummary) {
      return 0;
    }
    // Sum the totalValueBaseCurrency, handling potential string or number types
    return portfolioSummary.reduce((sum, group) => {
      let numericValue = 0; // Default value
      const rawValue = group.totalValueBaseCurrency;

      if (typeof rawValue === 'number') {
        // If it's already a number, use it directly
        numericValue = rawValue;
      } else if (typeof rawValue === 'string') {
        // If it's a string, try to parse it
        numericValue = parseFloat(rawValue);
      }
      // Add the value only if it's a finite number (handles NaN from parseFloat or non-finite numbers)
      return sum + (Number.isFinite(numericValue) ? numericValue : 0);
    }, 0); // Initialize sum to 0
  }, [portfolioSummary]);

  const baseCurrency = useMemo(() => {
    return portfolioSummary?.[0]?.baseCurrency || 'USD';
  }, [portfolioSummary]);

  if (isPortfolioHistoryLoading || isAccountsLoading || isPortfolioSummaryLoading) {
    return <DashboardSkeleton />;
  }

  console.log('totalPortfolioValueFromSummary', totalPortfolioValueFromSummary);
  const todayValue = portfolioHistory?.[portfolioHistory.length - 1];

  const handleRecalculate = async () => {
    updatePortfolioMutation.mutate({
      accountIds: undefined,
      forceFullCalculation: true,
    });
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div data-tauri-drag-region="true" className="draggable h-8 w-full"></div>
      <div className="flex px-4 py-2 md:px-6 lg:px-10">
        <HoverCard>
          <HoverCardTrigger className="flex cursor-pointer items-center">
            <div className="flex items-start gap-2">
              <div>
                <Balance
                  targetValue={totalPortfolioValueFromSummary}
                  currency={baseCurrency}
                  displayCurrency={true}
                />

                <div className="flex space-x-3 text-sm">
                  <GainAmount
                    className="text-md font-light"
                    value={todayValue?.totalGainValue || 0}
                    currency={todayValue?.currency || 'USD'}
                    displayCurrency={false}
                  ></GainAmount>
                  <div className="my-1 border-r border-secondary pr-2" />
                  <GainPercent
                    className="text-md font-light"
                    value={(performanceData?.[0]?.totalReturn  || 0)* 100}
                    animated={true}
                  ></GainPercent>
                </div>
              </div>
              <PrivacyToggle className="mt-2" />
            </div>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-80 shadow-none">
            <div className="flex flex-col space-y-4">
              <div className="space-y-2">
                <h4 className="flex text-sm font-light">
                  <Icons.Calendar className="mr-2 h-4 w-4" />
                  As of:{' '}
                  <Badge className="ml-1 font-medium" variant="secondary">
                    {todayValue?.calculatedAt
                      ? `${format(new Date(todayValue.calculatedAt), 'PPpp')}`
                      : '-'}
                  </Badge>
                </h4>
              </div>
              <Button
                onClick={handleRecalculate}
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={updatePortfolioMutation.isPending}
              >
                {updatePortfolioMutation.isPending ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Refresh className="mr-2 h-4 w-4" />
                )}
                {updatePortfolioMutation.isPending ? 'Updating portfolio...' : 'Update Portfolio'}
              </Button>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>

      <div className="h-[300px]">
        <HistoryChart data={portfolioHistory || []} interval={interval} />
        <IntervalSelector
          className="relative bottom-0 left-0 right-0 z-10"
          onIntervalSelect={(newInterval) => {
            setInterval(newInterval);
          }}
        />
      </div>

      <div className="flex-grow bg-gradient-to-t from-success/30 via-success/15 to-success/10 px-4 pt-8 md:px-6 md:pt-12 lg:px-10 lg:pt-20">
        <div className="grid gap-12 sm:grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2">
            <AccountsSummary
              className="border-none bg-transparent shadow-none"
              accountsSummary={portfolioSummary}
            />
          </div>
          <div className="sm:col-span-1">
            <SavingGoals accounts={accounts} />
          </div>
        </div>
      </div>
    </div>
  );
}
