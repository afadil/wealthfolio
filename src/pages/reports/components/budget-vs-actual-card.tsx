import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { formatAmount, formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import type { BudgetVsActual } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BudgetVsActualCardProps {
  budgetData: BudgetVsActual | null | undefined;
  currency: string;
  isHidden: boolean;
  isLoading?: boolean;
}

export function BudgetVsActualCard({
  budgetData,
  currency,
  isHidden,
  isLoading,
}: BudgetVsActualCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Budget vs Actual</CardTitle>
          <Icons.Goal className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="flex h-[120px] items-center justify-center">
          <Icons.Spinner className="text-muted-foreground h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!budgetData || budgetData.spending.budgeted === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Budget vs Actual</CardTitle>
          <Icons.Goal className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="flex h-[120px] flex-col items-center justify-center">
          <Icons.Wallet className="text-muted-foreground mb-2 h-8 w-8" />
          <p className="text-muted-foreground text-sm">No budget set</p>
          <a
            href="/settings/budget"
            className="text-primary mt-1 text-xs underline-offset-4 hover:underline"
          >
            Set up your budget
          </a>
        </CardContent>
      </Card>
    );
  }

  const { spending } = budgetData;
  const isOverBudget = spending.actual > spending.budgeted;
  const progressPercent = Math.min(spending.percentUsed, 100);

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return "bg-destructive";
    if (percent >= 80) return "bg-warning";
    return "bg-success";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Budget vs Actual</CardTitle>
        <Icons.Target className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Spending</span>
            <div className="flex items-center gap-2">
              <span className={cn("font-medium", isOverBudget && "text-destructive")}>
                <PrivacyAmount value={spending.actual} currency={currency} />
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">
                <PrivacyAmount value={spending.budgeted} currency={currency} />
              </span>
            </div>
          </div>
          <div className="relative">
            <Progress value={progressPercent} className="h-2" />
            <div
              className={cn(
                "absolute left-0 top-0 h-2 rounded-full transition-all",
                getProgressColor(spending.percentUsed),
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span
              className={cn(
                "font-medium",
                isOverBudget ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {formatPercent(spending.percentUsed / 100)} used
            </span>
            <span className={cn(isOverBudget ? "text-destructive" : "text-success")}>
              {isOverBudget ? "Over by " : "Remaining: "}
              <PrivacyAmount
                value={Math.abs(spending.difference)}
                currency={currency}
              />
            </span>
          </div>
        </div>

        {budgetData.byCategory.filter((c) => c.isOverBudget).length > 0 && (
          <div className="border-t pt-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium">Over Budget Categories</p>
            <div className="space-y-2">
              {budgetData.byCategory
                .filter((c) => c.isOverBudget)
                .slice(0, 3)
                .map((cat) => (
                  <div key={cat.categoryId} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat.categoryColor || "#888" }}
                      />
                      <span className="truncate">{cat.categoryName}</span>
                    </div>
                    <span className="text-destructive font-medium">
                      +<PrivacyAmount value={-cat.difference} currency={currency} />
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
