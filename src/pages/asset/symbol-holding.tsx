import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatAmount, formatPercent } from '@/lib/utils';
import { AmountDisplay } from '@/components/amount-display';
import { QuantityDisplay } from '@/components/quantity-display';
import { useBalancePrivacy } from '@/context/privacy-context';

interface HoldingData {
  numShares: number;
  marketValue: number;
  bookValue: number;
  averagePrice: number;
  portfolioPercent: number;
  todaysReturn: number;
  todaysReturnPercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  currency: string;
}

interface SymbolHoldingProps {
  holdingData: HoldingData;
  className?: string;
}

const SymbolHoldingCard: React.FC<SymbolHoldingProps> = ({ holdingData, className }) => {
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
  } = holdingData;

  const rows = [
    {
      label: 'Book value',
      value: <AmountDisplay value={bookValue} currency={currency} isHidden={isBalanceHidden} />,
    },
    {
      label: 'Average cost',
      value: <AmountDisplay value={averagePrice} currency={currency} isHidden={isBalanceHidden} />,
    },
    { label: '% of my portfolio', value: formatPercent(portfolioPercent) },
    {
      label: "Today's return",
      value: (
        <>
          <AmountDisplay
            value={todaysReturn * numShares}
            currency={currency}
            isHidden={isBalanceHidden}
          />{' '}
          ({formatPercent(todaysReturnPercent / 100)})
        </>
      ),
      color: todaysReturn < 0 ? 'text-destructive' : 'text-success',
    },
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
        <Separator className="my-4" />
        <div className="space-y-4 text-sm">
          {rows.map(({ label, value, color }, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium ${color || ''}`}>{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default SymbolHoldingCard;
