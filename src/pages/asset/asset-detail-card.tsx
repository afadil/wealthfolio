import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatAmount, formatPercent } from '@/lib/utils';
import { AmountDisplay } from '@/components/amount-display';
import { QuantityDisplay } from '@/components/quantity-display';
import { useBalancePrivacy } from '@/context/privacy-context';

interface AssetDetail {
  numShares: number;
  marketValue: number;
  bookValue: number;
  averagePrice: number;
  portfolioPercent: number;
  todaysReturn: number | null;
  todaysReturnPercent: number | null;
  totalReturn: number;
  totalReturnPercent: number;
  currency: string;
  quote?: {
    open: number;
    high: number;
    low: number;
    volume: number;
    close: number;
    adjclose: number;
  } | null;
  className?: string;
}

interface AssetDetailProps {
  assetData: AssetDetail;
  className?: string;
}

const AssetDetailCard: React.FC<AssetDetailProps> = ({ assetData, className }) => {
  const { isBalanceHidden } = useBalancePrivacy();

  const {
    numShares,
    marketValue,
    bookValue,
    averagePrice,
    portfolioPercent,
    todaysReturn,
    todaysReturnPercent,
    totalReturn,
    totalReturnPercent,
    currency,
    quote,
  } = assetData;

  const holdingRows = [
    {
      label: 'Book value',
      value: <AmountDisplay value={bookValue} currency={currency} isHidden={isBalanceHidden} />,
    },
    {
      label: 'Average cost',
      value: <AmountDisplay value={averagePrice} currency={currency} isHidden={isBalanceHidden} />,
    },
    { label: '% of my portfolio', value: formatPercent(portfolioPercent) },
    ...(todaysReturn !== null && todaysReturnPercent !== null
      ? [
          {
            label: "Today's return",
            value: (
              <>
                <AmountDisplay
                  value={todaysReturn * numShares}
                  currency={currency}
                  isHidden={isBalanceHidden}
                />{' '}
                ({formatPercent(todaysReturnPercent)})
              </>
            ),
            color: todaysReturn < 0 ? 'text-destructive' : 'text-success',
          },
        ]
      : []),
    {
      label: 'Total return',
      value: `${formatAmount(totalReturn, currency)} (${formatPercent(totalReturnPercent)})`,
      color: totalReturn < 0 ? 'text-destructive' : 'text-success',
    },
  ];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="flex w-full justify-between text-lg font-bold">
          <div>
            <div>
              <QuantityDisplay value={numShares} isHidden={isBalanceHidden} />
            </div>
            <div className="text-sm font-normal text-muted-foreground">shares</div>
          </div>
          <div>
            <div className="text-xl font-extrabold">
              <AmountDisplay value={marketValue} currency={currency} isHidden={isBalanceHidden} />
            </div>
            <div className="text-right text-sm font-normal text-muted-foreground">{currency}</div>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <Separator className="my-3" />
        <div className="space-y-4 text-sm">
          {holdingRows.map(({ label, value, color }, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium ${color || ''}`}>{value}</span>
            </div>
          ))}
        </div>

        {quote && (
          <>
            <Separator className="my-4" />
            <div className="rounded-lg bg-muted/50">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Open</span>
                  <div className="text-sm font-medium">
                    <AmountDisplay
                      value={quote.open}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Close</span>
                  <div className="text-sm font-medium">
                    <AmountDisplay
                      value={quote.close}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">High</span>
                  <div className="text-sm font-medium text-success">
                    <AmountDisplay
                      value={quote.high}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Low</span>
                  <div className="text-sm font-medium text-destructive">
                    <AmountDisplay
                      value={quote.low}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Adj Close</span>
                  <div className="text-sm font-medium">
                    <AmountDisplay
                      value={quote.adjclose}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-muted-foreground">Volume</span>
                  <span className="text-sm font-medium">
                    {new Intl.NumberFormat().format(quote.volume)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AssetDetailCard;
