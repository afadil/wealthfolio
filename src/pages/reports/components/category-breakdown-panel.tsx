import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatAmount, formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useMemo } from "react";
import { format, subMonths } from "date-fns";
import type { SpendingSummary } from "@/lib/types";
import { ArrowUp, ArrowDown } from "lucide-react";
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

interface CategoryWithChange {
  categoryId: string;
  categoryName: string;
  color: string | null;
  amount: number;
  prevAmount: number;
  changePercent: number | null;
  isNew?: boolean; // 0 → X (didn't exist last month)
}

export function CategoryBreakdownPanel({
  spendingData,
  selectedMonth,
  currency,
  isHidden,
}: CategoryBreakdownPanelProps) {
  const { allCategories, notableChanges, totalSpending } = useMemo(() => {
    if (!spendingData || !selectedMonth) {
      return { allCategories: [], notableChanges: [], totalSpending: 0 };
    }

    const prevMonth = format(subMonths(new Date(selectedMonth + "-01"), 1), "yyyy-MM");
    const currentBreakdown = spendingData.byMonthByCategory?.[selectedMonth] || {};
    const prevBreakdown = spendingData.byMonthByCategory?.[prevMonth] || {};
    const categorySpending = spendingData.byCategory || {};

    const total = Object.values(currentBreakdown).reduce((sum, amt) => sum + (amt as number), 0);

    const categoriesWithChanges: CategoryWithChange[] = Object.entries(currentBreakdown)
      .map(([categoryId, amount]) => {
        const categoryInfo = categorySpending[categoryId];
        const prevAmount = (prevBreakdown[categoryId] as number) || 0;
        const isNew = prevAmount === 0 && (amount as number) > 0;
        const changePercent = prevAmount > 0
          ? (((amount as number) - prevAmount) / prevAmount) * 100
          : null;

        return {
          categoryId,
          categoryName: categoryInfo?.categoryName || "Uncategorized",
          color: categoryInfo?.color || null,
          amount: amount as number,
          prevAmount,
          changePercent,
          isNew,
        };
      })
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    // Find categories that existed last month but not this month (X → 0)
    const goneCategories: CategoryWithChange[] = Object.entries(prevBreakdown)
      .filter(([categoryId]) => !currentBreakdown[categoryId] || (currentBreakdown[categoryId] as number) === 0)
      .map(([categoryId, prevAmount]) => {
        const categoryInfo = categorySpending[categoryId];
        return {
          categoryId,
          categoryName: categoryInfo?.categoryName || "Uncategorized",
          color: categoryInfo?.color || null,
          amount: 0,
          prevAmount: prevAmount as number,
          changePercent: -100, // X → 0 is -100%
        };
      })
      .filter((c) => c.prevAmount > 0);

    // Notable changes - combine current with changes + new categories + gone categories
    // Sort by absolute change (new categories treated as very high priority)
    const allChanges = [
      ...categoriesWithChanges.filter((c) => c.changePercent !== null || c.isNew),
      ...goneCategories,
    ];

    const changes = allChanges
      .sort((a, b) => {
        // New categories and gone categories get high priority
        const aScore = a.isNew ? Infinity : (a.changePercent === -100 ? 100 : Math.abs(a.changePercent || 0));
        const bScore = b.isNew ? Infinity : (b.changePercent === -100 ? 100 : Math.abs(b.changePercent || 0));
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

  if (allCategories.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          <Icons.PieChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex h-[280px] items-center justify-center">
          <p className="text-sm text-muted-foreground">No spending data for this month</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
        <Icons.PieChart className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          {/* Progress bars on the left */}
          <div className="flex-1 space-y-3">
            {allCategories.map((cat, index) => {
              const percent = totalSpending > 0 ? (cat.amount / totalSpending) * 100 : 0;
              const barWidth = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
              const color = cat.color || CHART_COLORS[index % CHART_COLORS.length];

              return (
                <div key={cat.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate text-muted-foreground">{cat.categoryName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-medium">
                        <PrivacyAmount value={cat.amount} currency={currency} />
                      </span>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {formatPercent(percent / 100)}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pie chart on the right */}
          <div className="shrink-0">
            <ChartContainer config={{}} className="h-[180px] w-[180px]">
              <PieChart>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {isHidden ? "••••" : formatAmount(data.value, currency)}
                        </div>
                        <div className="text-xs text-muted-foreground">
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
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Notable Changes
            </p>
            <div className="space-y-3">
              {notableChanges.map((cat) => (
                <div key={cat.categoryId} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="truncate block text-muted-foreground">{cat.categoryName}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                      <PrivacyAmount value={cat.prevAmount} currency={currency} />
                      <span className="text-muted-foreground/50">→</span>
                      <PrivacyAmount value={cat.amount} currency={currency} />
                    </div>
                  </div>
                  {cat.isNew ? (
                    <div className="flex items-center gap-1 shrink-0 font-medium text-destructive ml-2">
                      <ArrowUp className="h-3 w-3" />
                      New
                    </div>
                  ) : (
                    <div
                      className={`flex items-center gap-1 shrink-0 font-medium ml-2 ${
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
