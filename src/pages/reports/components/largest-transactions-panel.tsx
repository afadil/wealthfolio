import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { ViewTransactionsButton } from "@/components/view-transactions-button";
import { PrivacyAmount } from "@wealthfolio/ui";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import type { ActivityDetails } from "@/lib/types";

interface LargestTransactionsPanelProps {
  selectedMonth: string;
  currency: string;
  topTransactions: ActivityDetails[];
  isLoading: boolean;
}

export function LargestTransactionsPanel({
  selectedMonth,
  currency,
  topTransactions,
  isLoading,
}: LargestTransactionsPanelProps) {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Largest Transactions</CardTitle>
          <Icons.CreditCard className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Largest Transactions</CardTitle>
        <Icons.CreditCard className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {topTransactions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-muted-foreground text-sm">No transactions this month</p>
          </div>
        ) : (
          <>
            <div className="max-h-[180px] flex-1 space-y-2 overflow-y-auto">
              {topTransactions.map((transaction) => {
                const isDeposit = transaction.activityType === "DEPOSIT";
                const amountColorClass = isDeposit ? "text-success" : "text-destructive";
                const displayAmount = isDeposit ? Math.abs(transaction.amount) : -Math.abs(transaction.amount);

                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between rounded-lg border p-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                        <Icons.CreditCard className="text-muted-foreground h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          {transaction.name || transaction.assetId}
                        </p>
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          <span className="truncate">{transaction.categoryName || "Uncategorized"}</span>
                          <span>·</span>
                          <span className="shrink-0">{format(transaction.date, "MMM d")}</span>
                        </div>
                      </div>
                    </div>
                    <div className="ml-2 shrink-0">
                      <span className={`text-xs font-semibold ${amountColorClass}`}>
                        <PrivacyAmount value={displayAmount} currency={currency} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <ViewTransactionsButton
              dateRange={{
                startDate: format(startOfMonth(parseISO(selectedMonth + "-01")), "yyyy-MM-dd"),
                endDate: format(endOfMonth(parseISO(selectedMonth + "-01")), "yyyy-MM-dd"),
              }}
              className="mt-3 w-full gap-2"
              size="sm"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
