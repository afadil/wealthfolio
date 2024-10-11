import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ContributionLimitOperations } from './contribution-limit-operations';
import { Icons } from '@/components/icons';
import { formatAmount } from '@/lib/utils';
import { AccountSelection } from './account-selection';
import { Button } from '@/components/ui/button';
import { getContributionProgress } from '@/commands/contribution-limits';
import { Progress } from '@/components/ui/progress';
import { useQuery } from '@tanstack/react-query';
import { Account, ContributionLimit } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryKeys } from '@/lib/query-keys';

type ContributionLimitItemProps = {
  limit: ContributionLimit;
  accounts: Account[];
  onEdit: (limit: ContributionLimit) => void;
  onDelete: (limit: ContributionLimit) => void;
};

export function ContributionLimitItem({
  limit,
  accounts,
  onEdit,
  onDelete,
}: ContributionLimitItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!limit.accountIds || limit.accountIds.length === 0) {
      setIsExpanded(true);
    }
  }, []);

  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const { data: progress, isLoading } = useQuery({
    queryKey: [QueryKeys.CONTRIBUTION_LIMIT_PROGRESS, limit.id, limit.contributionYear],
    queryFn: () => getContributionProgress(limit.id, limit.contributionYear),
  });

  const progressValue = progress ? progress.amount : 0;
  const progressPercentageNumber =
    limit.limitAmount > 0 ? (progressValue / limit.limitAmount) * 100 : 0;
  const baseCurrency = progress?.currency || 'USD';
  const isOverLimit = progressPercentageNumber > 100;

  return (
    <Card
      className={`mb-4 ${progressPercentageNumber === 100 ? 'bg-success/10' : isOverLimit ? 'border-destructive/20 bg-destructive/10' : ''} last:mb-0`}
    >
      <CardHeader className="cursor-pointer" onClick={toggleExpanded}>
        <div className="flex items-center justify-between">
          <div className="grid gap-1">
            <div className="flex items-center">
              <CardTitle className="mr-2 text-lg">{limit.groupName}</CardTitle>
              {isOverLimit && <Icons.AlertTriangle className="h-4 w-4 text-destructive" />}
            </div>
            <CardDescription>
              <div className="text-xs text-muted-foreground">
                {!isLoading && progress ? (
                  <>
                    You have contributed{' '}
                    <span className={`font-semibold ${isOverLimit ? 'text-destructive' : ''}`}>
                      {formatAmount(progress.amount, baseCurrency)}
                    </span>{' '}
                    so far in <span className="font-semibold">{limit.contributionYear}</span>.
                  </>
                ) : (
                  ''
                )}
              </div>
            </CardDescription>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex flex-col items-end">
              <span className="text-md font-semibold leading-none tracking-tight">
                {formatAmount(limit.limitAmount, baseCurrency)}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleExpanded}>
              <Icons.ChevronDown
                className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            </Button>
            <ContributionLimitOperations limit={limit} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-4 w-full" />
        ) : (
          <Progress value={progressPercentageNumber} className="w-full" showPercentage />
        )}
        {isExpanded && (
          <div className="mt-4 border-t pt-4">
            <AccountSelection limit={limit} accounts={accounts} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

ContributionLimitItem.Skeleton = function ContributionLimitItemSkeleton() {
  return (
    <div className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
};
