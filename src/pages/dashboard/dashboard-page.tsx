import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
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

// filter
function DashboardSkeleton() {
  return (
    <div className="grid h-full gap-2 md:grid-cols-2 xl:grid-cols-3">
      <div className="flex h-full p-20 xl:col-span-2">
        <Skeleton className="h-full w-full" />
      </div>
      <div className="h-full w-full space-y-3 p-20">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
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
    <div className="flex flex-col">
      <div data-tauri-drag-region="true" className="draggable h-8 w-full"></div>
      <div className="flex px-10 py-2">
        <HoverCard>
          <HoverCardTrigger className="flex cursor-pointer items-center">
            <div>
              <Balance
                targetValue={todayValue?.totalValue || 0}
                duration={500}
                currency={todayValue?.currency || 'USD'}
              />

              <div className="flex space-x-3 text-sm">
                <GainAmount
                  className="text-md font-light"
                  value={todayValue?.totalGainValue || 0}
                  currency={todayValue?.currency || 'USD'}
                  displayCurrency={false}
                ></GainAmount>
                <div className="my-1 border-r border-gray-300 pr-2" />
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

      <HistoryChart data={portfolioHistory || []} height={240} />

      <div className="mx-auto w-full bg-gradient-to-b from-custom-green to-background px-12 pt-20 dark:from-custom-green-dark">
        {/* Responsive grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Column 1 */}
          <div className="pr-16 xl:col-span-2">
            <Accounts className="border-none bg-transparent shadow-none" accounts={accounts} />
          </div>

          {/* Column 2 */}
          <div className="">
            <SavingGoals accounts={accounts} />
          </div>
          {/* Column 3 */}
        </div>
      </div>
      {/* Grid container */}
    </div>
  );
}
