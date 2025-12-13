import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { ViewTransactionsButton } from "@/components/view-transactions-button";
import { formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useQuery } from "@tanstack/react-query";
import { getMonthMetrics } from "@/commands/activity";
import { QueryKeys } from "@/lib/query-keys";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import type { ActivityDetails } from "@/lib/types";

interface MonthMetricsPanelProps {
  selectedMonth: string;
  currency: string;
  isHidden: boolean;
  topTransactions: ActivityDetails[];
  isTransactionsLoading: boolean;
}

export function MonthMetricsPanel({
  selectedMonth,
  currency,
  isHidden,
  topTransactions,
  isTransactionsLoading,
}: MonthMetricsPanelProps) {
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: [QueryKeys.MONTH_METRICS, selectedMonth],
    queryFn: () => getMonthMetrics(selectedMonth),
    enabled: !!selectedMonth,
  });

  const isLoading = isMetricsLoading || isTransactionsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transaction Metrics</CardTitle>
          <Icons.BarChart className="h-4 w-4 text-muted-foreground" />
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
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Transaction Metrics</CardTitle>
          <Icons.BarChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center">
          <p className="text-sm text-muted-foreground">No transaction data for this month</p>
        </CardContent>
      </Card>
    );
  }

  const renderChangeIndicator = (changePercent: number | null | undefined) => {
    if (changePercent === null || changePercent === undefined) {
      return <span className="text-xs text-muted-foreground">-</span>;
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Transaction Metrics</CardTitle>
        <Icons.BarChart className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Avg Transaction</p>
            <p className="text-lg font-semibold">
              <PrivacyAmount value={metrics.avgTransactionSize} currency={currency} />
            </p>
            {renderChangeIndicator(metrics.prevMonth?.avgChangePercent)}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground"># of Transactions</p>
            <p className="text-lg font-semibold">
              {isHidden ? "••••" : metrics.transactionCount}
            </p>
            {renderChangeIndicator(metrics.prevMonth?.countChangePercent)}
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Median</p>
            <p className="text-lg font-semibold">
              <PrivacyAmount value={metrics.medianTransaction} currency={currency} />
            </p>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-3">Recurrence Breakdown</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Fixed</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.fixedPercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (<PrivacyAmount value={metrics.recurrenceBreakdown?.fixedAmount ?? 0} currency={currency} />)
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Variable</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.variablePercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (<PrivacyAmount value={metrics.recurrenceBreakdown?.variableAmount ?? 0} currency={currency} />)
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Periodic</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.periodicPercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (<PrivacyAmount value={metrics.recurrenceBreakdown?.periodicAmount ?? 0} currency={currency} />)
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Non-recurring</p>
              <p className="text-sm font-medium">
                {formatPercent((metrics.recurrenceBreakdown?.nonRecurringPercent ?? 0) / 100)}{" "}
                <span className="text-muted-foreground">
                  (<PrivacyAmount value={metrics.recurrenceBreakdown?.nonRecurringAmount ?? 0} currency={currency} />)
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-3">Top Expenses</p>
          {topTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No expenses this month</p>
          ) : (
            <div className="space-y-2">
              {topTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icons.CreditCard className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate text-sm">
                        {transaction.name || transaction.assetId}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{transaction.categoryName || "Uncategorized"}</span>
                        <span>·</span>
                        <span>{format(transaction.date, "MMM d")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 ml-2">
                    <span className="font-semibold text-destructive text-sm">
                      <PrivacyAmount value={transaction.amount} currency={currency} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <ViewTransactionsButton
            dateRange={{
              startDate: format(startOfMonth(parseISO(selectedMonth + "-01")), "yyyy-MM-dd"),
              endDate: format(endOfMonth(parseISO(selectedMonth + "-01")), "yyyy-MM-dd"),
            }}
            className="w-full gap-2 mt-3"
          />
        </div>
      </CardContent>
    </Card>
  );
}
