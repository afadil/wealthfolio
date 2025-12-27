import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoalContributionWithStatus } from "@/lib/types";
import { AmountDisplay, ChartContainer, ChartTooltip, formatAmount } from "@wealthfolio/ui";
import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

interface ContributionsTimelineChartProps {
  contributions: GoalContributionWithStatus[];
  targetAmount: number;
  isBalanceHidden: boolean;
}

function formatYAxis(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function ContributionsTimelineChart({
  contributions,
  targetAmount,
  isBalanceHidden,
}: ContributionsTimelineChartProps) {
  const currency = contributions[0]?.accountCurrency ?? "USD";

  const timelineData = useMemo(() => {
    const sorted = [...contributions].sort(
      (a, b) => new Date(a.contributedAt).getTime() - new Date(b.contributedAt).getTime(),
    );

    let cumulative = 0;
    return sorted.map((c) => {
      cumulative += c.amount;
      const date = new Date(c.contributedAt);
      return {
        date: c.contributedAt.split("T")[0],
        dateFormatted: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "2-digit",
        }),
        amount: c.amount,
        cumulative,
        accountName: c.accountName,
        currency: c.accountCurrency,
      };
    });
  }, [contributions]);

  const maxValue = useMemo(() => {
    const maxContributed =
      timelineData.length > 0 ? timelineData[timelineData.length - 1].cumulative : 0;
    return Math.max(maxContributed, targetAmount) * 1.1;
  }, [timelineData, targetAmount]);

  if (timelineData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contributions Over Time</CardTitle>
        <CardDescription>Cumulative progress toward your goal</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <ChartContainer config={{}} className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="dateFormatted"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                width={50}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => (isBalanceHidden ? "••••" : formatYAxis(value))}
                domain={[0, maxValue]}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover text-popover-foreground rounded-lg border p-3 shadow-md">
                      <p className="text-muted-foreground text-xs">{data.dateFormatted}</p>
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">Contribution: </span>
                        <AmountDisplay
                          value={data.amount}
                          currency={data.currency}
                          isHidden={isBalanceHidden}
                        />
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-medium">
                          <AmountDisplay
                            value={data.cumulative}
                            currency={data.currency}
                            isHidden={isBalanceHidden}
                          />
                        </span>
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">From: {data.accountName}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={targetAmount}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                strokeWidth={1}
                label={{
                  value: isBalanceHidden
                    ? "Target"
                    : `Target: ${formatAmount(targetAmount, currency, true)}`,
                  position: "right",
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="var(--success)"
                strokeWidth={2}
                fill="url(#colorCumulative)"
                dot={{
                  fill: "var(--success)",
                  strokeWidth: 0,
                  r: 4,
                }}
                activeDot={{
                  fill: "var(--success)",
                  strokeWidth: 2,
                  stroke: "var(--background)",
                  r: 6,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
