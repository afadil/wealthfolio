import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { formatAmount, formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { Cell, Pie, PieChart } from "recharts";
import { useMemo } from "react";

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

interface CategoryData {
  categoryId: string;
  categoryName: string;
  color: string | null;
  amount: number;
}

interface CategoryBreakdownChartProps {
  categories: CategoryData[];
  totalSpending: number;
  currency: string;
  isHidden: boolean;
}

export function CategoryBreakdownChart({
  categories,
  totalSpending,
  currency,
  isHidden,
}: CategoryBreakdownChartProps) {
  const chartData = useMemo(() => {
    const topCategories = categories.slice(0, 6);
    const otherAmount = categories.slice(6).reduce((sum, c) => sum + c.amount, 0);

    const data = topCategories.map((cat, index) => ({
      name: cat.categoryName,
      value: cat.amount,
      fill: cat.color || CHART_COLORS[index % CHART_COLORS.length],
      percent: totalSpending > 0 ? (cat.amount / totalSpending) * 100 : 0,
    }));

    if (otherAmount > 0) {
      data.push({
        name: "Other",
        value: otherAmount,
        fill: "var(--muted-foreground)",
        percent: totalSpending > 0 ? (otherAmount / totalSpending) * 100 : 0,
      });
    }

    return data;
  }, [categories, totalSpending]);

  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          <Icons.BarChart className="text-muted-foreground h-4 w-4" />
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
        <Icons.BarChart className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <ChartContainer config={{}} className="h-[200px] w-[200px] shrink-0">
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
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>

          <div className="flex-1 space-y-2 pt-2">
            {chartData.map((cat, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.fill }}
                  />
                  <span className="text-muted-foreground truncate">{cat.name}</span>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <span className="font-medium">
                    <PrivacyAmount value={cat.value} currency={currency} />
                  </span>
                  <span className="text-muted-foreground w-10 text-right text-xs">
                    {formatPercent(cat.percent / 100)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
