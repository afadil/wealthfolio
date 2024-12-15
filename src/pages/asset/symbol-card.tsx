import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardTitle, CardContent, CardHeader } from '@/components/ui/card';
import { formatPercent } from '@/lib/utils';
import HistoryChart from '@/components/history-chart-symbol';
import IntervalSelector from '@/components/interval-selector'; // Ensure you have this component
import { Quote, TimePeriod } from '@/lib/types';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { useRefreshQuotesMutation } from '@/hooks/useRefreshQuotes';
import { Button } from '@/components/ui/button';
import { AmountDisplay } from '@/components/amount-display';
import { useBalancePrivacy } from '@/context/privacy-context';

// Interval descriptions mapping
const intervalDescriptions = {
  '1D': 'past day',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past 3 months',
  '1Y': 'past year',
  ALL: 'All Time',
};

const SymbolCard: React.FC<{
  marketPrice: number;
  totalGainAmount: number;
  totalGainPercent: number;
  currency: string;
  quoteHistory: Quote[];
  symbol: string;
  className?: string;
}> = ({
  marketPrice,
  totalGainAmount,
  totalGainPercent,
  currency,
  quoteHistory,
  symbol,
  className,
}) => {
  const refreshQuotesMutation = useRefreshQuotesMutation({
    successTitle: 'Quotes refreshed successfully',
    errorTitle: 'Failed to refresh quotes',
  });

  const [interval, setInterval] = useState<TimePeriod>('3M');
  const { isBalanceHidden } = useBalancePrivacy();

  // Filter data based on the selected interval
  const filteredData = useMemo(() => {
    const today = new Date();
    let comparisonDate = new Date(today);

    switch (interval) {
      case '1D':
        comparisonDate.setDate(today.getDate() - 1);
        break;
      case '1W':
        comparisonDate.setDate(today.getDate() - 7);
        break;
      case '1M':
        comparisonDate.setMonth(today.getMonth() - 1);
        break;
      case '3M':
        comparisonDate.setMonth(today.getMonth() - 3);
        break;
      case '1Y':
        comparisonDate.setFullYear(today.getFullYear() - 1);
        break;
    }

    if (interval === 'ALL') {
      return quoteHistory
        .map((quote) => ({
          date: quote.date,
          totalValue: quote.close,
          currency: currency,
        }))
        .reverse();
    }

    return quoteHistory
      .filter((quote) => new Date(quote.date) >= comparisonDate)
      .map((quote) => ({
        date: quote.date,
        totalValue: quote.close,
        currency: currency,
      }))
      .reverse();
  }, [interval, quoteHistory, currency]);

  // Gain calculation
  const { ganAmount, percentage, calculatedAt } = useMemo(() => {
    if (interval === 'ALL') {
      return { ganAmount: totalGainAmount, percentage: totalGainPercent };
    }

    const startValue = filteredData[0]?.totalValue;
    const endValue = filteredData.at(-1)?.totalValue;
    const calculatedAt = filteredData.at(-1)?.date;

    return {
      ganAmount:
        typeof startValue === 'number' && typeof endValue === 'number'
          ? (endValue - startValue) * marketPrice
          : 0,
      percentage:
        typeof startValue === 'number' && typeof endValue === 'number'
          ? ((endValue - startValue) / startValue) * 100
          : 0,
      calculatedAt: calculatedAt,
    };
  }, [filteredData, marketPrice, interval, totalGainAmount, totalGainPercent]);

  const handleIntervalSelect = (selectedInterval: TimePeriod) => {
    setInterval(selectedInterval);
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-md">
          <HoverCard>
            <HoverCardTrigger asChild className="cursor-pointer">
              <div>
                <p className="pt-3 text-xl font-bold">
                  <AmountDisplay
                    value={marketPrice}
                    currency={currency}
                    isHidden={isBalanceHidden}
                  />
                </p>
                <p className={`text-sm ${ganAmount > 0 ? 'text-success' : 'text-red-400'}`}>
                  <AmountDisplay value={ganAmount} currency={currency} isHidden={isBalanceHidden} />{' '}
                  ({formatPercent(percentage)}) {intervalDescriptions[interval]}
                </p>
              </div>
            </HoverCardTrigger>
            <HoverCardContent align="start" className="w-80 shadow-none">
              <div className="flex flex-col space-y-4">
                <div className="space-y-2">
                  <h4 className="flex text-sm font-light">
                    <Icons.Calendar className="mr-2 h-4 w-4" />
                    As of:{' '}
                    <Badge className="ml-1 font-medium" variant="secondary">
                      {calculatedAt ? `${format(new Date(calculatedAt), 'PPpp')}` : '-'}
                    </Badge>
                  </h4>
                </div>
                <Button
                  onClick={() => refreshQuotesMutation.mutate([symbol])}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={refreshQuotesMutation.isPending}
                >
                  {refreshQuotesMutation.isPending ? (
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Icons.Refresh className="mr-2 h-4 w-4" />
                  )}
                  {refreshQuotesMutation.isPending ? 'Refreshing quotes...' : 'Refresh Quotes'}
                </Button>
              </div>
            </HoverCardContent>
          </HoverCard>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative p-0">
        <HistoryChart data={filteredData} />
        <IntervalSelector
          onIntervalSelect={handleIntervalSelect}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 transform"
        />
      </CardContent>
    </Card>
  );
};

export default SymbolCard;
