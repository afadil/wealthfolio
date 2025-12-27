import { getGoalsWithContributions, getAccountFreeCash } from "@/commands/goal";
import { useAccounts } from "@/hooks/use-accounts";
import { QueryKeys } from "@/lib/query-keys";
import type { Goal, GoalWithContributions, AccountFreeCash } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyPlaceholder, Icons, Separator, Skeleton } from "@wealthfolio/ui";
import { useState, useMemo } from "react";
import { SettingsHeader } from "../settings-header";
import GoalContributions from "./components/goal-contributions";
import { GoalEditModal } from "./components/goal-edit-modal";
import { useGoalMutations } from "./use-goal-mutations";

const SettingsGoalsPage = () => {
  const { data: goalsWithContributions, isLoading: isLoadingContributions } = useQuery<
    GoalWithContributions[],
    Error
  >({
    queryKey: [QueryKeys.GOALS_WITH_CONTRIBUTIONS],
    queryFn: getGoalsWithContributions,
  });

  const { accounts } = useAccounts();

  // Get account IDs for fetching free cash
  const accountIds = useMemo(() => accounts?.map((a) => a.id) ?? [], [accounts]);

  const { data: freeCashAccounts = [], isLoading: isLoadingFreeCash } = useQuery<
    AccountFreeCash[],
    Error
  >({
    queryKey: [QueryKeys.ACCOUNT_FREE_CASH, accountIds],
    queryFn: () => getAccountFreeCash(accountIds),
    enabled: accountIds.length > 0,
  });

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const { deleteGoalMutation, addContributionMutation, removeContributionMutation } =
    useGoalMutations();

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

  const isLoading = isLoadingContributions || isLoadingFreeCash;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  // Show all goals (both achieved and non-achieved)
  const allGoalsWithContributions = goalsWithContributions ?? [];
  const hasGoals = allGoalsWithContributions.length > 0;

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader heading="Goals" text="Manage your saving goals and contributions.">
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
        <div className="w-full pt-4">
          {hasGoals ? (
            <GoalContributions
              goalsWithContributions={allGoalsWithContributions}
              freeCashAccounts={freeCashAccounts}
              onAddContribution={(contribution) => addContributionMutation.mutate(contribution)}
              onRemoveContribution={(contributionId) =>
                removeContributionMutation.mutate(contributionId)
              }
              onEditGoal={handleEditGoal}
              onDeleteGoal={handleDeleteGoal}
              isAdding={addContributionMutation.isPending}
              isRemoving={removeContributionMutation.isPending}
            />
          ) : (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="Goal" />
              <EmptyPlaceholder.Title>No goals added!</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                You don&apos;t have any goals yet. Start adding your saving goals.
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
