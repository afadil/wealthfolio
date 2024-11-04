import { useState } from 'react';
import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import IntervalSelector from '@/components/interval-selector';
import Balance from './balance';
import { useQuery } from '@tanstack/react-query';
import { PortfolioHistory, AccountSummary } from '@/lib/types';
import { getHistory, getAccountsSummary } from '@/commands/portfolio';
import { Skeleton } from '@/components/ui/skeleton';
import { Accounts } from './accounts';
import SavingGoals from './goals';
import { QueryKeys } from '@/lib/query-keys';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useRecalculatePortfolioMutation } from '@/hooks/useCalculateHistory';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/adapters';

// filter
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
  const updatePortfolioMutation = useRecalculatePortfolioMutation({
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

  if (isPortfolioHistoryLoading || isAccountsLoading) {
    return <DashboardSkeleton />;
  }

  const todayValue = portfolioHistory?.[portfolioHistory.length - 1];

  const handleRecalculate = async () => {
    updatePortfolioMutation.mutate();
  };

  return (
    <div className="flex h-screen flex-col">
      <div data-tauri-drag-region="true" className="draggable h-8 w-full"></div>
      <div className="flex px-4 py-2 md:px-6 lg:px-10">
        <HoverCard>
          <HoverCardTrigger className="flex cursor-pointer items-center">
            <div>
              <Balance
                targetValue={todayValue?.totalValue || 0}
                currency={todayValue?.currency || 'USD'}
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
                  value={todayValue?.totalGainPercentage || 0}
                ></GainPercent>
              </div>
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

      <div className="flex-grow bg-gradient-to-b from-custom-green to-custom-green/30 px-4 pt-8 dark:from-custom-green-dark dark:to-custom-green-dark/30 md:px-6 md:pt-12 lg:px-10 lg:pt-20">
        <div className="grid gap-12 sm:grid-cols-1 md:grid-cols-3">
          <div className="md:col-span-2">
            <Accounts className="border-none bg-transparent shadow-none" accounts={accounts} />
          </div>
          <div className="sm:col-span-1">
            <SavingGoals accounts={accounts} />
          </div>
        </div>
      </div>
    </div>
  );
}
