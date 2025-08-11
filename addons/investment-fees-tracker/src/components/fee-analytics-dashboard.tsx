import { Card, CardContent, CardHeader, CardTitle } from '@wealthfolio/ui';
import { AmountDisplay, Icons, Badge } from '@wealthfolio/ui';
import type { FeeAnalytics } from '../lib/fee-calculation.service';

interface FeeAnalyticsDashboardProps {
  feeAnalytics: FeeAnalytics;
  currency: string;
  isBalanceHidden: boolean;
}

export function FeeAnalyticsDashboard({ feeAnalytics, currency, isBalanceHidden }: FeeAnalyticsDashboardProps) {
  const { 
    averageFeePerTransaction, 
    feeAsPercentageOfPortfolio, 
    highestFeeTransaction,
    feesByCategory,
    feeImpactAnalysis
  } = feeAnalytics;

  return (
    <div className="space-y-6">
      {/* Fee Efficiency Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Fee/Transaction</CardTitle>
            <Icons.DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <AmountDisplay
                value={averageFeePerTransaction}
                currency={currency}
                isHidden={isBalanceHidden}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fees vs Portfolio</CardTitle>
            <Icons.Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {feeAsPercentageOfPortfolio.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Of total portfolio value
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estimated Annual</CardTitle>
            <Icons.Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <AmountDisplay
                value={feeImpactAnalysis.estimatedAnnualFees}
                currency={currency}
                isHidden={isBalanceHidden}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Based on YTD trends
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Return Impact</CardTitle>
            <Icons.ArrowDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <AmountDisplay
                value={feeImpactAnalysis.potentialReturnLoss}
                currency={currency}
                isHidden={isBalanceHidden}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Potential lost returns
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Fee Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fee Categories</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {feesByCategory.map((category, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div 
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: `hsl(var(--chart-${index + 1}))` }}
                  />
                  <div>
                    <div className="font-medium">{category.category}</div>
                    <div className="text-sm text-muted-foreground">
                      {category.transactions} transactions
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    <AmountDisplay
                      value={category.amount}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {category.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Highest Fee Transaction */}
      {highestFeeTransaction && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center space-x-2">
              <Icons.AlertTriangle className="h-5 w-5 text-amber-500" />
              <span>Highest Fee Transaction</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Badge className="bg-destructive text-destructive-foreground">
                  {highestFeeTransaction.assetSymbol}
                </Badge>
                <div>
                  <div className="font-medium">{highestFeeTransaction.activityType}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(highestFeeTransaction.date).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-destructive">
                  <AmountDisplay
                    value={highestFeeTransaction.fee}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  Transaction fee
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
