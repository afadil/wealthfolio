import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@wealthfolio/ui';
import { AmountDisplay, GainPercent, Icons } from '@wealthfolio/ui';
import { PieChart, Pie, Cell } from 'recharts';
import type { FeeSummary } from '../hooks/use-fee-summary';
import type { FeeAnalytics } from '../lib/fee-calculation.service';

interface FeeOverviewCardsProps {
  feeSummary: FeeSummary;
  feeAnalytics: FeeAnalytics;
  isBalanceHidden: boolean;
}

export function FeeOverviewCards({ feeSummary, feeAnalytics, isBalanceHidden }: FeeOverviewCardsProps) {
  const { totalFees, currency, monthlyAverage, yoyGrowth, byCurrency } = feeSummary;
  const { feesByCategory } = feeAnalytics;

  // Prepare currency data for pie chart
  const currencyData = Object.entries(byCurrency).map(([currency, amount]) => ({
    currency,
    amount: Number(amount) || 0,
  }));

  // Calculate monthly average change (placeholder - would need historical data)
  const monthlyAverageChange = 0; // This would be calculated from historical data

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Total Fees Card */}
      <Card className="border-destructive/10 bg-destructive/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {feeSummary.period === 'TOTAL'
              ? 'All Time Fees'
              : feeSummary.period === 'LAST_YEAR'
                ? 'Last Year Fees'
                : 'This Year Fees'}
          </CardTitle>
          <Icons.CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold">
                <AmountDisplay
                  value={totalFees}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />
              </div>
              <div className="justify-start text-xs">
                {yoyGrowth !== null ? (
                  <div className="flex items-center text-xs">
                    <GainPercent
                      value={yoyGrowth}
                      className="text-left text-xs"
                      animated={true}
                    />
                    <span className="ml-2 text-xs text-muted-foreground">
                      Year-over-year change
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Cumulative fees since inception
                  </p>
                )}
              </div>
            </div>
            {currencyData.length > 0 && (
              <div className="h-16 w-16">
                <PieChart width={64} height={64}>
                  <Pie 
                    data={currencyData} 
                    dataKey="amount" 
                    nameKey="currency" 
                    paddingAngle={4}
                    outerRadius={28}
                    innerRadius={12}
                  >
                    {currencyData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${index + 2}))`} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Average Card */}
      <Card className="border-orange-500/10 bg-orange-500/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Monthly Average</CardTitle>
          <Icons.ArrowUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            <AmountDisplay
              value={monthlyAverage}
              currency={currency}
              isHidden={isBalanceHidden}
            />
          </div>
          <div className="flex items-center text-xs">
            <GainPercent value={monthlyAverageChange} className="text-left text-xs" />
            <span className="ml-2 text-xs text-muted-foreground">Since last period</span>
          </div>
        </CardContent>
      </Card>

      {/* Fee Breakdown Card */}
      <Card className="border-amber-500/10 bg-amber-500/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Fee Breakdown</CardTitle>
          <Icons.PieChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {feesByCategory.map((category, index) => (
              <div key={index} className="flex items-center">
                <div className="w-full">
                  <div className="mb-0 flex justify-between">
                    <span className="text-xs">{category.category}</span>
                    <span className="text-xs text-muted-foreground">
                      <AmountDisplay
                        value={category.amount}
                        currency={currency}
                        isHidden={isBalanceHidden}
                      />
                    </span>
                  </div>
                  <div className="relative h-4 w-full rounded-full bg-primary/20">
                    <div
                      className={`flex h-4 items-center justify-center rounded-full text-xs text-background bg-chart-${index + 1}`}
                      style={{ width: `${category.percentage}%` }}
                    >
                      {category.percentage > 0 ? `${category.percentage.toFixed(1)}%` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
