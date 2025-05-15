import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AmountDisplay } from '@/components/amount-display';
import { useBalancePrivacy } from '@/context/privacy-context';
import { formatPercent } from '@/lib/utils';
import type { Holding } from '@/lib/types';

// Using theme chart colors
const INDICATOR_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-9))',
];

interface CurrencyData {
  name: string;
  value: number;
  percent: number;
}

interface CurrencyChartData {
  data: CurrencyData[];
  totalBase: number;
}

function getCurrencyData(holdings: Holding[] = [], baseCurrency: string): CurrencyChartData {
  if (!Array.isArray(holdings) || !holdings.length || !baseCurrency) return { data: [], totalBase: 0 };

  // Aggregate holdings by currency using local value, calculate total base value
  const aggregation = holdings.reduce<{ currencies: Record<string, number>; totalBase: number }>(
    (acc, holding) => {
      if (!holding) return acc;

      const currency = holding.localCurrency || baseCurrency;
      const localValue = Number(holding.marketValue?.local) || 0;
      const baseValue = Number(holding.marketValue?.base) || 0;

      // Ensure we're not adding NaN values
      if (isNaN(localValue) || isNaN(baseValue)) return acc;

      const current = acc.currencies[currency] || 0;
      acc.currencies[currency] = current + localValue;
      acc.totalBase += baseValue;

      return acc;
    },
    { currencies: {}, totalBase: 0 },
  );

  const { currencies, totalBase } = aggregation;

  // Handle case where total base value is 0 to avoid division by zero
  if (totalBase === 0) return { data: [], totalBase: 0 };

  const currencyData = Object.entries(currencies)
    .map(([name, value]) => {
      // Calculate percentage based on base value relative to total base value
      // Find the corresponding base value contribution for this currency
      const baseValueContribution = holdings
        .filter((h) => (h.localCurrency || baseCurrency) === name)
        .reduce((sum, h) => sum + (Number(h.marketValue?.base) || 0), 0);

      return {
        name,
        value: Number(value) || 0, // Ensure value is a number
        percent: (baseValueContribution / totalBase) * 100 || 0, // Calculate percent based on base values
      };
    })
    .sort((a, b) => b.value - a.value);

  return { data: currencyData, totalBase };
}

interface HoldingCurrencyChartProps {
  holdings: Holding[];
  baseCurrency: string;
  isLoading?: boolean;
  onCurrencySectionClick?: (currencyName: string) => void;
}

export function HoldingCurrencyChart({
  holdings = [],
  baseCurrency = 'USD',
  isLoading = false,
  onCurrencySectionClick,
}: HoldingCurrencyChartProps) {
  const { data, totalBase } = useMemo(() => getCurrencyData(holdings, baseCurrency), [holdings, baseCurrency]);
  const { isBalanceHidden } = useBalancePrivacy();

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <Card className="overflow-hidden backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Title */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Currency Allocation
            </h3>
          </div>

          {/* Total amount */}
          <div className="flex flex-col items-baseline space-y-3">
            <div className="text-xl font-light">
              <AmountDisplay value={totalBase} currency={baseCurrency} isHidden={isBalanceHidden} />
            </div>
            {/* Progress bar */}
            <ProgressBar data={data} />
          </div>

          {/* Currency breakdown */}
          <div className="mt-2">
            {data.map((currency, index) => (
              <div
                key={currency.name}
                className="flex items-center justify-between gap-4 rounded-md py-1 transition-colors hover:bg-muted/50 cursor-pointer"
                onClick={() => onCurrencySectionClick && onCurrencySectionClick(currency.name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onCurrencySectionClick && onCurrencySectionClick(currency.name);
                  }
                }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className="h-5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: INDICATOR_COLORS[index % INDICATOR_COLORS.length] }}
                  />
                  <span className="truncate text-sm font-medium">{currency.name}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-sm font-medium">
                    <AmountDisplay
                      value={currency.value}
                      currency={baseCurrency}
                      isHidden={isBalanceHidden}
                    />
                  <span className="text-xs text-muted-foreground">|</span>
                  <span className="text-muted-foreground">{formatPercent(currency.percent/100)}</span>
                </div>
              </div>
            ))}

            {data.length === 0 && (
              <div className="rounded-md bg-muted/20 py-4 text-center text-sm text-muted-foreground">
                No currency data available
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Extracted components for better organization

function LoadingState() {
  return (
    <Card className="overflow-hidden border-muted bg-card/80 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="space-y-6">
          <Skeleton className="h-5 w-[180px]" />
          <Skeleton className="h-12 w-[220px]" />
          <Skeleton className="h-8 w-full" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ data }: { data: CurrencyData[] }) {
  // Create segments for the progress bar
  const segments = useMemo(() => {
    if (!data.length) {
      return Array.from({ length: 50 }).map((_, i) => ({
        key: `empty-${i}`,
        color: undefined,
        isEmpty: true,
      }));
    }

    const filledSegments = data.flatMap((currency, index) => {
      const segmentCount = Math.max(1, Math.round(currency.percent / 2));
      const color = INDICATOR_COLORS[index % INDICATOR_COLORS.length];

      return Array.from({ length: segmentCount }).map((_, i) => ({
        key: `${currency.name}-${i}`,
        color,
        isEmpty: false,
      }));
    });

    // Add empty segments if needed to ensure we have 50 total
    const emptyCount = Math.max(0, 50 - filledSegments.length);
    const emptySegments = Array.from({ length: emptyCount }).map((_, i) => ({
      key: `empty-${i}`,
      color: undefined,
      isEmpty: true,
    }));

    return [...filledSegments, ...emptySegments];
  }, [data]);

  return (
    <div className="flex h-6 w-full items-center justify-between gap-[1px]">
      {segments.map((segment, index) => (
        <motion.div
          key={segment.key}
          className={`h-full w-1 rounded-full origin-left ${segment.isEmpty ? 'bg-muted' : ''}`}
          style={segment.color ? { backgroundColor: segment.color } : undefined}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.3, delay: index * 0.005 }}
        />
      ))}
    </div>
  );
}
