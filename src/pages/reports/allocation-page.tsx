import { getGoalsWithContributions, getAccountFreeCash } from "@/commands/goal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContributionForm, ContributionList } from "@/components/goals";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useAccounts } from "@/hooks/use-accounts";
import { QueryKeys } from "@/lib/query-keys";
import type { AccountFreeCash, GoalWithContributions } from "@/lib/types";
import { useGoalMutations } from "@/pages/settings/goals/use-goal-mutations";
import { useQuery } from "@tanstack/react-query";
import { AmountDisplay, formatPercent, Icons, ToggleGroup, ToggleGroupItem } from "@wealthfolio/ui";
import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { GoalSourcesChart } from "./components/goal-sources-chart";
import { ContributionsTimelineChart } from "./components/contributions-timeline-chart";
import { ContributionsTable } from "./components/contributions-table";

interface AllocationPageProps {
  renderActions?: (actions: React.ReactNode) => void;
}

export default function AllocationPage({ renderActions }: AllocationPageProps) {
  const { isBalanceHidden } = useBalancePrivacy();
  const { accounts } = useAccounts();
  const [isAddingContribution, setIsAddingContribution] = useState(false);
  const { addContributionMutation, removeContributionMutation } = useGoalMutations();

  const {
    data: goalsWithContributions,
    isLoading,
    isError,
  } = useQuery<GoalWithContributions[], Error>({
    queryKey: [QueryKeys.GOALS_WITH_CONTRIBUTIONS],
    queryFn: getGoalsWithContributions,
  });

  const accountIds = useMemo(() => accounts?.map((a) => a.id) ?? [], [accounts]);

  const { data: freeCashAccounts = [] } = useQuery<AccountFreeCash[], Error>({
    queryKey: [QueryKeys.ACCOUNT_FREE_CASH, accountIds],
    queryFn: () => getAccountFreeCash(accountIds),
    enabled: accountIds.length > 0,
  });

  const sortedGoals = useMemo(() => {
    if (!goalsWithContributions) return [];
    return [...goalsWithContributions].sort((a, b) => b.goal.targetAmount - a.goal.targetAmount);
  }, [goalsWithContributions]);

  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (sortedGoals.length > 0 && !selectedGoalId) {
      setSelectedGoalId(sortedGoals[0].goal.id);
    }
  }, [sortedGoals, selectedGoalId]);

  useEffect(() => {
    if (renderActions && sortedGoals.length > 0) {
      renderActions(
        <ToggleGroup
          type="single"
          value={selectedGoalId}
          onValueChange={(value) => value && setSelectedGoalId(value)}
          className="flex-wrap justify-start"
        >
          {sortedGoals.map((gwc) => (
            <ToggleGroupItem key={gwc.goal.id} value={gwc.goal.id} className="px-4">
              {gwc.goal.title}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>,
      );
    }
    return () => {
      if (renderActions) {
        renderActions(null);
      }
    };
  }, [renderActions, sortedGoals, selectedGoalId]);

  const selectedGoal = useMemo(() => {
    return goalsWithContributions?.find((g) => g.goal.id === selectedGoalId);
  }, [goalsWithContributions, selectedGoalId]);

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
        <Icons.AlertCircle className="text-destructive mb-4 h-12 w-12" />
        <p className="text-muted-foreground">Could not load goals data. Please try again later.</p>
      </div>
    );
  }

  if (!goalsWithContributions || goalsWithContributions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
        <Icons.Goal className="text-muted-foreground mb-4 h-12 w-12" />
        <h3 className="mb-2 text-lg font-semibold">No Savings Goals</h3>
        <p className="text-muted-foreground mb-4 text-center">
          Create your first savings goal to see allocation reports.
        </p>
        <Link
          to="/settings/goals"
          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          Create a goal
          <Icons.ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (!selectedGoal) {
    return null;
  }

  const currency = selectedGoal.contributions[0]?.accountCurrency ?? "USD";

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Contributed</CardDescription>
            <CardTitle className="text-2xl">
              <AmountDisplay
                value={selectedGoal.totalContributed}
                currency={currency}
                isHidden={isBalanceHidden}
              />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Target Amount</CardDescription>
            <CardTitle className="text-2xl">
              <AmountDisplay
                value={selectedGoal.goal.targetAmount}
                currency={currency}
                isHidden={isBalanceHidden}
              />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Progress</CardDescription>
            <CardTitle className="text-2xl">
              {formatPercent(Math.min(selectedGoal.progress, 1))}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-success h-full transition-all"
                style={{ width: `${Math.min(selectedGoal.progress * 100, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contribution Management */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Manage Contributions</CardTitle>
              <CardDescription>Add or remove cash allocations for this goal</CardDescription>
            </div>
            {!isAddingContribution && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddingContribution(true)}
              >
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add Contribution
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isAddingContribution && (
            <div className="bg-muted/50 mb-4 rounded-md border p-4">
              <ContributionForm
                goalId={selectedGoal.goal.id}
                freeCashAccounts={freeCashAccounts}
                onSubmit={(contribution) => {
                  addContributionMutation.mutate(contribution);
                  setIsAddingContribution(false);
                }}
                onCancel={() => setIsAddingContribution(false)}
                isSubmitting={addContributionMutation.isPending}
              />
            </div>
          )}
          <ContributionList
            contributions={selectedGoal.contributions}
            onRemove={(id) => removeContributionMutation.mutate(id)}
            isRemoving={removeContributionMutation.isPending}
            emptyMessage="No contributions yet. Add your first contribution above."
          />
        </CardContent>
      </Card>

      {selectedGoal.contributions.length > 0 && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <GoalSourcesChart
              contributions={selectedGoal.contributions}
              isBalanceHidden={isBalanceHidden}
            />
            <ContributionsTable
              contributions={selectedGoal.contributions}
              isBalanceHidden={isBalanceHidden}
            />
          </div>
          <ContributionsTimelineChart
            contributions={selectedGoal.contributions}
            targetAmount={selectedGoal.goal.targetAmount}
            isBalanceHidden={isBalanceHidden}
          />
        </>
      )}
    </div>
  );
}
