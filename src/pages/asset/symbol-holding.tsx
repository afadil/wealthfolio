import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatAmount, formatPercent, formatStockQuantity } from '@/lib/utils';

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
    { label: 'Book value', value: formatAmount(bookValue, currency) },
    { label: 'Average cost', value: formatAmount(averagePrice, currency) },
    { label: '% of my portfolio', value: formatPercent(portfolioPercent) },
    {
      label: "Today's return",
      value: `${formatAmount(todaysReturn * numShares, currency)} (${formatPercent(
        todaysReturnPercent / 100,
      )})`,
      color: todaysReturn < 0 ? 'text-red-400' : 'text-success',
    },
    {
      label: 'Total return',
      value: `${formatAmount(totalReturn, currency)} (${formatPercent(totalReturnPercent)})`,
      color: totalReturn < 0 ? 'text-red-400' : 'text-success',
    },
  ];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle className="flex w-full justify-between text-lg font-bold">
          <div>
            <div>{formatStockQuantity(numShares)}</div>
            <div className="text-sm font-normal text-muted-foreground">shares</div>
          </div>
          <div>
            <div className="text-xl font-extrabold">
              {formatAmount(marketValue, currency, false)}
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
