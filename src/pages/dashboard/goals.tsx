import { getGoalsWithContributions } from "@/commands/goal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettings } from "@/hooks/use-settings";
import { calculateGoalProgressFromContributions } from "@/lib/portfolio-helper";
import { QueryKeys } from "@/lib/query-keys";
import { GoalWithContributions } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AmountDisplay, formatPercent } from "@wealthfolio/ui";
import { useMemo } from "react";
import { Link } from "react-router-dom";

export function SavingGoals() {
  const { isBalanceHidden } = useBalancePrivacy();
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const {
    data: goalsWithContributions,
    isLoading,
    isError,
  } = useQuery<GoalWithContributions[], Error>({
    queryKey: [QueryKeys.GOALS_WITH_CONTRIBUTIONS],
    queryFn: getGoalsWithContributions,
  });

  const goalsProgress = useMemo(() => {
    if (!goalsWithContributions) {
      return undefined;
    }
    return calculateGoalProgressFromContributions(goalsWithContributions, baseCurrency);
  }, [goalsWithContributions, baseCurrency]);

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

  const hasGoals = goalsWithContributions && goalsWithContributions.length > 0;

  if (!hasGoals) {
    return (
      <div className="flex flex-wrap gap-4 pb-4">
        <h2 className="text-md font-semibold">Saving Goals</h2>
        <Card className="border-border/50 bg-success/10 w-full shadow-xs">
          <CardContent className="px-4 py-6">
            <div className="text-center">
              <p className="text-sm">No saving goals set.</p>
              <Link
                to="/settings/goals"
                className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
              >
                Create your first goal
                <Icons.ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4 pb-4">
      <h2 className="text-md font-semibold">Saving Goals</h2>
      <Card className="w-full shadow-xs">
        <CardContent className="bg-transparent px-4 pt-6">
          {goalsProgress?.slice(0, 5).map((progressData) => {
            const gwc = goalsWithContributions?.find((g) => g.goal.title === progressData.name);

            const currentProgress = progressData.progress;
            const currentValue = progressData.currentValue;
            const targetValue = progressData.targetValue;
            const hasAtRisk = progressData.hasAtRiskContributions;
            const currency = progressData.currency;

            return (
              <Tooltip key={progressData.name}>
                <TooltipTrigger asChild>
                  <div className="mb-4 cursor-help items-center">
                    <div className="mb-2 flex items-center justify-between">
                      <CardDescription className="text-muted-foreground flex items-center text-sm font-light">
                        {progressData.name}
                        {currentProgress >= 1 ? (
                          <Icons.CheckCircle className="text-success ml-1 h-4 w-4" />
                        ) : null}
                        {hasAtRisk && (
                          <Icons.AlertTriangle className="text-destructive ml-1 h-4 w-4" />
                        )}
                      </CardDescription>
                      <span className="text-muted-foreground text-sm">
                        <AmountDisplay
                          value={currentValue}
                          currency={currency}
                          isHidden={isBalanceHidden}
                        />
                        {" / "}
                        <AmountDisplay
                          value={targetValue}
                          currency={currency}
                          isHidden={isBalanceHidden}
                        />{" "}
                        ({formatPercent(currentProgress)})
                      </span>
                    </div>

                    <Progress
                      value={Math.min(currentProgress * 100, 100)}
                      className="[&>div]:bg-success h-2.5 w-full"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="space-y-2">
                  <h3 className="text-md text-muted-foreground font-bold">{progressData.name}</h3>
                  <ul className="list-inside list-disc text-xs">
                    <li>
                      Progress: <b>{formatPercent(currentProgress)}</b>
                    </li>
                    <li>
                      Contributed:{" "}
                      <b>
                        <AmountDisplay
                          value={currentValue}
                          currency={currency}
                          isHidden={isBalanceHidden}
                        />
                      </b>
                    </li>
                    <li>
                      Target:{" "}
                      <b>
                        <AmountDisplay
                          value={targetValue}
                          currency={currency}
                          isHidden={isBalanceHidden}
                        />
                      </b>
                    </li>
                    {gwc && (
                      <li>
                        Contributions: <b>{gwc.contributions.length}</b>
                      </li>
                    )}
                  </ul>
                  {hasAtRisk && (
                    <p className="text-destructive text-xs italic">
                      Some contributions exceed available account cash
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default SavingGoals;
