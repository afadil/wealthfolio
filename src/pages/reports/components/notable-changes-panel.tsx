import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { PrivacyAmount, formatPercent } from "@wealthfolio/ui";
import { useMemo } from "react";
import { format, subMonths } from "date-fns";
import type { SpendingSummary } from "@/lib/types";
import { ArrowUp, ArrowDown } from "lucide-react";

interface NotableChangesPanelProps {
  spendingData: SpendingSummary | null | undefined;
  selectedMonth: string;
  currency: string;
}

interface CategoryWithChange {
  categoryId: string;
  categoryName: string;
  amount: number;
  prevAmount: number;
  changePercent: number | null;
  isNew?: boolean;
}

export function NotableChangesPanel({
  spendingData,
  selectedMonth,
  currency,
}: NotableChangesPanelProps) {
  const notableChanges = useMemo(() => {
    if (!spendingData || !selectedMonth) {
      return [];
    }

    const prevMonth = format(subMonths(new Date(selectedMonth + "-01"), 1), "yyyy-MM");
    const currentBreakdown = spendingData.byMonthByCategory?.[selectedMonth] || {};
    const prevBreakdown = spendingData.byMonthByCategory?.[prevMonth] || {};
    const categorySpending = spendingData.byCategory || {};

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
          amount: amount as number,
          prevAmount,
          changePercent,
          isNew,
        };
      })
      .filter((c) => c.amount > 0);

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
          amount: 0,
          prevAmount: prevAmount as number,
          changePercent: -100,
        };
      })
      .filter((c) => c.prevAmount > 0);

    const allChanges = [
      ...categoriesWithChanges.filter((c) => c.changePercent !== null || c.isNew),
      ...goneCategories,
    ];

    return allChanges
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
  }, [spendingData, selectedMonth]);

  if (notableChanges.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Notable Changes</CardTitle>
          <Icons.TrendingUp className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No notable changes this month</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Notable Changes</CardTitle>
        <Icons.TrendingUp className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {notableChanges.map((cat) => (
            <div key={cat.categoryId} className="flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <span className="text-foreground block truncate font-medium">{cat.categoryName}</span>
                {cat.isNew ? (
                  <span className="text-destructive flex items-center gap-1 text-xs font-medium">
                    <ArrowUp className="h-3 w-3" />
                    New
                  </span>
                ) : (
                  <span
                    className={`flex items-center gap-1 text-xs font-medium ${
                      cat.changePercent! > 0 ? "text-destructive" : "text-success"
                    }`}
                  >
                    {cat.changePercent! > 0 ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                    {formatPercent(Math.abs(cat.changePercent!) / 100)}
                  </span>
                )}
              </div>
              <div className="ml-2 shrink-0 text-right">
                <div className="font-medium">
                  <PrivacyAmount value={cat.amount} currency={currency} />
                </div>
                <div className="text-muted-foreground text-xs">
                  from <PrivacyAmount value={cat.prevAmount} currency={currency} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
