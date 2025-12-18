import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatAmount, formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import type { SpendingSummary } from "@/lib/types";
import { ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

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

interface CategoryBreakdownPanelProps {
  spendingData: SpendingSummary | null | undefined;
  selectedMonth: string;
  currency: string;
  isHidden: boolean;
}

interface SubcategoryData {
  subcategoryId: string;
  subcategoryName: string;
  amount: number;
}

interface CategoryWithChange {
  categoryId: string;
  categoryName: string;
  color: string | null;
  amount: number;
  prevAmount: number;
  changePercent: number | null;
  isNew?: boolean;
  subcategories: SubcategoryData[];
}

export function CategoryBreakdownPanel({
  spendingData,
  selectedMonth,
  currency,
  isHidden,
}: CategoryBreakdownPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const { allCategories, notableChanges, totalSpending } = useMemo(() => {
    if (!spendingData || !selectedMonth) {
      return { allCategories: [], notableChanges: [], totalSpending: 0 };
    }

    const prevMonth = format(subMonths(new Date(selectedMonth + "-01"), 1), "yyyy-MM");
    const currentBreakdown = spendingData.byMonthByCategory?.[selectedMonth] || {};
    const prevBreakdown = spendingData.byMonthByCategory?.[prevMonth] || {};
    const categorySpending = spendingData.byCategory || {};
    const monthSubcategories = spendingData.byMonthBySubcategory?.[selectedMonth] || {};
    const subcategoryInfo = spendingData.bySubcategory || {};

    const total = Object.values(currentBreakdown).reduce((sum, amt) => sum + (amt as number), 0);

    // Build subcategories map by category
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

    // Sort subcategories by amount
    subcategoriesByCategory.forEach((subs) => {
      subs.sort((a, b) => b.amount - a.amount);
    });

    const categoriesWithChanges: CategoryWithChange[] = Object.entries(currentBreakdown)
      .map(([categoryId, amount]) => {
        const categoryInfo = categorySpending[categoryId];
        const prevAmount = (prevBreakdown[categoryId] as number) || 0;
        const isNew = prevAmount === 0 && (amount as number) > 0;
        const changePercent =
          prevAmount > 0 ? (((amount as number) - prevAmount) / prevAmount) * 100 : null;

        return {
          categoryId,
          categoryName: categoryInfo?.categoryName || "Uncategorized",
          color: categoryInfo?.color || null,
          amount: amount as number,
          prevAmount,
          changePercent,
          isNew,
          subcategories: subcategoriesByCategory.get(categoryId) || [],
        };
      })
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    // Find categories that existed last month but not this month (X → 0)
    const goneCategories: CategoryWithChange[] = Object.entries(prevBreakdown)
      .filter(
        ([categoryId]) =>
          !currentBreakdown[categoryId] || (currentBreakdown[categoryId] as number) === 0,
      )
      .map(([categoryId, prevAmount]) => {
        const categoryInfo = categorySpending[categoryId];
        return {
          categoryId,
          categoryName: categoryInfo?.categoryName || "Uncategorized",
          color: categoryInfo?.color || null,
          amount: 0,
          prevAmount: prevAmount as number,
          changePercent: -100,
          subcategories: [],
        };
      })
      .filter((c) => c.prevAmount > 0);

    const allChanges = [
      ...categoriesWithChanges.filter((c) => c.changePercent !== null || c.isNew),
      ...goneCategories,
    ];

    const changes = allChanges
      .sort((a, b) => {
        const aScore = a.isNew
          ? Infinity
          : a.changePercent === -100
            ? 100
            : Math.abs(a.changePercent || 0);
        const bScore = b.isNew
          ? Infinity
          : b.changePercent === -100
            ? 100
            : Math.abs(b.changePercent || 0);
        return bScore - aScore;
      })
      .slice(0, 5);

    return { allCategories: categoriesWithChanges, notableChanges: changes, totalSpending: total };
  }, [spendingData, selectedMonth]);

  const chartData = useMemo(() => {
    return allCategories.map((cat, index) => ({
      name: cat.categoryName,
      value: cat.amount,
      fill: cat.color || CHART_COLORS[index % CHART_COLORS.length],
      percent: totalSpending > 0 ? (cat.amount / totalSpending) * 100 : 0,
    }));
  }, [allCategories, totalSpending]);

  const maxAmount = allCategories.length > 0 ? allCategories[0].amount : 0;

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

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
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="max-h-[300px] flex-1 space-y-2 overflow-y-auto pr-2">
            {allCategories.map((cat, index) => {
              const percent = totalSpending > 0 ? (cat.amount / totalSpending) * 100 : 0;
              const barWidth = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
              const color = cat.color || CHART_COLORS[index % CHART_COLORS.length];
              const hasSubcategories = cat.subcategories.length > 0;
              const isExpanded = expandedCategories.has(cat.categoryId);

              return (
                <div key={cat.categoryId} className="space-y-1">
                  {hasSubcategories ? (
                    <button
                      onClick={() => toggleCategory(cat.categoryId)}
                      className="hover:bg-muted/50 flex w-full items-center justify-between rounded px-1 py-0.5 text-sm transition-colors"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="text-muted-foreground h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0" />
                        )}
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate font-medium">{cat.categoryName}</span>
                        <span className="text-muted-foreground text-xs">
                          ({cat.subcategories.length})
                        </span>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-2">
                        <span className="font-medium">
                          <PrivacyAmount value={cat.amount} currency={currency} />
                        </span>
                        <span className="text-muted-foreground w-10 text-right text-xs">
                          {formatPercent(percent / 100)}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between px-1 py-0.5 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="w-3" />
                        <div
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-muted-foreground truncate">{cat.categoryName}</span>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-2">
                        <span className="font-medium">
                          <PrivacyAmount value={cat.amount} currency={currency} />
                        </span>
                        <span className="text-muted-foreground w-10 text-right text-xs">
                          {formatPercent(percent / 100)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="bg-muted ml-5 h-1.5 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>

                  {isExpanded && hasSubcategories && (
                    <div
                      className="mt-2 ml-6 space-y-2 border-l-2 pl-3"
                      style={{ borderColor: color }}
                    >
                      {cat.subcategories.map((sub) => {
                        const subPercent = cat.amount > 0 ? (sub.amount / cat.amount) * 100 : 0;
                        const subBarWidth =
                          cat.subcategories[0]?.amount > 0
                            ? (sub.amount / cat.subcategories[0].amount) * 100
                            : 0;

                        return (
                          <div key={sub.subcategoryId} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground truncate">
                                {sub.subcategoryName}
                              </span>
                              <div className="ml-2 flex shrink-0 items-center gap-2">
                                <span className="text-sm">
                                  <PrivacyAmount value={sub.amount} currency={currency} />
                                </span>
                                <span className="text-muted-foreground w-10 text-right text-xs">
                                  {formatPercent(subPercent / 100)}
                                </span>
                              </div>
                            </div>
                            <div className="bg-muted/50 h-1 overflow-hidden rounded-full">
                              <div
                                className="h-full rounded-full opacity-60 transition-all duration-300"
                                style={{
                                  width: `${subBarWidth}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="shrink-0">
            <ChartContainer config={{}} className="h-[180px] w-[180px]">
              <PieChart>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-background rounded-lg border p-2 shadow-sm">
                        <div className="font-medium">{data.name}</div>
                        <div className="text-muted-foreground text-sm">
                          {isHidden ? "••••" : formatAmount(data.value, currency)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatPercent(data.percent / 100)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>
        </div>

        {notableChanges.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium">Notable Changes</p>
            <div className="space-y-3">
              {notableChanges.map((cat) => (
                <div key={cat.categoryId} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="text-muted-foreground block truncate">{cat.categoryName}</span>
                    <div className="text-muted-foreground/70 flex items-center gap-1 text-xs">
                      <PrivacyAmount value={cat.prevAmount} currency={currency} />
                      <span className="text-muted-foreground/50">→</span>
                      <PrivacyAmount value={cat.amount} currency={currency} />
                    </div>
                  </div>
                  {cat.isNew ? (
                    <div className="text-destructive ml-2 flex shrink-0 items-center gap-1 font-medium">
                      <ArrowUp className="h-3 w-3" />
                      New
                    </div>
                  ) : (
                    <div
                      className={`ml-2 flex shrink-0 items-center gap-1 font-medium ${
                        cat.changePercent! > 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {cat.changePercent! > 0 ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                      {formatPercent(Math.abs(cat.changePercent!) / 100)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
