import { useQuery } from '@tanstack/react-query';
import { getContributionLimit, getContributionProgress } from '@/commands/contribution-limits';
import { QueryKeys } from '@/lib/query-keys';
import { ContributionLimit } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatAmount } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface AccountContributionLimitProps {
  accountId: string;
}

export function AccountContributionLimit({ accountId }: AccountContributionLimitProps) {
  const { data: allLimits, isLoading } = useQuery<ContributionLimit[], Error>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMITS],
    queryFn: getContributionLimit,
  });

  const { data: progress, isLoading: isProgressLoading } = useQuery({
    queryKey: [QueryKeys.CONTRIBUTION_LIMIT_PROGRESS, accountId, new Date().getFullYear()],
    queryFn: () => getContributionProgress(accountId, new Date().getFullYear()),
  });

  if (isLoading || isProgressLoading) {
    return <AccountContributionLimit.Skeleton />;
  }

  const currentYear = new Date().getFullYear();
  const accountLimits =
    allLimits?.filter(
      (limit) => limit.accountIds?.includes(accountId) && limit.contributionYear === currentYear,
    ) || [];

  if (accountLimits.length === 0) {
    return (
      <Card className="pt-6">
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span>
                You've contributed{' '}
                <span className="font-semibold">
                  {formatAmount(progress?.amount || 0, progress?.currency || 'USD')}
                </span>{' '}
                in {currentYear}. This account has no contribution limit set.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {accountLimits.map((limit) => (
        <AccountContributionLimitItem key={limit.id} limit={limit} progress={progress} />
      ))}
    </div>
  );
}

function AccountContributionLimitItem({
  limit,
  progress,
}: {
  limit: ContributionLimit;
  progress: any;
}) {
  const progressValue = progress ? progress.amount : 0;
  const progressPercentageNumber =
    limit.limitAmount > 0 ? (progressValue / limit.limitAmount) * 100 : 0;
  const baseCurrency = progress?.currency || 'USD';
  const isOverLimit = progressPercentageNumber > 100;

  return (
    <Card className={`pt-6 ${isOverLimit ? 'border-destructive/20 bg-destructive/10' : ''}`}>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {isOverLimit ? (
              <span>
                You've contributed{' '}
                <span className="font-semibold text-destructive">
                  {formatAmount(progressValue, baseCurrency)}
                </span>{' '}
                in {limit.contributionYear}, which is over the{' '}
                <span className="font-semibold">
                  {formatAmount(limit.limitAmount, baseCurrency)}
                </span>{' '}
                limit.
              </span>
            ) : (
              <span>
                You've contributed{' '}
                <span className="font-semibold">{formatAmount(progressValue, baseCurrency)}</span>{' '}
                towards your{' '}
                <span className="font-semibold">
                  {formatAmount(limit.limitAmount, baseCurrency)}
                </span>{' '}
                limit for {limit.contributionYear}.
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
