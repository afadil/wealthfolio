import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@wealthfolio/ui';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { AmountDisplay } from '@wealthfolio/ui';

interface FeeHistoryChartProps {
  monthlyFeeData: [string, number][];
  previousMonthlyFeeData: [string, number][];
  selectedPeriod: 'TOTAL' | 'YTD' | 'LAST_YEAR';
  currency: string;
  isBalanceHidden: boolean;
}

export function FeeHistoryChart({ 
  monthlyFeeData, 
  previousMonthlyFeeData, 
  selectedPeriod, 
  currency,
  isBalanceHidden 
}: FeeHistoryChartProps) {
  // Prepare data for the chart
  const chartData = monthlyFeeData.map(([month, currentFees], index) => {
    const [year, monthNum] = month.split('-');
    const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleDateString('en-US', { 
      month: 'short' 
    });
    
    const previousFees = previousMonthlyFeeData[index]?.[1] || 0;
    
    return {
      month: monthName,
      fullMonth: month,
      currentFees,
      previousFees,
    };
  });

  const chartConfig = {
    currentFees: {
      label: 'Current Period',
      color: 'hsl(var(--destructive))',
    },
    previousFees: {
      label: 'Previous Period',
      color: 'hsl(var(--muted-foreground))',
    },
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="text-xl">
          Fee History - {selectedPeriod === 'TOTAL' ? 'All Time' : selectedPeriod === 'LAST_YEAR' ? 'Last Year' : 'Year to Date'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => {
                  if (isBalanceHidden) return '***';
                  return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency,
                    notation: 'compact',
                  }).format(value);
                }}
              />
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col">
                            <span className="text-[0.70rem] uppercase text-muted-foreground">
                              {label}
                            </span>
                            <span className="font-bold text-muted-foreground">
                              Current: <AmountDisplay 
                                value={payload[0]?.value as number || 0} 
                                currency={currency}
                                isHidden={isBalanceHidden}
                              />
                            </span>
                            {payload[1] && (
                              <span className="text-[0.70rem] text-muted-foreground">
                                Previous: <AmountDisplay 
                                  value={payload[1]?.value as number || 0} 
                                  currency={currency}
                                  isHidden={isBalanceHidden}
                                />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line 
                type="monotone" 
                dataKey="currentFees" 
                stroke="hsl(var(--destructive))" 
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              {previousMonthlyFeeData.length > 0 && (
                <Line 
                  type="monotone" 
                  dataKey="previousFees" 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
