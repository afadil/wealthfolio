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
    .filter((g) => !g.isArchived && g.statusLifecycle !== "archived")
    .sort(
      (a, b) => b.priority - a.priority || (a.targetDate ?? "").localeCompare(b.targetDate ?? ""),
    );

  if (activeGoals.length === 0) {
    return (
      <div className="flex flex-wrap gap-4 pb-4">
        <h2 className="text-md font-semibold">Goals</h2>
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
    <div className="flex flex-wrap gap-4 pb-4">
      <h2 className="text-md font-semibold">Goals</h2>
      <Card className="shadow-xs w-full">
        <CardContent className="bg-transparent px-4 pt-6">
          {activeGoals.slice(0, 5).map((goal) => {
            const progress = goal.progressCached ?? 0;
            const currentValue = goal.currentValueCached ?? 0;
            const target = goal.targetAmountCached ?? goal.targetAmount ?? 0;
            const currency = goal.currency ?? "USD";

            return (
              <Link key={goal.id} to={`/goals/${goal.id}`} className="block">
                <div className="mb-4 cursor-pointer items-center">
                  <CardDescription className="text-muted-foreground mb-2 flex items-center text-sm font-light">
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
        </CardContent>
      </Card>
    </div>
  );
}

export default SavingGoals;
