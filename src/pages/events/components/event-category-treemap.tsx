import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { EventSpendingSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatAmount, formatPercent } from "@wealthfolio/ui";
import { useMemo, type FC } from "react";
import { Tooltip as ChartTooltip, ResponsiveContainer, Treemap } from "recharts";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
];

interface CategoryData {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  color: string | null;
  totalAmount: number;
  colorIndex: number;
}

function truncateText(text: string, maxWidth: number, fontSize: number): string {
  if (!text) return "";
  const charWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / charWidth);
  if (text.length <= maxChars) return text;
  const truncatedLength = Math.max(1, maxChars - 3);
  return text.substring(0, truncatedLength) + "...";
}

interface TreemapNodeProps {
  depth?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  categoryName?: string;
  color?: string | null;
  amount?: number;
  totalAmount?: number;
  colorIndex?: number;
}

const TreemapNode: FC<TreemapNodeProps> = ({
  depth = 0,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  categoryName,
  color,
  amount = 0,
  totalAmount = 0,
  colorIndex = 0,
}) => {
  const fontSize = Math.min(width, height) < 80 ? Math.min(width, height) * 0.14 : 12;
  const truncatedText = truncateText(categoryName || "Uncategorized", width - 16, fontSize);
  const percent = totalAmount > 0 ? amount / totalAmount : 0;

  // Use category color if available, otherwise use chart colors
  const fillColor = color || COLORS[colorIndex % COLORS.length];

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        ry={8}
        className={cn("stroke-card", {
          "stroke-[3px]": depth === 1,
          "fill-none stroke-0": depth === 0,
        })}
        style={{
          fill: depth === 1 ? fillColor : "none",
          fillOpacity: depth === 1 ? 0.7 : 0,
        }}
      />
      {depth === 1 && width > 40 && height > 30 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 4}
            textAnchor="middle"
            fill="currentColor"
            className="font-default text-xs"
            style={{ fontSize }}
          >
            {truncatedText}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + fontSize}
            textAnchor="middle"
            fill="currentColor"
            className="text-xs opacity-70"
            style={{ fontSize: fontSize - 1 }}
          >
            {formatPercent(percent)}
          </text>
        </>
      )}
    </g>
  );
};

interface TreemapTooltipProps {
  active?: boolean;
  payload?: { payload: CategoryData }[];
  currency?: string;
}

const TreemapTooltip = ({ active, payload, currency = "USD" }: TreemapTooltipProps) => {
  if (active && payload?.length) {
    const data = payload[0].payload;
    const percent = data.totalAmount > 0 ? data.amount / data.totalAmount : 0;
    return (
      <Card>
        <CardContent className="space-y-1 p-3">
          <div className="text-sm font-medium">{data.categoryName || "Uncategorized"}</div>
          <div className="text-foreground font-semibold">{formatAmount(data.amount, currency)}</div>
          <div className="text-muted-foreground text-xs">{formatPercent(percent)} of total</div>
        </CardContent>
      </Card>
    );
  }
  return null;
};

interface EventCategoryTreemapProps {
  events: EventSpendingSummary[];
  currency: string;
  isLoading?: boolean;
}

export function EventCategoryTreemap({ events, currency, isLoading }: EventCategoryTreemapProps) {
  const { data, totalAmount } = useMemo(() => {
    const categoryMap = new Map<string, Omit<CategoryData, "totalAmount" | "colorIndex">>();
    let total = 0;

    for (const event of events) {
      for (const [key, catSpending] of Object.entries(event.byCategory)) {
        const existing = categoryMap.get(key);
        if (existing) {
          existing.amount += catSpending.amount;
        } else {
          categoryMap.set(key, {
            categoryId: catSpending.categoryId,
            categoryName: catSpending.categoryName || "Uncategorized",
            amount: catSpending.amount,
            color: catSpending.color,
          });
        }
        total += catSpending.amount;
      }
    }

    const sortedData = Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .map((item, index) => ({
        ...item,
        totalAmount: total,
        colorIndex: index,
      }));

    return { data: sortedData, totalAmount: total };
  }, [events]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center">
          <EmptyPlaceholder
            icon={<Icons.BarChart className="h-8 w-8" />}
            title="No category data"
            description="No spending categories for the selected events."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
        <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <Treemap
            data={data}
            dataKey="amount"
            nameKey="categoryName"
            content={<TreemapNode totalAmount={totalAmount} />}
            animationDuration={100}
          >
            <ChartTooltip content={<TreemapTooltip currency={currency} />} />
          </Treemap>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
