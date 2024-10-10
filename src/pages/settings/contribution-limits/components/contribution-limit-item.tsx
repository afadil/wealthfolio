import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ContributionLimitOperations } from './contribution-limit-operations';
import type { ContributionLimits } from '@/lib/types';
import { Icons } from '@/components/icons';
import { formatAmount } from '@/lib/utils';
import { AccountSelection } from './account-selection';
import { Button } from '@/components/ui/button';

export interface ContributionLimitItemProps {
  limit: ContributionLimits;
  onEdit: (limit: ContributionLimits) => void;
  onDelete: (limit: ContributionLimits) => void;
}

export function ContributionLimitItem({ limit, onEdit, onDelete }: ContributionLimitItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="grid gap-1">
          <h3 className="font-semibold"> {limit.groupName}</h3>
          <p className="text-sm text-muted-foreground">Year: {limit.contributionYear}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <span className="text-md">{formatAmount(limit.limitAmount, 'USD')}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
            <Icons.ChevronDown
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </Button>
          <ContributionLimitOperations limit={limit} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
      {isExpanded && (
        <div className="border-t bg-card p-4">
          <AccountSelection limitId={limit.id} />
        </div>
      )}
    </div>
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
