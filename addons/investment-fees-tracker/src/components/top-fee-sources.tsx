import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@wealthfolio/ui';
import { Badge, Icons, AmountDisplay } from '@wealthfolio/ui';
import type { FeeAnalytics } from '../lib/fee-calculation.service';

// Simple EmptyPlaceholder component since it's not exported from UI package
function EmptyPlaceholder({ 
  className, 
  icon, 
  title, 
  description 
}: { 
  className?: string; 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
}) {
  return (
    <div className={`flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center ${className || ''}`}>
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
          {icon}
        </div>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-center text-sm font-normal leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

interface TopFeeSourcesProps {
  feeAnalytics: FeeAnalytics;
  currency: string;
  isBalanceHidden: boolean;
}

export function TopFeeSources({ feeAnalytics, currency, isBalanceHidden }: TopFeeSourcesProps) {
  const { assetFeeAnalysis } = feeAnalytics;
  
  // Get top 10 fee sources
  const topFeeSources = assetFeeAnalysis.slice(0, 10);

  if (topFeeSources.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Top Fee Sources</CardTitle>
        </CardHeader>
        <CardContent className="h-full">
          <EmptyPlaceholder
            className="mx-auto flex h-[300px] max-w-[420px] items-center justify-center"
            icon={<Icons.CreditCard className="h-10 w-10" />}
            title="No fee data available"
            description="There are no recorded fees for the selected period. Try selecting a different time range or check back later."
          />
        </CardContent>
      </Card>
    );
  }

  // Calculate total fees for percentage calculations
  const totalFees = topFeeSources.reduce((sum: number, source) => sum + source.totalFees, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Top Fee Sources</CardTitle>
      </CardHeader>
      <CardContent className="h-full">
        <div className="space-y-6">
          {/* Horizontal Bar Chart */}
          <div className="flex w-full space-x-0.5">
            {(() => {
              const top5Sources = topFeeSources.slice(0, 5);
              const otherSources = topFeeSources.slice(5);
              const otherTotal = otherSources.reduce((sum: number, source) => sum + source.totalFees, 0);
              
              const chartItems = [
                ...top5Sources.map((source: FeeAnalytics['assetFeeAnalysis'][0]) => ({
                  symbol: source.assetSymbol,
                  name: source.assetName,
                  fees: source.totalFees,
                  isOther: false,
                })),
                ...(otherTotal > 0 ? [{
                  symbol: 'Other',
                  name: `${otherSources.length} other assets`,
                  fees: otherTotal,
                  isOther: true,
                }] : []),
              ];

              const colors = [
                'var(--chart-1)',
                'var(--chart-2)',
                'var(--chart-3)',
                'var(--chart-4)',
                'var(--chart-5)',
                'var(--chart-6)',
              ];

              return chartItems.map((item, index) => {
                const percentage = totalFees > 0 ? (item.fees / totalFees) * 100 : 0;
                
                return (
                  <div
                    key={index}
                    className="group relative h-5 cursor-pointer rounded-lg transition-all duration-300 ease-in-out hover:brightness-110"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: colors[index % colors.length],
                    }}
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 transform group-hover:block">
                      <div className="min-w-[180px] rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
                        <div className="text-sm font-medium">{item.symbol}</div>
                        <div className="text-xs text-muted-foreground">{item.name}</div>
                        <div className="text-sm font-medium">
                          <AmountDisplay value={item.fees} currency={currency} isHidden={isBalanceHidden} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {percentage.toFixed(1)}% of total fees
                        </div>
                        {/* Tooltip arrow */}
                        <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 transform border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border"></div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Detailed List */}
          <div className="space-y-3">
            {topFeeSources.map((source: FeeAnalytics['assetFeeAnalysis'][0], index: number) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Badge className="flex min-w-[60px] items-center justify-center rounded-sm bg-primary text-xs">
                    {source.assetSymbol}
                  </Badge>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{source.assetName}</span>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <span>{source.transactionCount} transactions</span>
                      <span>•</span>
                      <span>
                        <AmountDisplay 
                          value={source.averageFeePerTransaction} 
                          currency={currency} 
                          isHidden={isBalanceHidden}
                        /> avg
                      </span>
                      {source.feeAsPercentageOfVolume > 0 && (
                        <>
                          <span>•</span>
                          <span>{source.feeAsPercentageOfVolume.toFixed(2)}% of volume</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-destructive">
                    <AmountDisplay 
                      value={source.totalFees} 
                      currency={currency} 
                      isHidden={isBalanceHidden}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {totalFees > 0 ? ((source.totalFees / totalFees) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
