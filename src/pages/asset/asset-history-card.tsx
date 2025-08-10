import React, { useState, useMemo } from 'react';
import { format, subMonths } from 'date-fns';
import { Card, CardTitle, CardContent, CardHeader } from '@/components/ui/card';
import { formatPercent } from '@wealthfolio/ui';
import HistoryChart from '@/components/history-chart-symbol';
import IntervalSelector from '@/components/interval-selector';
import { Quote, TimePeriod, DateRange } from '@/lib/types';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Icons } from '@/components/ui/icons';
import { Badge } from '@/components/ui/badge';
import { useSyncMarketDataMutation } from '@/hooks/use-sync-market-data';
import { Button } from '@/components/ui/button';
import { AmountDisplay } from '@wealthfolio/ui';
import { useBalancePrivacy } from '@/context/privacy-context';

interface AssetHistoryProps {
  marketPrice: number;
  totalGainAmount: number;
  totalGainPercent: number;
  currency: string;
  quoteHistory: Quote[];
  symbol: string;
  className?: string;
}

const AssetHistoryCard: React.FC<AssetHistoryProps> = ({ 
  marketPrice,
  totalGainAmount,
  totalGainPercent,
  currency,
  quoteHistory,
  symbol,
  className,
 }) => {
  const syncMarketDataMutation = useSyncMarketDataMutation();
  const { isBalanceHidden } = useBalancePrivacy();

  const [selectedIntervalCode, setSelectedIntervalCode] = useState<TimePeriod>('3M');
  const [selectedIntervalDesc, setSelectedIntervalDesc] = useState<string>('past 3 months');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 3),
    to: new Date(),
  });

  const filteredData = useMemo(() => {
    if (!quoteHistory) return [];
    
    if (!dateRange?.from || !dateRange?.to || selectedIntervalCode === 'ALL') {
      return quoteHistory
        .map((quote) => ({
          timestamp: quote.timestamp,
          totalValue: quote.close,
          currency: currency,
        }))
    }

    return quoteHistory
      .filter((quote) => {
        const quoteDate = new Date(quote.timestamp);
        return dateRange.from && dateRange.to && quoteDate >= dateRange.from && quoteDate <= dateRange.to;
      })
      .map((quote) => ({
        timestamp: quote.timestamp,
        totalValue: quote.close,
        currency: currency,
      }))
  }, [dateRange, quoteHistory, currency, selectedIntervalCode]);

  const { ganAmount, percentage, calculatedAt } = useMemo(() => {
    const lastFilteredDate = filteredData.at(-1)?.timestamp;

    if (selectedIntervalCode === 'ALL') {
      const lastQuoteDate = quoteHistory.length > 0 ? quoteHistory[quoteHistory.length - 1].timestamp : undefined;
      return { ganAmount: totalGainAmount, percentage: totalGainPercent, calculatedAt: lastQuoteDate };
    }

    const startValue = filteredData[0]?.totalValue;
    const endValue = filteredData.at(-1)?.totalValue;
    const isValidStartValue = typeof startValue === 'number' && startValue !== 0;

    return {
      ganAmount:
        typeof startValue === 'number' && typeof endValue === 'number'
          ? endValue - startValue
          : 0,
      percentage:
        isValidStartValue && typeof endValue === 'number'
          ? ((endValue - startValue) / startValue)
          : 0,
      calculatedAt: lastFilteredDate,
    };
  }, [filteredData, selectedIntervalCode, quoteHistory, totalGainAmount, totalGainPercent]);

  const handleIntervalSelect = (
    code: TimePeriod,
    description: string,
    range: DateRange | undefined
  ) => {
    setSelectedIntervalCode(code);
    setSelectedIntervalDesc(description);
    setDateRange(range);
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
                <p className={`text-sm ${ganAmount > 0 ? 'text-success' : 'text-destructive'}`}>
                  <AmountDisplay value={ganAmount} currency={currency} isHidden={isBalanceHidden} />{' '}
                  ({formatPercent(percentage)}) {selectedIntervalDesc}
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
                  onClick={() => syncMarketDataMutation.mutate([symbol])}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={syncMarketDataMutation.isPending}
                >
                  {syncMarketDataMutation.isPending ? (
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Icons.Refresh className="mr-2 h-4 w-4" />
                  )}
                  {syncMarketDataMutation.isPending ? 'Refreshing quotes...' : 'Refresh Quotes'}
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
          isLoading={syncMarketDataMutation.isPending}
          initialSelection="3M"
        />
      </CardContent>
    </Card>
  );
};

export default AssetHistoryCard;
