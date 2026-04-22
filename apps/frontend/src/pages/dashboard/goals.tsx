import { getGoals } from "@/adapters";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Progress } from "@wealthfolio/ui/components/ui/progress";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import type { Goal } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AmountDisplay, formatPercent } from "@wealthfolio/ui";
import { Link } from "react-router-dom";

const MAX_DISPLAYED_GOALS = 5;

function goalTime(goal: Goal) {
  const date = goal.targetDate ?? goal.projectedCompletionDate;
  if (!date) return Infinity;
  const time = new Date(date).getTime();
  return Number.isFinite(time) ? time : Infinity;
}

function goalTarget(goal: Goal) {
  return goal.summaryTargetAmount ?? goal.targetAmount ?? 0;
}

function sortDashboardGoals(a: Goal, b: Goal) {
  const dateDiff = goalTime(a) - goalTime(b);
  if (dateDiff !== 0) return dateDiff;

  const targetDiff = goalTarget(b) - goalTarget(a);
  if (targetDiff !== 0) return targetDiff;

  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function statusDotClass(status: Goal["statusHealth"]) {
  if (status === "off_track") return "bg-destructive";
  if (status === "at_risk") return "bg-amber-500";
  if (status === "on_track") return "bg-success";
  return "bg-muted-foreground/35";
}

export function SavingGoals() {
  const { isBalanceHidden } = useBalancePrivacy();

  const { data: goals, isLoading } = useQuery<Goal[], Error>({
    queryKey: ["goals"],
    queryFn: getGoals,
  });

  if (isLoading) {
    return (
      <Card className="w-full border-0 bg-transparent shadow-none">
        <CardHeader className="py-2">
          <CardTitle className="text-md">Goals</CardTitle>
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

  const activeGoals = (goals ?? [])
    .filter((g) => g.statusLifecycle === "active")
    .sort(sortDashboardGoals);
  const visibleGoals = activeGoals.slice(0, MAX_DISPLAYED_GOALS);
  const hiddenGoalsCount = Math.max(0, activeGoals.length - visibleGoals.length);

  if (activeGoals.length === 0) {
    return (
      <div className="pb-4">
        <div className="flex items-center justify-between py-2">
          <h2 className="text-md font-semibold">Goals</h2>
          <Link
            to="/goals"
            className="text-muted-foreground hover:bg-success/10 inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors"
          >
            View All
            <Icons.ChevronRight className="ml-1 h-3 w-3" />
          </Link>
        </div>
        <Card className="border-border/50 bg-success/10 shadow-xs w-full">
          <CardContent className="px-4 py-6">
            <div className="text-center">
              <p className="text-sm">No goals set.</p>
              <Link
                to="/goals/new"
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
    <div className="pb-4">
      <div className="flex items-center justify-between py-2">
        <h2 className="text-md font-semibold">Goals</h2>
        <Link
          to="/goals"
          className="text-muted-foreground hover:bg-success/10 inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors"
        >
          View All
          <Icons.ChevronRight className="ml-1 h-3 w-3" />
        </Link>
      </div>
      <Card className="shadow-xs w-full">
        <CardContent className="bg-transparent px-4 pb-2 pt-6">
          {visibleGoals.map((goal) => {
            const progress = goal.summaryProgress ?? 0;
            const currentValue = goal.summaryCurrentValue ?? 0;
            const target = goal.summaryTargetAmount ?? goal.targetAmount ?? 0;
            const currency = goal.currency ?? "USD";

            return (
              <Link key={goal.id} to={`/goals/${goal.id}`} className="block">
                <div className="mb-4 cursor-pointer items-center">
                  <CardDescription className="text-muted-foreground mb-2 flex items-center text-sm font-light">
                    <span
                      className={`mr-2 h-2 w-2 shrink-0 rounded-full ${statusDotClass(goal.statusHealth)}`}
                    />
                    {goal.title}
                    {progress >= 1 ? (
                      <Icons.CheckCircle className="text-success ml-1 h-4 w-4" />
                    ) : null}
                  </CardDescription>

                  <Progress
                    value={Math.min(progress * 100, 100)}
                    className="[&>div]:bg-success h-2.5 w-full"
                  />

                  <div className="text-muted-foreground mt-1 flex justify-between text-xs">
                    <span>
                      <AmountDisplay
                        value={currentValue}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    </span>
                    <span>
                      {formatPercent(progress)} of{" "}
                      <AmountDisplay
                        value={target}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
          {hiddenGoalsCount > 0 && (
            <Link
              to="/goals"
              className="border-border text-muted-foreground hover:bg-muted/50 flex items-center justify-between border-t py-3 text-sm transition-colors"
            >
              <span>
                +{hiddenGoalsCount} more {hiddenGoalsCount === 1 ? "goal" : "goals"}
              </span>
              <Icons.ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SavingGoals;
