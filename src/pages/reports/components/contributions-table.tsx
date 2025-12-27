import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoalContributionWithStatus } from "@/lib/types";
import { AmountDisplay } from "@wealthfolio/ui";
import { useMemo } from "react";

interface ContributionsTableProps {
  contributions: GoalContributionWithStatus[];
  isBalanceHidden: boolean;
}

export function ContributionsTable({ contributions, isBalanceHidden }: ContributionsTableProps) {
  const sortedContributions = useMemo(() => {
    return [...contributions].sort(
      (a, b) => new Date(b.contributedAt).getTime() - new Date(a.contributedAt).getTime(),
    );
  }, [contributions]);

  if (contributions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Contributions</CardTitle>
        <CardDescription>
          {contributions.length} contribution{contributions.length !== 1 ? "s" : ""} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-border divide-y rounded-md border">
          {sortedContributions.map((contribution) => {
            const date = new Date(contribution.contributedAt);
            const formattedDate = date.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            });

            return (
              <div
                key={contribution.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="flex items-center gap-4">
                  <div className="text-muted-foreground min-w-[100px] text-sm">{formattedDate}</div>
                  <span className="font-medium">{contribution.accountName}</span>
                </div>
                <div className="font-medium">
                  <AmountDisplay
                    value={contribution.amount}
                    currency={contribution.accountCurrency}
                    isHidden={isBalanceHidden}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
