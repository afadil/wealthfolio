import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useQuery } from "@tanstack/react-query";
import { getMonthMetrics } from "@/commands/activity";
import { QueryKeys } from "@/lib/query-keys";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface MonthMetricsPanelProps {
  selectedMonth: string;
  currency: string;
  isHidden: boolean;
  /** Event IDs to include (page-wide filter) */
  includeEventIds?: string[];
  /** Whether to include all events (page-wide filter) */
  includeAllEvents?: boolean;
}

export function MonthMetricsPanel({
  selectedMonth,
  currency,
  isHidden,
  includeEventIds,
  includeAllEvents = false,
}: MonthMetricsPanelProps) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: [QueryKeys.MONTH_METRICS, selectedMonth, includeEventIds, includeAllEvents],
    queryFn: () => getMonthMetrics(selectedMonth, includeEventIds, includeAllEvents),
    enabled: !!selectedMonth,
  });

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transaction Metrics</CardTitle>
          <Icons.BarChart className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
          <Skeleton className="h-px w-full" />
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transaction Metrics</CardTitle>
          <Icons.BarChart className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No transaction data for this month</p>
        </CardContent>
      </Card>
    );
  }

  const renderChangeIndicator = (changePercent: number | null | undefined) => {
    if (changePercent === null || changePercent === undefined) {
      return <span className="text-muted-foreground text-xs">-</span>;
    }

    // For spending metrics, increase is bad (destructive), decrease is good (success)
    const isPositive = changePercent > 0;
    const colorClass = isPositive ? "text-destructive" : "text-success";

    return (
      <span className={`flex items-center gap-0.5 text-xs ${colorClass}`}>
        {isPositive ? (
          <ArrowUp className="h-3 w-3" />
        ) : changePercent < 0 ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <Minus className="h-3 w-3" />
        )}
        {formatPercent(Math.abs(changePercent) / 100)}
      </span>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Transaction Metrics</CardTitle>
        <Icons.BarChart className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Avg Transaction</p>
            <p className="text-lg font-semibold">
              <PrivacyAmount value={metrics.avgTransactionSize} currency={currency} />
            </p>
            {renderChangeIndicator(metrics.prevMonth?.avgChangePercent)}
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Transactions</p>
            <p className="text-lg font-semibold">{isHidden ? "••••" : metrics.transactionCount}</p>
            {renderChangeIndicator(metrics.prevMonth?.countChangePercent)}
          </div>

          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">Median</p>
            <p className="text-lg font-semibold">
              <PrivacyAmount value={metrics.medianTransaction} currency={currency} />
            </p>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-muted-foreground mb-3 text-xs font-medium">Recurrence Breakdown</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs">Fixed</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.fixedPercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (
                  <PrivacyAmount
                    value={metrics.recurrenceBreakdown?.fixedAmount ?? 0}
                    currency={currency}
                  />
                  )
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs">Variable</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.variablePercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (
                  <PrivacyAmount
                    value={metrics.recurrenceBreakdown?.variableAmount ?? 0}
                    currency={currency}
                  />
                  )
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs">Periodic</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.periodicPercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (
                  <PrivacyAmount
                    value={metrics.recurrenceBreakdown?.periodicAmount ?? 0}
                    currency={currency}
                  />
                  )
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-muted-foreground text-xs">Non-recurring</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.nonRecurringPercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (
                  <PrivacyAmount
                    value={metrics.recurrenceBreakdown?.nonRecurringAmount ?? 0}
                    currency={currency}
                  />
                  )
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
