import { useQuery } from '@tanstack/react-query';
import { getContributionLimit, calculateDepositsForAccounts } from '@/commands/contribution-limits';
import { QueryKeys } from '@/lib/query-keys';
import { ContributionLimit, DepositsCalculation } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { PrivacyAmount } from '@/components/privacy-amount';

interface AccountContributionLimitProps {
  accountId: string;
}

export function AccountContributionLimit({ accountId }: AccountContributionLimitProps) {
  const currentYear = new Date().getFullYear();

  const { data: allLimits, isLoading: isLimitsLoading } = useQuery<ContributionLimit[], Error>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMITS],
    queryFn: getContributionLimit,
  });

  const limitsForAccount =
    allLimits?.filter(
      (limit) => limit.accountIds?.includes(accountId) && limit.contributionYear === currentYear,
    ) || [];

  const accountIdsToQuery =
    limitsForAccount.length > 0
      ? limitsForAccount.flatMap((limit) => limit.accountIds?.split(',') || [])
      : [accountId];

  const { data: deposits, isLoading: isDepositsLoading } = useQuery<DepositsCalculation, Error>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMIT_PROGRESS, accountIdsToQuery, currentYear],
    queryFn: () => calculateDepositsForAccounts(accountIdsToQuery, currentYear),
    enabled: !isLimitsLoading,
  });

  if (isLimitsLoading || isDepositsLoading) {
    return <AccountContributionLimit.Skeleton />;
  }

  const accountLimits =
    allLimits?.filter(
      (limit) => limit.accountIds?.includes(accountId) && limit.contributionYear === currentYear,
    ) || [];

  const accountDeposit = deposits?.byAccount[accountId];

  if (accountLimits.length === 0) {
    return (
      <Card className="border-none bg-indigo-100 p-6 shadow-sm dark:border-primary/20 dark:bg-primary/20">
        <div className="flex items-center justify-between text-sm">
          <span>
            You've contributed{' '}
            <span className="font-semibold">
              <PrivacyAmount
                value={accountDeposit?.convertedAmount || 0}
                currency={deposits?.baseCurrency || 'USD'}
              />
            </span>{' '}
            so far in {currentYear}. There's no contribution limit set for this account.
          </span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {accountLimits.map((limit) => (
        <AccountContributionLimitItem
          key={limit.id}
          limit={limit}
          deposit={accountDeposit}
          totalDeposits={deposits?.total || 0}
          baseCurrency={deposits?.baseCurrency || 'USD'}
        />
      ))}
    </div>
  );
}

function AccountContributionLimitItem({
  limit,
  deposit,
  totalDeposits,
  baseCurrency,
}: {
  limit: ContributionLimit;
  deposit?: { amount: number; currency: string; convertedAmount: number };
  totalDeposits: number;
  baseCurrency: string;
}) {
  const progressValue = totalDeposits ? totalDeposits : 0;
  const progressPercentageNumber =
    limit.limitAmount > 0 ? (progressValue / limit.limitAmount) * 100 : 0;
  const isOverLimit = progressPercentageNumber > 100;
  const isAtLimit = progressPercentageNumber === 100;

  return (
    <Card
      className={`border-none pt-6 shadow-sm ${
        isOverLimit ? 'border-destructive/20 bg-destructive/10' : isAtLimit ? 'bg-success/10' : ''
      }`}
    >
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {isOverLimit ? (
              <span>
                You've contributed{' '}
                <span className="font-semibold">
                  <PrivacyAmount value={deposit?.convertedAmount || 0} currency={baseCurrency} />
                </span>{' '}
                to this account in {limit.contributionYear}. Your total is{' '}
                <span className="font-semibold text-destructive">
                  <PrivacyAmount value={totalDeposits} currency={baseCurrency} />
                </span>{' '}
                which is over the{' '}
                <span className="font-semibold">
                  <PrivacyAmount value={limit.limitAmount} currency={baseCurrency} />
                </span>{' '}
                limit.
              </span>
            ) : (
              <span>
                You've contributed{' '}
                <span className="font-semibold">
                  <PrivacyAmount value={deposit?.convertedAmount || 0} currency={baseCurrency} />
                </span>{' '}
                to this account in {limit.contributionYear}. Your total contribution towards the{' '}
                <span className="font-semibold">
                  <PrivacyAmount value={limit.limitAmount} currency={baseCurrency} />
                </span>{' '}
                {limit.groupName} limit is{' '}
                <span className="font-semibold">
                  <PrivacyAmount value={totalDeposits} currency={baseCurrency} />
                </span>
                .
              </span>
            )}
          </div>
        </div>
        <Progress value={progressPercentageNumber} className="w-full" showPercentage />
      </CardContent>
    </Card>
  );
}

AccountContributionLimit.Skeleton = function AccountContributionLimitSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    </div>
  );
};
