import { getBudgetVsActual } from "@/commands/budget";
import { getSpendingSummary } from "@/commands/portfolio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { useSettingsContext } from "@/lib/settings-provider";
import { QueryKeys } from "@/lib/query-keys";
import type { BudgetVsActual, SpendingSummary } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { BudgetGaugeCard, formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MonthSwitcher, getDefaultReportMonth } from "./components/month-switcher";
import { QuickBudgetModal } from "./components/quick-budget-modal";
import { cn } from "@/lib/utils";
import { buildCashflowUrl } from "@/lib/navigation/cashflow-navigation";
import { ExternalLink } from "lucide-react";

interface BudgetTabPageProps {
  renderActions?: (actions: React.ReactNode) => void;
}

export default function BudgetTabPage({ renderActions }: BudgetTabPageProps) {
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const varianceTolerance = settings?.budgetVarianceTolerance ?? 10;

  // Quick budget modal state
  const [quickBudgetModal, setQuickBudgetModal] = useState<{
    open: boolean;
    categoryId: string;
    categoryName: string;
    categoryColor: string | null;
    currentSpending: number;
  }>({
    open: false,
    categoryId: "",
    categoryName: "",
    categoryColor: null,
    currentSpending: 0,
  });

  const { data: spendingData, isLoading: isSpendingLoading } = useQuery<SpendingSummary[]>({
    queryKey: [QueryKeys.SPENDING_SUMMARY],
    queryFn: () => getSpendingSummary(),
  });

  const { data: budgetData } = useQuery<BudgetVsActual>({
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

  // Build subcategories by category map
  const subcategoriesByCategory = useMemo(() => {
    if (!totalSummary || !selectedMonth) return new Map<string, { name: string; amount: number }[]>();

    const monthSubcats = totalSummary.byMonthBySubcategory?.[selectedMonth] || {};
    const subcatInfo = totalSummary.bySubcategory || {};
    const map = new Map<string, { name: string; amount: number }[]>();

    Object.entries(monthSubcats).forEach(([subcatId, amount]) => {
      const info = subcatInfo[subcatId];
      if (!info) return;
      const catId = info.categoryId || "uncategorized";
      if (!map.has(catId)) map.set(catId, []);
      map.get(catId)!.push({
        name: info.subcategoryName,
        amount: amount as number,
      });
    });

    // Sort each category's subcategories by amount descending
    map.forEach((subs) => subs.sort((a, b) => b.amount - a.amount));
    return map;
  }, [totalSummary, selectedMonth]);

  // Calculate unbudgeted spending categories
  const unbudgetedCategories = useMemo(() => {
    if (!totalSummary || !budgetData || !selectedMonth) return [];

    const currentBreakdown = totalSummary.byMonthByCategory?.[selectedMonth] || {};
    const categorySpending = totalSummary.byCategory || {};
    const budgetedCategoryIds = new Set(budgetData.byCategory.map((c) => c.categoryId));

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

  // Navigate to transactions for a category
  const handleCategoryClick = useCallback(
    (categoryId: string) => {
      if (!selectedMonth) return;
      const [year, month] = selectedMonth.split("-");
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      navigate(
        buildCashflowUrl({
          categoryId,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        }),
      );
    },
    [navigate, selectedMonth],
  );

  const openQuickBudgetModal = useCallback(
    (cat: { categoryId: string; categoryName: string; color: string | null; amount: number }) => {
      setQuickBudgetModal({
        open: true,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        categoryColor: cat.color,
        currentSpending: cat.amount,
      });
    },
    [],
  );

  const closeQuickBudgetModal = useCallback(() => {
    setQuickBudgetModal((prev) => ({ ...prev, open: false }));
  }, []);

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
                    of <PrivacyAmount value={budgetData.spending.budgeted} currency={baseCurrency} />{" "}
                    budget
                  </p>
                </div>
                <div
                  className={cn(
                    "text-right",
                    budgetData.spending.difference < 0 ? "text-destructive" : "text-success",
                  )}
                >
                  <p className="text-lg font-semibold">
                    {budgetData.spending.difference < 0 ? "+" : "-"}
                    <PrivacyAmount
                      value={Math.abs(budgetData.spending.difference)}
                      currency={baseCurrency}
                    />
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
                <p className="text-muted-foreground text-right text-xs">
                  {formatPercent(budgetData.spending.percentUsed / 100)} used
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Budget Cards Grid */}
      {hasBudget && budgetData.byCategory.length > 0 && (
        <div>
          <h3 className="text-muted-foreground mb-3 text-sm font-medium">Category Spending</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {budgetData.byCategory
              .sort((a, b) => b.budgeted - a.budgeted)
              .map((cat) => (
                <BudgetGaugeCard
                  key={cat.categoryId}
                  categoryName={cat.categoryName}
                  categoryColor={cat.categoryColor}
                  actual={cat.actual}
                  budgeted={cat.budgeted}
                  percentUsed={cat.percentUsed}
                  currency={baseCurrency}
                  subcategories={subcategoriesByCategory.get(cat.categoryId)}
                  onClick={() => handleCategoryClick(cat.categoryId)}
                  varianceTolerance={varianceTolerance}
                />
              ))}
          </div>
        </div>
      )}

      {/* Unbudgeted Spending */}
      {unbudgetedCategories.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-sm font-medium">Unbudgeted Spending</CardTitle>
              <p className="text-muted-foreground text-xs mt-0.5">
                <PrivacyAmount value={totalUnbudgetedSpending} currency={baseCurrency} /> across {unbudgetedCategories.length} {unbudgetedCategories.length === 1 ? "category" : "categories"}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {unbudgetedCategories.map((cat) => (
                <div
                  key={cat.categoryId}
                  className="flex items-center justify-between py-2.5 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: cat.color || "#888" }}
                    />
                    <span className="text-sm">{cat.categoryName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground tabular-nums text-sm">
                      <PrivacyAmount value={cat.amount} currency={baseCurrency} />
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-primary hover:text-primary"
                      onClick={() => openQuickBudgetModal(cat)}
                    >
                      Add Budget
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => navigate("/settings/budget")}
              >
                <ExternalLink className="h-4 w-4" />
                Manage Budget Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state for budgeted categories */}
      {hasBudget && budgetData.byCategory.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Icons.PieChart className="text-muted-foreground mb-3 h-8 w-8" />
            <p className="text-muted-foreground text-sm">No category budgets set</p>
            <Link
              to="/settings/budget"
              className="text-primary hover:text-primary/80 mt-2 text-xs underline-offset-4 hover:underline"
            >
              Set category budgets
            </Link>
          </CardContent>
        </Card>
      )}

      {/* All budgeted state */}
      {hasBudget && unbudgetedCategories.length === 0 && budgetData.byCategory.length > 0 && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-center justify-center gap-2 py-4">
            <Icons.CheckCircle className="text-success h-5 w-5" />
            <p className="text-success text-sm font-medium">All spending is budgeted</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Budget Modal */}
      <QuickBudgetModal
        open={quickBudgetModal.open}
        onClose={closeQuickBudgetModal}
        categoryId={quickBudgetModal.categoryId}
        categoryName={quickBudgetModal.categoryName}
        categoryColor={quickBudgetModal.categoryColor}
        currentSpending={quickBudgetModal.currentSpending}
        currency={baseCurrency}
      />
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
      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mx-auto h-20 w-full" />
                <Skeleton className="mx-auto h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
