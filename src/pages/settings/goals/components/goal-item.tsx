import { Skeleton } from '@/components/ui/skeleton';
import { GoalOperations } from './goal-operations';
import type { Goal } from '@/lib/types';
import { Icons } from '@/components/icons';
import { formatAmount } from '@/lib/utils';

export interface GoalItemProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

export function GoalItem({ goal, onEdit, onDelete }: GoalItemProps) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="grid gap-1">
        <h3 className="font-semibold">{goal.title}</h3>
        <div>
          <p className="text-sm text-muted-foreground">{goal.description}</p>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center">
          {goal.isAchieved ? (
            <Icons.CheckCircle className="h5 mr-1 text-green-600" />
          ) : (
            <Icons.Goal className="mr-1 h-5 text-green-600" />
          )}
          <span className="text-md">{formatAmount(goal.targetAmount, 'USD', false)}</span>
        </div>

        <GoalOperations goal={goal} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

GoalItem.Skeleton = function GoalItemSkeleton() {
  return (
    <div className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
};
