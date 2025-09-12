import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui";
import { AmountDisplay, GainPercent, Icons } from "@wealthfolio/ui";
import type { FeeAnalytics, FeeSummary } from "../lib/fee-calculation.service";
import { FeeCategoriesWidget } from "./fee-categories-widget";

interface FeeOverviewCardsProps {
  feeSummary: FeeSummary;
  feeAnalytics: FeeAnalytics;
  isBalanceHidden: boolean;
}

export function FeeOverviewCards({
  feeSummary,
  feeAnalytics,
  isBalanceHidden,
}: FeeOverviewCardsProps) {
  const { totalFees, currency, monthlyAverage, yoyGrowth } = feeSummary;
  const { averageFeePerTransaction, feeAsPercentageOfPortfolio, feeImpactAnalysis } = feeAnalytics;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Fee Analytics Card 1 - Total Fees & Efficiency */}
      <Card className="border-destructive/10 bg-destructive/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {feeSummary.period === "TOTAL"
              ? "All Time Fees"
              : feeSummary.period === "LAST_YEAR"
                ? "Last Year Fees"
                : "This Year Fees"}
          </CardTitle>
          <Icons.CreditCard className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Primary Metric - Total Fees */}
            <div>
              <div className="text-2xl font-bold">
                <AmountDisplay value={totalFees} currency={currency} isHidden={isBalanceHidden} />
              </div>
              <div className="text-muted-foreground text-xs">
                {yoyGrowth !== null ? (
                  <div className="flex items-center">
                    <GainPercent value={yoyGrowth} className="text-left text-xs" animated={true} />
                    <span className="ml-2">Year-over-year change</span>
                  </div>
                ) : (
                  <span>Cumulative fees since inception</span>
                )}
              </div>
            </div>

            {/* Secondary Metrics */}
            <div className="border-destructive/10 grid grid-cols-2 gap-3 border-t pt-2">
              <div>
                <div className="text-sm font-medium">
                  <AmountDisplay
                    value={averageFeePerTransaction}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </div>
                <div className="text-muted-foreground text-xs">Avg/Transaction</div>
              </div>
              <div>
                <div className="text-sm font-medium">{feeAsPercentageOfPortfolio.toFixed(2)}%</div>
                <div className="text-muted-foreground text-xs">vs Portfolio</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fee Analytics Card 2 - Impact & Projections */}
      <Card className="border-warning/10 bg-warning/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Fee Impact Analysis</CardTitle>
          <Icons.ArrowDown className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Primary Metric - Estimated Annual */}
            <div>
              <div className="text-2xl font-bold">
                <AmountDisplay
                  value={feeImpactAnalysis.estimatedAnnualFees}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </div>
              <div className="text-muted-foreground text-xs">
                {yoyGrowth !== null ? (
                  <div className="flex items-center">
                    <span>Estimated Annual Fees</span>
                  </div>
                ) : (
                  <span>Projected annual impact</span>
                )}
              </div>
            </div>

            {/* Secondary Metrics */}
            <div className="border-warning/10 grid grid-cols-2 gap-3 border-t pt-2">
              <div>
                <div className="text-sm font-medium">
                  <AmountDisplay
                    value={feeImpactAnalysis.potentialReturnLoss}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </div>
                <div className="text-muted-foreground text-xs">Return Impact</div>
              </div>
              <div>
                <div className="text-sm font-medium">
                  <AmountDisplay
                    value={monthlyAverage}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </div>
                <div className="text-muted-foreground text-xs">Monthly Avg</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fee Categories Widget */}
      <FeeCategoriesWidget
        feeAnalytics={feeAnalytics}
        currency={currency}
        isBalanceHidden={isBalanceHidden}
      />
    </div>
  );
}
