import { Holding } from '@/lib/types';
import { useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { AmountDisplay } from '@/components/amount-display';
import { useBalancePrivacy } from '@/context/privacy-context';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

function getCurrencyData(holdings: Holding[], baseCurrency: string) {
  if (!holdings?.length) return [];

  const currencies = holdings.reduce(
    (acc, holding) => {
      const currency = holding.currency || baseCurrency;
      const current = acc[currency] || 0;
      acc[currency] = Number(current) + Number(holding.marketValueConverted);
      return acc;
    },
    {} as Record<string, number>,
  );

  const total = Object.values(currencies).reduce((sum, value) => sum + value, 0);
  
  return Object.entries(currencies)
    .map(([name, value]) => ({ 
      name, 
      value, 
      percent: (value / total) * 100 
    }))
    .sort((a, b) => b.value - a.value);
}

interface HoldingCurrencyChartProps {
  holdings: Holding[];
  baseCurrency: string;
  isLoading?: boolean;
}

// Using theme chart colors
const INDICATOR_COLORS = [
  'bg-[hsl(var(--chart-1))]',
  'bg-[hsl(var(--chart-3))]',
  'bg-[hsl(var(--chart-5))]',
  'bg-[hsl(var(--chart-6))]',
  'bg-[hsl(var(--chart-7))]',
];

export function HoldingCurrencyChart({
  holdings,
  baseCurrency,
  isLoading,
}: HoldingCurrencyChartProps) {
  const data = useMemo(() => getCurrencyData(holdings, baseCurrency), [holdings, baseCurrency]);
  const { isBalanceHidden } = useBalancePrivacy();
  
  // Calculate the total for the spending amount
  const totalAmount = useMemo(() => 
    data.reduce((sum, item) => sum + item.value, 0), 
    [data]
  );
  
  if (isLoading) {
    return (
      <div className="flex flex-col space-y-4">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-8 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    );
  }

  return (
    <Card className="flex flex-col space-y-5 p-4 rounded-lg">
      <div>
        <h2 className="text-lg text-muted-foreground tracking-wide uppercase">Currency Distribution</h2>
        <div className="flex justify-between items-center mt-1">
          <p className="text-3xl font-semibold">
            <AmountDisplay 
              value={totalAmount} 
              currency={baseCurrency}
              isHidden={isBalanceHidden}
            />
          </p>
          <span className="text-2xl text-muted-foreground">
            {data.length ? `${data.length} currencies` : "No data"}
          </span>
        </div>
      </div>
      
      {/* Indicator bar */}
      <div className="flex gap-[2px] mt-3 mb-2">
        {data.map((item, index) => (
          <div
            key={item.name}
            className={cn(
              'h-6 rounded-sm',
              INDICATOR_COLORS[index % INDICATOR_COLORS.length]
            )}
            style={{ width: `${item.percent}%` }}
          />
        ))}
        {data.length > 0 && (
          <div
            className="h-6 bg-muted rounded-sm"
            style={{ width: `${Math.max(0, 100 - data.reduce((sum, item) => sum + item.percent, 0))}%` }}
          />
        )}
      </div>
      
      {/* Legend and amounts */}
      <div className="flex flex-col space-y-3 mt-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center">
              <div 
                className={cn(
                  'w-1.5 h-6 mr-3 rounded-sm',
                  INDICATOR_COLORS[index % INDICATOR_COLORS.length]
                )}
              />
              <span className="text-base font-medium">{item.name}</span>
            </div>
            <div className="flex items-center">
              <AmountDisplay 
                value={item.value} 
                currency={baseCurrency}
                isHidden={isBalanceHidden}
              />
              <span className="text-muted-foreground ml-2">
                {item.percent.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
