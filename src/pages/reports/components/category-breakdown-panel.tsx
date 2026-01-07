import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useMemo, useState, useCallback } from "react";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import type { SpendingSummary, ActivityDetails } from "@/lib/types";
import { Cell, Pie, PieChart, Sector, type PieProps } from "recharts";
import { ViewTransactionsButton } from "@/components/view-transactions-button";
import { useQuery } from "@tanstack/react-query";
import { getTopSpendingTransactions } from "@/commands/activity";
import { Badge } from "@/components/ui/badge";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
];

function generateColorShades(baseColor: string, count: number): string[] {
  const shades: string[] = [];
  for (let i = 0; i < count; i++) {
    const opacity = 1 - i * 0.15;
    shades.push(`color-mix(in srgb, ${baseColor} ${Math.max(opacity * 100, 40)}%, transparent)`);
  }
  return shades;
}

interface CategoryBreakdownPanelProps {
  spendingData: SpendingSummary | null | undefined;
  selectedMonth: string;
  currency: string;
  includeEventIds?: string[];
  includeAllEvents?: boolean;
}

interface SubcategoryData {
  subcategoryId: string;
  subcategoryName: string;
  amount: number;
}

interface CategoryData {
  categoryId: string;
  categoryName: string;
  color: string;
  amount: number;
  percent: number;
  subcategories: SubcategoryData[];
}

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export function CategoryBreakdownPanel({
  spendingData,
  selectedMonth,
  currency,
  includeEventIds,
  includeAllEvents = false,
}: CategoryBreakdownPanelProps) {
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState<number>(0);

  const { allCategories } = useMemo(() => {
    if (!spendingData || !selectedMonth) {
      return { allCategories: [], totalSpending: 0 };
    }

    const currentBreakdown = spendingData.byMonthByCategory?.[selectedMonth] || {};
    const categorySpending = spendingData.byCategory || {};
    const monthSubcategories = spendingData.byMonthBySubcategory?.[selectedMonth] || {};
    const subcategoryInfo = spendingData.bySubcategory || {};

    const total = Object.values(currentBreakdown).reduce((sum, amt) => sum + (amt as number), 0);

    const subcategoriesByCategory = new Map<string, SubcategoryData[]>();
    Object.entries(monthSubcategories).forEach(([subcategoryId, amount]) => {
      if ((amount as number) <= 0) return;
      const subInfo = subcategoryInfo[subcategoryId];
      if (!subInfo) return;

      const catId = subInfo.categoryId || "uncategorized";
      if (!subcategoriesByCategory.has(catId)) {
        subcategoriesByCategory.set(catId, []);
      }
      subcategoriesByCategory.get(catId)!.push({
        subcategoryId,
        subcategoryName: subInfo.subcategoryName,
        amount: amount as number,
      });
    });

    subcategoriesByCategory.forEach((subs) => {
      subs.sort((a, b) => b.amount - a.amount);
    });

    const categoriesData: CategoryData[] = Object.entries(currentBreakdown)
      .map(([categoryId, amount], index) => {
        const categoryInfo = categorySpending[categoryId];
        return {
          categoryId,
          categoryName: categoryInfo?.categoryName || "Uncategorized",
          color: categoryInfo?.color || CHART_COLORS[index % CHART_COLORS.length],
          amount: amount as number,
          percent: total > 0 ? ((amount as number) / total) * 100 : 0,
          subcategories: subcategoriesByCategory.get(categoryId) || [],
        };
      })
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return { allCategories: categoriesData, totalSpending: total };
  }, [spendingData, selectedMonth]);

  const selectedCategory = allCategories[selectedCategoryIndex] || null;

  const selectedCategoryId = selectedCategory?.categoryId;
  const { data: categoryTransactions = [] } = useQuery<ActivityDetails[]>({
    queryKey: [
      "category-transactions",
      selectedMonth,
      selectedCategoryId,
      includeEventIds,
      includeAllEvents,
    ],
    queryFn: () =>
      getTopSpendingTransactions(
        selectedMonth,
        5,
        includeAllEvents ? undefined : includeEventIds,
        includeAllEvents,
        selectedCategoryId
      ),
    enabled: !!selectedMonth && !!selectedCategoryId,
  });

  const handleCategoryClick = useCallback((_: any, index: number) => {
    setSelectedCategoryIndex(index);
  }, []);

  const categoryChartData = useMemo(() => {
    return allCategories.map((cat) => ({
      name: cat.categoryName,
      value: cat.amount,
      fill: cat.color,
    }));
  }, [allCategories]);

  const subcategoryChartData = useMemo(() => {
    if (!selectedCategory || selectedCategory.subcategories.length === 0) return [];
    const shades = generateColorShades(selectedCategory.color, selectedCategory.subcategories.length);
    return selectedCategory.subcategories.map((sub, index) => ({
      name: sub.subcategoryName,
      value: sub.amount,
      fill: shades[index] || selectedCategory.color,
      percent: selectedCategory.amount > 0 ? (sub.amount / selectedCategory.amount) * 100 : 0,
    }));
  }, [selectedCategory]);

  if (allCategories.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          <Icons.PieChart className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="flex h-[280px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No spending data for this month</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
        <Icons.PieChart className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Charts Row */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Category Chart + Legend */}
          <div className="flex items-center gap-6">
            <ChartContainer config={{}} className="h-[280px] w-[280px] shrink-0">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie
                  data={categoryChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={2}
                  activeShape={renderActiveShape}
                  onClick={handleCategoryClick}
                  style={{ cursor: "pointer" }}
                  {...({ activeIndex: selectedCategoryIndex } as Partial<PieProps>)}
                >
                  {categoryChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            {/* Category Legend */}
            <div className="flex-1 space-y-1.5">
              <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">Categories</p>
              <div className="space-y-1">
                {allCategories.map((cat, index) => (
                  <button
                    key={cat.categoryId}
                    onClick={() => handleCategoryClick(null, index)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                      index === selectedCategoryIndex
                        ? "bg-muted font-medium"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate">{cat.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-xs">
                        {formatPercent(cat.percent / 100)}
                      </span>
                      <span className="w-20 text-right font-medium">
                        <PrivacyAmount value={cat.amount} currency={currency} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Subcategory Chart + Legend */}
          {selectedCategory && (
            <div className="flex items-center gap-6 border-l pl-8">
              {subcategoryChartData.length > 0 ? (
                <>
                  <ChartContainer config={{}} className="h-[280px] w-[280px] shrink-0">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={subcategoryChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={120}
                        paddingAngle={2}
                      >
                        {subcategoryChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  {/* Subcategory Legend */}
                  <div className="flex-1 space-y-1.5">
                    <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
                      {selectedCategory.categoryName}
                    </p>
                    <div className="space-y-1">
                      {selectedCategory.subcategories.map((sub, index) => {
                        const subPercent = selectedCategory.amount > 0
                          ? (sub.amount / selectedCategory.amount) * 100
                          : 0;
                        const shades = generateColorShades(selectedCategory.color, selectedCategory.subcategories.length);
                        return (
                          <div
                            key={sub.subcategoryId}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: shades[index] || selectedCategory.color }}
                              />
                              <span className="truncate">{sub.subcategoryName}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground text-xs">
                                {formatPercent(subPercent / 100)}
                              </span>
                              <span className="w-20 text-right font-medium">
                                <PrivacyAmount value={sub.amount} currency={currency} />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-[280px] flex-1 items-center justify-center">
                  <p className="text-muted-foreground text-sm">No subcategories for {selectedCategory.categoryName}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transactions Row */}
        {selectedCategory && (
          <div className="border-t pt-6">
            <div className="mb-4 flex items-center gap-3">
              <div
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
              />
              <span className="text-lg font-semibold">{selectedCategory.categoryName}</span>
              <span className="text-muted-foreground">
                <PrivacyAmount value={selectedCategory.amount} currency={currency} />
              </span>
            </div>

            {categoryTransactions.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {categoryTransactions.map((transaction) => {
                  const isDeposit = transaction.activityType === "DEPOSIT";
                  const amountColorClass = isDeposit ? "text-success" : "text-destructive";
                  const displayAmount = isDeposit
                    ? Math.abs(transaction.amount)
                    : -Math.abs(transaction.amount);

                  return (
                    <div
                      key={transaction.id}
                      className="bg-muted/30 flex flex-col rounded-lg border p-3"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {transaction.name || transaction.assetId}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {format(transaction.date, "MMM d, yyyy")}
                          </p>
                        </div>
                        <span className={`ml-2 shrink-0 text-sm font-bold ${amountColorClass}`}>
                          <PrivacyAmount value={displayAmount} currency={currency} />
                        </span>
                      </div>
                      <div className="mt-auto space-y-1">
                        {transaction.subCategoryName && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Icons.Tag className="text-muted-foreground h-3 w-3" />
                            <span className="text-muted-foreground truncate">{transaction.subCategoryName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs">
                          <Icons.Wallet className="text-muted-foreground h-3 w-3" />
                          <span className="text-muted-foreground truncate">{transaction.accountName}</span>
                        </div>
                        {transaction.recurrence && (
                          <div className="pt-1">
                            <Badge variant="outline" className="text-xs capitalize">
                              {transaction.recurrence}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center">
                <p className="text-muted-foreground text-sm">No transactions in this category</p>
              </div>
            )}

            {/* View All Button at bottom */}
            <ViewTransactionsButton
              dateRange={{
                startDate: format(startOfMonth(parseISO(selectedMonth + "-01")), "yyyy-MM-dd"),
                endDate: format(endOfMonth(parseISO(selectedMonth + "-01")), "yyyy-MM-dd"),
              }}
              categoryId={selectedCategory.categoryId}
              className="mt-4 w-full"
            >
              View All {selectedCategory.categoryName} Transactions
            </ViewTransactionsButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
