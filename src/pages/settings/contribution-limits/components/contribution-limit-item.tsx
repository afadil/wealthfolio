import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ContributionLimitOperations } from './contribution-limit-operations';
import { Icons } from '@/components/icons';
import { formatAmount } from '@/lib/utils';
import { AccountSelection } from './account-selection';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Account, ContributionLimit } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useContributionLimitProgress } from '../use-contribution-limit-mutations';

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

  const { data: progress, isLoading } = useContributionLimitProgress(limit.id);

  const progressValue = progress ? progress.total : 0;
  const progressPercentageNumber =
    limit.limitAmount > 0 ? (progressValue / limit.limitAmount) * 100 : 0;
  const baseCurrency = progress?.baseCurrency || 'USD';
  const isOverLimit = progressPercentageNumber > 100;
  const isComplete = progressPercentageNumber === 100;
  const remainingAmount = limit.limitAmount - progressValue;
  const overLimitAmount = isOverLimit ? Math.abs(remainingAmount) : 0;
  const today = new Date();
  const endDate = limit.endDate ? new Date(limit.endDate) : null;
  const daysRemaining = endDate
    ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card
      className={`mb-4 ${progressPercentageNumber === 100 ? 'border-success/20 bg-success/10 shadow-sm' : isOverLimit ? 'border-destructive/20 bg-destructive/10 shadow-sm' : ''} last:mb-0`}
    >
      <CardHeader className="cursor-pointer pb-3" onClick={toggleExpanded}>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center">
              {isComplete && <Icons.CheckCircle className="mr-2 h-5 w-5 text-success" />}
              {isOverLimit && <Icons.AlertTriangle className="mr-2 h-5 w-5 text-destructive" />}
              <CardTitle className="text-lg">{limit.groupName}</CardTitle>
            </div>

            {limit.startDate && limit.endDate && (
              <div className="flex items-center text-xs text-muted-foreground">
                <Icons.Calendar className="mr-1 h-3 w-3" />
                <span>
                  {new Date(limit.startDate).toLocaleDateString()} → {new Date(limit.endDate).toLocaleDateString()}
                </span>
                {daysRemaining !== null && daysRemaining <= 60 && (
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                      daysRemaining <= 30
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {daysRemaining} days left
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {!isLoading && (
              <div className="flex flex-col items-end">
                <div className="flex items-baseline space-x-1">
                  <span
                    className={`text-lg font-bold ${
                      isOverLimit ? 'text-destructive' : isComplete ? 'text-success' : ''
                    }`}
                  >
                    {isComplete
                      ? formatAmount(limit.limitAmount, baseCurrency)
                      : isOverLimit
                        ? `${formatAmount(progressValue, baseCurrency)}`
                        : `${formatAmount(progressValue, baseCurrency)}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {formatAmount(limit.limitAmount, baseCurrency)}
                  </span>
                </div>
                <span className="text-right text-xs text-muted-foreground">
                  {isComplete
                    ? 'completed'
                    : isOverLimit
                      ? `+${formatAmount(overLimitAmount, baseCurrency)} over limit`
                      : `${limit.contributionYear}`}
                </span>
              </div>
            )}

            <div className="flex items-center space-x-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleExpanded}>
                <Icons.ChevronDown
                  className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
              </Button>

              <ContributionLimitOperations limit={limit} onEdit={onEdit} onDelete={onDelete} />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-4 w-full" />
        ) : (
          <Progress
            value={progressPercentageNumber > 100 ? 100 : progressPercentageNumber}
            className={`w-full ${isOverLimit ? 'bg-destructive/20' : ''}`}
            showPercentage
          />
        )}
        {isExpanded && (
          <div className="mt-4 border-t pt-4">
            <AccountSelection
              limit={limit}
              accounts={accounts}
              deposits={progress}
              isLoading={isLoading}
            />
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
