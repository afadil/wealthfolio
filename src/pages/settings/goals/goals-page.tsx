import { useState } from 'react';
import { EmptyPlaceholder } from '@/components/empty-placeholder';
import { Separator } from '@/components/ui/separator';
import { GoalItem } from './components/goal-item';
import { GoalEditModal } from './components/goal-edit-modal';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { Goal, GoalAllocation } from '@/lib/types';
import { SettingsHeader } from '../header';
import { getGoals, getGoalsAllocation } from '@/commands/goal';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import GoalsAllocations from './components/goal-allocations';
import { useAccounts } from '@/hooks/use-accounts';
import { QueryKeys } from '@/lib/query-keys';
import { useGoalMutations } from './use-goal-mutations';

const SettingsGoalsPage = () => {
  const { data: goals, isLoading } = useQuery<Goal[], Error>({
    queryKey: [QueryKeys.GOALS],
    queryFn: getGoals,
  });

  const { data: allocations } = useQuery<GoalAllocation[], Error>({
    queryKey: [QueryKeys.GOALS_ALLOCATIONS],
    queryFn: getGoalsAllocation,
  });

  const { accounts } = useAccounts();

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);

  const { deleteGoalMutation, saveAllocationsMutation } = useGoalMutations();

  const handleAddGoal = () => {
    setSelectedGoal(null);
    setVisibleModal(true);
  };

  const handleEditGoal = (goal: Goal) => {
    setSelectedGoal(goal);
    setVisibleModal(true);
  };

  const handleDeleteGoal = (goal: Goal) => {
    deleteGoalMutation.mutate(goal.id);
  };

  const handleAddAllocation = (allocationData: GoalAllocation[]) => {
    saveAllocationsMutation.mutate(allocationData);
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader heading="Goals" text=" Manage your investment and saving goals.">
          <Button onClick={() => handleAddGoal()}>
            <Icons.PlusCircle className="mr-2 h-4 w-4" />
            Add goal
          </Button>
        </SettingsHeader>
        <Separator />
        <div className="mx-auto w-full pt-8">
          {goals?.length ? (
            <>
              <h3 className="p-2 text-xl font-bold">Goals</h3>

              <div className="divide-y divide-border rounded-md border">
                {goals.map((goal: Goal) => (
                  <GoalItem
                    key={goal.id}
                    goal={goal}
                    onEdit={handleEditGoal}
                    onDelete={handleDeleteGoal}
                  />
                ))}
              </div>
              <h3 className="p-2 pt-12 text-xl font-bold">Allocations</h3>
              <h5 className="p-2 pb-4 pt-0 text-sm font-light text-muted-foreground">
                Click on a cell to specify the percentage of each account's allocation to your
                goals.
              </h5>
              <GoalsAllocations
                goals={goals}
                existingAllocations={allocations || []}
                accounts={accounts || []}
                onSubmit={handleAddAllocation}
              />
            </>
          ) : (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="Goal" />
              <EmptyPlaceholder.Title>No goal added!</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                You don&apos;t have any goal yet. Start adding your investment goals.
              </EmptyPlaceholder.Description>
              <Button onClick={() => handleAddGoal()}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add an goal
              </Button>
            </EmptyPlaceholder>
          )}
        </div>
      </div>
      <GoalEditModal
        goal={selectedGoal}
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
      />
    </>
  );
};

export default SettingsGoalsPage;
