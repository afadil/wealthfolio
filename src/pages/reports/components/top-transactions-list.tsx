import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/ui/icons";
import { PrivacyAmount } from "@wealthfolio/ui";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { ActivityDetails } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface TopTransactionsListProps {
  transactions: ActivityDetails[];
  currency: string;
  isLoading: boolean;
  selectedMonth: string;
}

export function TopTransactionsList({
  transactions,
  currency,
  isLoading,
  selectedMonth,
}: TopTransactionsListProps) {
  const navigate = useNavigate();

  const handleViewTransactions = () => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const end = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    navigate(`/activity?tab=cash&startDate=${start}&endDate=${end}`);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top 5 Largest Expenses</CardTitle>
          <Icons.Receipt className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Top 5 Largest Expenses</CardTitle>
        <Icons.Receipt className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-muted-foreground text-sm">No expenses this month</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                    <Icons.CreditCard className="text-muted-foreground h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {transaction.name || transaction.assetId}
                    </p>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span>{transaction.categoryName || "Uncategorized"}</span>
                      <span>·</span>
                      <span>{format(transaction.date, "MMM d")}</span>
                    </div>
                  </div>
                </div>
                <div className="ml-2 shrink-0 text-right">
                  <span className="text-destructive font-semibold">
                    <PrivacyAmount value={transaction.amount} currency={currency} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-4 w-full gap-2"
          onClick={handleViewTransactions}
        >
          <ExternalLink className="h-4 w-4" />
          View All Transactions
        </Button>
      </CardContent>
    </Card>
  );
}
