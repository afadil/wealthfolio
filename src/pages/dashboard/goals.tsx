import { getGoals, getGoalsAllocation } from "@/commands/goal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAccounts } from "@/hooks/use-accounts";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useLatestValuations } from "@/hooks/use-latest-valuations";
import { calculateGoalProgress } from "@/lib/portfolio-helper";
import { Goal, GoalAllocation } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AmountDisplay, formatPercent } from "@wealthfolio/ui";
import { useMemo } from "react";

export function SavingGoals() {
  const { isBalanceHidden } = useBalancePrivacy();

  const { accounts, isLoading: isLoadingAccounts, isError: isErrorAccounts } = useAccounts();

  const accountIds = useMemo(() => accounts?.map((acc) => acc.id) ?? [], [accounts]);

  const {
    latestValuations,
    isLoading: isLoadingValuations,
    error: errorValuations,
  } = useLatestValuations(accountIds);

  const {
    data: goals,
    isLoading: isLoadingGoals,
    isError: isErrorGoals,
  } = useQuery<Goal[], Error>({
    queryKey: ["goals"],
    queryFn: getGoals,
  });

  const {
    data: allocations,
    isLoading: isLoadingAllocations,
    isError: isErrorAllocations,
  } = useQuery<GoalAllocation[], Error>({
    queryKey: ["goals_allocations"],
    queryFn: getGoalsAllocation,
  });

  const goalsProgress = useMemo(() => {
    if (!latestValuations || !goals || !allocations) {
      return undefined;
    }
    return calculateGoalProgress(latestValuations, goals, allocations);
  }, [latestValuations, goals, allocations]);

  const isLoading =
    isLoadingAccounts || isLoadingValuations || isLoadingGoals || isLoadingAllocations;
  const isError = isErrorAccounts || !!errorValuations || isErrorGoals || isErrorAllocations;

  if (isLoading) {
    return (
      <Card className="w-full border-0 bg-transparent shadow-none">
        <CardHeader className="py-2">
          <CardTitle className="text-md">Saving Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <Card className="w-full shadow-sm">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="w-full border-0 bg-transparent shadow-none">
        <CardHeader className="py-2">
          <CardTitle className="text-md">Saving Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <Card className="w-full shadow-sm">
            <CardContent className="pt-6">
              <div className="text-destructive flex flex-col items-center justify-center py-6 text-center">
                <Icons.AlertCircle className="mb-2 h-12 w-12" />
                <p className="text-sm">Could not load saving goals data.</p>
                <p className="text-xs">Please try again later.</p>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    );
  }

  if (!goalsProgress) {
    return (
      <Card className="w-full border-0 bg-transparent shadow-none">
        <CardHeader className="py-2">
          <CardTitle className="text-md">Saving Goals</CardTitle>
        </CardHeader>
        <CardContent>
          <Card className="w-full shadow-sm">
            <CardContent className="pt-6">
              {goals && goals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Icons.Goal className="text-muted-foreground mb-2 h-12 w-12" />
                  <p className="text-muted-foreground text-sm">No saving goals set</p>
                  <p className="text-muted-foreground text-xs">
                    Create a goal to start tracking your progress
                  </p>
                </div>
              ) : (
                <div className="text-muted-foreground flex flex-col items-center justify-center py-6 text-center">
                  <p className="text-sm">Goal data not yet available.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-4">
        <h2 className="text-md font-semibold">Saving Goals</h2>
        <Card className="w-full shadow-none">
          <CardContent className="px-4 pt-6">
            {goals && goals.length > 0 ? (
              [...goals]
                .sort((a, b) => a.targetAmount - b.targetAmount)
                .map((goal) => {
                  const progressData = goalsProgress.find((p) => p.name === goal.title);

                  const currentProgress = progressData?.progress ?? 0;
                  const currentValue = progressData?.currentValue ?? 0;
                  const currency =
                    progressData?.currency ?? latestValuations?.[0]?.baseCurrency ?? "USD";

                  return (
                    <Tooltip key={goal.id}>
                      <TooltipTrigger asChild>
                        <div className="mb-4 cursor-help items-center">
                          <CardDescription className="text-muted-foreground mb-2 flex items-center text-sm font-light">
                            {goal.title}
                            {currentProgress >= 100 ? (
                              <Icons.CheckCircle className="text-success ml-1 h-4 w-4" />
                            ) : null}
                          </CardDescription>

                          <Progress
                            value={currentProgress * 100}
                            className="[&>div]:bg-success h-2.5 w-full"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="space-y-2">
                        <h3 className="text-md text-muted-foreground font-bold">{goal.title}</h3>
                        <ul className="list-inside list-disc text-xs">
                          <li>
                            Progress: <b>{formatPercent(currentProgress)}</b>
                          </li>
                          <li>
                            Current Value:{" "}
                            <b>
                              <AmountDisplay
                                value={currentValue}
                                currency={currency}
                                isHidden={isBalanceHidden}
                              />
                            </b>
                          </li>
                          <li>
                            Target Value:{" "}
                            <b>
                              <AmountDisplay
                                value={goal.targetAmount}
                                currency={currency}
                                isHidden={isBalanceHidden}
                              />
                            </b>
                          </li>
                        </ul>
                        {!progressData && (
                          <p className="text-muted-foreground text-xs italic">
                            Progress calculation pending or not applicable.
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Icons.Goal className="text-muted-foreground mb-2 h-12 w-12" />
                <p className="text-muted-foreground text-sm">No saving goals set</p>
                <p className="text-muted-foreground text-xs">
                  Create a goal to start tracking your progress
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

export default SavingGoals;
