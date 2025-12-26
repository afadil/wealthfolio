import { getBudgetVsActual } from "@/commands/budget";
import { getSpendingSummary } from "@/commands/portfolio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { useSettingsContext } from "@/lib/settings-provider";
import { QueryKeys } from "@/lib/query-keys";
import type { BudgetVsActual, SpendingSummary } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { MonthSwitcher, getDefaultReportMonth } from "./components/month-switcher";
import { cn } from "@/lib/utils";

interface BudgetTabPageProps {
  renderActions?: (actions: React.ReactNode) => void;
}

export default function BudgetTabPage({ renderActions }: BudgetTabPageProps) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const { data: spendingData, isLoading: isSpendingLoading } = useQuery<SpendingSummary[]>({
    queryKey: [QueryKeys.SPENDING_SUMMARY],
    queryFn: () => getSpendingSummary(),
  });

  const { data: budgetData, isLoading: isBudgetLoading } = useQuery<BudgetVsActual>({
    queryKey: [QueryKeys.BUDGET_VS_ACTUAL, selectedMonth],
    queryFn: () => getBudgetVsActual(selectedMonth!),
    enabled: !!selectedMonth,
  });

  const totalSummary = useMemo(() => {
    return spendingData?.find((s) => s.period === "TOTAL");
  }, [spendingData]);

  const availableMonths = useMemo(() => {
    if (!totalSummary?.byMonth) return [];
    return Object.keys(totalSummary.byMonth).sort().reverse();
  }, [totalSummary]);

  // Initialize selected month
  useEffect(() => {
    if (!hasInitialized && availableMonths.length > 0) {
      const defaultMonth = getDefaultReportMonth(availableMonths);
      setSelectedMonth(defaultMonth);
      setHasInitialized(true);
    }
  }, [availableMonths, hasInitialized]);

  const monthActions = useMemo(
    () =>
      selectedMonth ? (
        <MonthSwitcher
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          availableMonths={availableMonths}
        />
      ) : null,
    [selectedMonth, availableMonths],
  );

  useEffect(() => {
    renderActions?.(monthActions);
  }, [renderActions, monthActions]);

  // Calculate unbudgeted spending categories
  const unbudgetedCategories = useMemo(() => {
    if (!totalSummary || !budgetData || !selectedMonth) return [];

    const currentBreakdown = totalSummary.byMonthByCategory?.[selectedMonth] || {};
    const categorySpending = totalSummary.byCategory || {};
    const budgetedCategoryIds = new Set(budgetData.byCategory.map(c => c.categoryId));

    return Object.entries(currentBreakdown)
      .filter(([categoryId, amount]) => !budgetedCategoryIds.has(categoryId) && (amount as number) > 0)
      .map(([categoryId, amount]) => {
        const categoryInfo = categorySpending[categoryId];
        return {
          categoryId,
          categoryName: categoryInfo?.categoryName || "Uncategorized",
          color: categoryInfo?.color || null,
          amount: amount as number,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [totalSummary, budgetData, selectedMonth]);

  const totalUnbudgetedSpending = useMemo(() => {
    return unbudgetedCategories.reduce((sum, cat) => sum + cat.amount, 0);
  }, [unbudgetedCategories]);

  const isLoading = isSpendingLoading;

  if (isLoading) {
    return <BudgetTabSkeleton />;
  }

  if (availableMonths.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
        <Icons.Calendar className="text-muted-foreground mb-4 h-12 w-12" />
        <h3 className="mb-2 text-lg font-semibold">No Transactions</h3>
        <p className="text-muted-foreground mb-4 text-center">
          Import transactions to start tracking your budget.
        </p>
        <Link
          to="/activities?tab=import"
          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
        >
          Import transactions
          <Icons.ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (!selectedMonth) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
        <Icons.Calendar className="text-muted-foreground mb-4 h-12 w-12" />
        <p className="text-muted-foreground">Select a month to view budget data</p>
      </div>
    );
  }

  const hasBudget = budgetData && budgetData.spending.budgeted > 0;
  const getProgressColor = (percent: number) => {
    if (percent >= 100) return "bg-destructive";
    if (percent >= 80) return "bg-warning";
    return "bg-success";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
      {/* Overall Budget Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Budget Summary</CardTitle>
          <Icons.Target className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          {!hasBudget ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Icons.Wallet className="text-muted-foreground mb-3 h-10 w-10" />
              <p className="text-muted-foreground mb-2 text-sm">No budget set for this month</p>
              <Link
                to="/settings/budget"
                className="text-primary hover:text-primary/80 text-sm underline-offset-4 hover:underline"
              >
                Set up your budget
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">
                    <PrivacyAmount value={budgetData.spending.actual} currency={baseCurrency} />
                  </p>
                  <p className="text-muted-foreground text-sm">
                    of <PrivacyAmount value={budgetData.spending.budgeted} currency={baseCurrency} /> budget
                  </p>
                </div>
                <div className={cn(
                  "text-right",
                  budgetData.spending.difference < 0 ? "text-destructive" : "text-success"
                )}>
                  <p className="text-lg font-semibold">
                    {budgetData.spending.difference < 0 ? "+" : "-"}
                    <PrivacyAmount value={Math.abs(budgetData.spending.difference)} currency={baseCurrency} />
                  </p>
                  <p className="text-sm">
                    {budgetData.spending.difference < 0 ? "over budget" : "remaining"}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="relative h-3">
                  <Progress value={Math.min(budgetData.spending.percentUsed, 100)} className="h-3" />
                  <div
                    className={cn(
                      "absolute left-0 top-0 h-3 rounded-full transition-all",
                      getProgressColor(budgetData.spending.percentUsed),
                    )}
                    style={{ width: `${Math.min(budgetData.spending.percentUsed, 100)}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-xs text-right">
                  {formatPercent(budgetData.spending.percentUsed / 100)} used
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Budgeted Categories */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budgeted Categories</CardTitle>
            <Icons.PieChart className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {isBudgetLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !hasBudget || budgetData.byCategory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Icons.PieChart className="text-muted-foreground mb-3 h-8 w-8" />
                <p className="text-muted-foreground text-sm">No category budgets set</p>
                <Link
                  to="/settings/budget"
                  className="text-primary hover:text-primary/80 mt-2 text-xs underline-offset-4 hover:underline"
                >
                  Set category budgets
                </Link>
              </div>
            ) : (
              <div className="max-h-[300px] space-y-3 overflow-y-auto">
                {budgetData.byCategory
                  .sort((a, b) => b.percentUsed - a.percentUsed)
                  .map((cat) => (
                    <div key={cat.categoryId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: cat.categoryColor || "#888" }}
                          />
                          <span className="font-medium">{cat.categoryName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <PrivacyAmount value={cat.actual} currency={baseCurrency} />
                          <span className="text-muted-foreground">/</span>
                          <PrivacyAmount value={cat.budgeted} currency={baseCurrency} />
                        </div>
                      </div>
                      <div className="relative h-2">
                        <Progress value={Math.min(cat.percentUsed, 100)} className="h-2" />
                        <div
                          className={cn(
                            "absolute left-0 top-0 h-2 rounded-full transition-all",
                            getProgressColor(cat.percentUsed),
                          )}
                          style={{ width: `${Math.min(cat.percentUsed, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className={cn(
                          cat.isOverBudget ? "text-destructive" : "text-muted-foreground"
                        )}>
                          {formatPercent(cat.percentUsed / 100)}
                        </span>
                        {cat.isOverBudget && (
                          <span className="text-destructive">
                            +<PrivacyAmount value={-cat.difference} currency={baseCurrency} /> over
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unbudgeted Spending */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unbudgeted Spending</CardTitle>
            <Icons.AlertTriangle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {unbudgetedCategories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Icons.CheckCircle className="text-success mb-3 h-8 w-8" />
                <p className="text-muted-foreground text-sm">All spending is budgeted</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-warning/10 text-warning rounded-lg p-3">
                  <p className="text-sm font-medium">
                    <PrivacyAmount value={totalUnbudgetedSpending} currency={baseCurrency} /> in unbudgeted categories
                  </p>
                  <p className="text-xs opacity-80">Consider adding budgets for these categories</p>
                </div>
                <div className="max-h-[200px] space-y-2 overflow-y-auto">
                  {unbudgetedCategories.map((cat) => (
                    <div key={cat.categoryId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: cat.color || "#888" }}
                        />
                        <span className="text-muted-foreground">{cat.categoryName}</span>
                      </div>
                      <span className="font-medium">
                        <PrivacyAmount value={cat.amount} currency={baseCurrency} />
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  to="/settings/budget"
                  className="text-primary hover:text-primary/80 block text-center text-xs underline-offset-4 hover:underline"
                >
                  Add budgets for these categories
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Over Budget Alerts */}
      {hasBudget && budgetData.byCategory.filter(c => c.isOverBudget).length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-destructive text-sm font-medium">Over Budget Alerts</CardTitle>
            <Icons.AlertCircle className="text-destructive h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {budgetData.byCategory
                .filter(c => c.isOverBudget)
                .sort((a, b) => a.difference - b.difference)
                .map((cat) => (
                  <div
                    key={cat.categoryId}
                    className="bg-destructive/5 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: cat.categoryColor || "#888" }}
                      />
                      <span className="font-medium text-sm">{cat.categoryName}</span>
                    </div>
                    <p className="text-destructive text-lg font-bold">
                      +<PrivacyAmount value={-cat.difference} currency={baseCurrency} />
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatPercent(cat.percentUsed / 100)} of budget used
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BudgetTabSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6 px-2 pt-2 pb-2 lg:px-4 lg:pb-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <div className="space-y-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2 text-right">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
