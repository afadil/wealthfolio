import type { Portfolio } from '@/lib/types';
import { Badge, Skeleton } from '@wealthfolio/ui';
import { PortfolioOperations } from './portfolio-operations';

export interface PortfolioItemProps {
  portfolio: Portfolio;
  onEdit: (portfolio: Portfolio) => void;
  onDelete: (portfolio: Portfolio) => void;
}

export function PortfolioItem({ portfolio, onEdit, onDelete }: PortfolioItemProps) {
  const accountCount = portfolio.accountIds.length;

  return (
    <div className="flex items-center justify-between p-4">
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{portfolio.name}</span>
          <Badge variant="secondary" className="text-xs">
            {accountCount} {accountCount === 1 ? 'account' : 'accounts'}
          </Badge>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">
            Created {new Date(portfolio.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <PortfolioOperations portfolio={portfolio} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

PortfolioItem.Skeleton = function PortfolioItemSkeleton() {
  return (
    <div className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
};
