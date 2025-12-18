import { getGoalsWithContributions } from "@/commands/goal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { QueryKeys } from "@/lib/query-keys";
import type { GoalWithContributions } from "@/lib/types";
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

  const {
    data: goalsWithContributions,
    isLoading,
    isError,
  } = useQuery<GoalWithContributions[], Error>({
    queryKey: [QueryKeys.GOALS_WITH_CONTRIBUTIONS],
    queryFn: getGoalsWithContributions,
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

      {selectedGoal.contributions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icons.Wallet className="text-muted-foreground mb-4 h-12 w-12" />
            <h3 className="mb-2 text-lg font-semibold">No Contributions Yet</h3>
            <p className="text-muted-foreground mb-4 text-center">
              Add your first contribution to start tracking progress.
            </p>
            <Link
              to="/settings/goals"
              className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
            >
              Add contribution
              <Icons.ChevronRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
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
