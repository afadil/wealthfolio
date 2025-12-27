import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoalContributionWithStatus } from "@/lib/types";
import { DonutChart } from "@wealthfolio/ui";
import { useMemo, useState } from "react";

interface GoalSourcesChartProps {
  contributions: GoalContributionWithStatus[];
  isBalanceHidden: boolean;
}

export function GoalSourcesChart({ contributions }: GoalSourcesChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const sourceData = useMemo(() => {
    const byAccount = new Map<
      string,
      { name: string; value: number; currency: string; accountId: string }
    >();

    contributions.forEach((c) => {
      const existing = byAccount.get(c.accountId);
      if (existing) {
        existing.value += c.amount;
      } else {
        byAccount.set(c.accountId, {
          name: c.accountName,
          value: c.amount,
          currency: c.accountCurrency,
          accountId: c.accountId,
        });
      }
    });

    return Array.from(byAccount.values()).sort((a, b) => b.value - a.value);
  }, [contributions]);

  const chartData = useMemo(() => {
    return sourceData.map((item) => ({
      name: item.name,
      value: item.value,
      currency: item.currency,
    }));
  }, [sourceData]);

  const handleSectionClick = (
    _data: { name: string; value: number; currency: string },
    index: number,
  ) => {
    setActiveIndex(index);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contribution Sources</CardTitle>
        <CardDescription>Where your contributions come from</CardDescription>
      </CardHeader>
      <CardContent>
        <DonutChart
          data={chartData}
          activeIndex={activeIndex}
          onSectionClick={handleSectionClick}
          startAngle={180}
          endAngle={0}
        />
      </CardContent>
    </Card>
  );
}
