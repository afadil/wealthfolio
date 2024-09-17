import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';

import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { HistoryChart } from '@/components/history-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { formatAmount } from '@/lib/utils';
import { useParams } from 'react-router-dom';
import AccountDetail from './account-detail';
import AccountHoldings from './account-holdings';
import { useQuery } from '@tanstack/react-query';
import { Holding, PortfolioHistory, AccountSummary } from '@/lib/types';
import { computeHoldings, getAccountHistory, getAccountsSummary } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';

const AccountPage = () => {
  const { id = '' } = useParams<{ id: string }>();

  const { data: accounts, isLoading: isAccountsLoading } = useQuery<AccountSummary[], Error>({
    queryKey: [QueryKeys.ACCOUNTS_SUMMARY],
    queryFn: getAccountsSummary,
  });

  const accountSummary = accounts?.find((account) => account.account.id === id);

  const { data: accountHistory, isLoading: isLoadingAccountHistory } = useQuery<
    PortfolioHistory[],
    Error
  >({
    queryKey: QueryKeys.accountHistory(id),
    queryFn: () => getAccountHistory(id),
    enabled: !!id,
  });

  const { data: holdings, isLoading: isLoadingHoldings } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS],
    queryFn: computeHoldings,
  });

  const accountHoldings = holdings
    ?.filter((holding) => holding.account?.id === id)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const account = accountSummary?.account;
  const performance = accountSummary?.performance;

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader
        heading={account?.name || '-'}
        headingPrefix={account?.group || account?.currency}
        displayBack={true}
      />
      <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
        <Card className="col-span-1 md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-md">
              <p className="pt-3 text-xl font-bold">
                {formatAmount(performance?.totalValue || 0, performance?.currency || 'USD')}
              </p>
              <div className="flex space-x-3 text-sm">
                <GainAmount
                  className="text-sm font-light"
                  value={performance?.totalGainValue || 0}
                  currency={account?.currency || 'USD'}
                  displayCurrency={false}
                ></GainAmount>
                <div className="my-1 border-r border-gray-300 pr-2" />
                <GainPercent
                  className="text-sm font-light"
                  value={performance?.totalGainPercentage || 0}
                ></GainPercent>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full p-0">
              <div className="flex w-full flex-col">
                {isLoadingAccountHistory ? (
                  <Skeleton className="h-96" />
                ) : (
                  <HistoryChart data={accountHistory || []} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {isAccountsLoading && !performance ? (
          <Skeleton className="h-40" />
        ) : (
          <AccountDetail data={performance} className="col-span-1 md:col-span-1" />
        )}
      </div>
      <div className="pt-6">
        <AccountHoldings holdings={accountHoldings || []} isLoading={isLoadingHoldings} />
      </div>
    </ApplicationShell>
  );
};

export default AccountPage;
