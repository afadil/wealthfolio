import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import Balance from './balance';
import { useQuery } from '@tanstack/react-query';
import { FinancialHistory } from '@/lib/types';
import { getHistorical } from '@/commands/portfolio';
import { Skeleton } from '@/components/ui/skeleton';
import { Accounts } from './accounts';
import SavingGoals from './goals';
import { formatAccountsData } from '@/lib/portfolio-helper';

// filter
function DashboardSkeleton() {
  return (
    <div className=" grid h-full gap-2 md:grid-cols-2 xl:grid-cols-3">
      <div className="flex h-full p-20 xl:col-span-2">
        <Skeleton className="h-full w-full" />
      </div>
      <div className=" h-full w-full space-y-3 p-20">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: historyData, isLoading } = useQuery<FinancialHistory[], Error>({
    queryKey: ['portfolio_history'],
    queryFn: getHistorical,
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const portfolio = historyData?.find((history) => history.account?.id === 'TOTAL');
  const todayValue = portfolio?.history[portfolio?.history.length - 1];

  const accountsData = formatAccountsData(historyData || [], portfolio?.account.currency);

  return (
    <div className="flex flex-col">
      <div data-tauri-drag-region="true" className="draggable h-8 w-full"></div>
      <div className="flex px-10 py-2">
        <div>
          <Balance
            targetValue={todayValue?.totalValue || 0}
            duration={500}
            currency={todayValue?.currency || 'USD'}
          />
          <div className="flex space-x-3 text-sm">
            <GainAmount
              className="text-sm font-light "
              value={todayValue?.totalGainValue || 0}
              currency={todayValue?.currency || 'USD'}
              displayCurrency={false}
            ></GainAmount>
            <div className="my-1 border-r border-gray-300 pr-2" />
            <GainPercent
              className="text-sm font-light"
              value={todayValue?.totalGainPercentage || 0}
            ></GainPercent>
          </div>
        </div>
      </div>

      <HistoryChart data={portfolio?.history || []} height={240} />

      <div className="mx-auto w-full bg-gradient-to-b from-custom-green to-background px-12 pt-20 dark:from-custom-green-dark">
        {/* Responsive grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* Column 1 */}
          <div className="pr-16 xl:col-span-2">
            <Accounts className="border-none bg-transparent shadow-none" accounts={accountsData} />
          </div>

          {/* Column 2 */}
          <div className="">
            <SavingGoals accounts={accountsData} />
          </div>
          {/* Column 3 */}
        </div>
      </div>

      {/* Grid container */}
    </div>
  );
}
