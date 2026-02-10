import { getGoals, getGoalsAllocation } from "@/adapters";
import { useAccounts } from "@/hooks/use-accounts";
import { QueryKeys } from "@/lib/query-keys";
import type { Goal, GoalAllocation } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyPlaceholder, Icons, Separator, Skeleton } from "@wealthfolio/ui";
import { useState } from "react";
import { SettingsHeader } from "../settings-header";
import GoalsAllocations from "./components/goal-allocations";
import { GoalEditModal } from "./components/goal-edit-modal";
import { GoalItem } from "./components/goal-item";
import { useGoalMutations } from "./use-goal-mutations";

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
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

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
          <>
            <Button
              size="icon"
              className="sm:hidden"
              onClick={() => handleAddGoal()}
              aria-label="Add goal"
            >
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button className="hidden sm:inline-flex" onClick={() => handleAddGoal()}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add goal
            </Button>
          </>
        </SettingsHeader>
        <Separator />
        <div className="w-full pt-8">
          {goals?.length ? (
            <>
              <h3 className="p-2 text-xl font-bold">Goals</h3>

              <div className="divide-border divide-y rounded-md border">
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
              <h5 className="text-muted-foreground p-2 pb-4 pt-0 text-sm font-light">
                Click on a cell to specify the percentage of each account&apos;s allocation to your
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
              <EmptyPlaceholder.Title>No goals added!</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                You don&apos;t have any goals yet. Start adding your investment goals.
              </EmptyPlaceholder.Description>
              <Button onClick={() => handleAddGoal()}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add a goal
              </Button>
            </EmptyPlaceholder>
          )}
        </div>
      </div>
      <GoalEditModal
        goal={selectedGoal || undefined}
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
      />
    </>
  );
};

export default SettingsGoalsPage;
