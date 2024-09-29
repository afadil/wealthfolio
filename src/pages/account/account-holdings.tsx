import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Holding } from '@/lib/types';
import { formatAmount, formatStockQuantity } from '@/lib/utils';
import { Link } from 'react-router-dom';

const AccountHoldings = ({ holdings, isLoading }: { holdings: Holding[]; isLoading: boolean }) => {
  if (!isLoading && !holdings.length) {
    return null;
  }

  return (
    <div>
      <h3 className="py-4 text-lg font-bold">Holdings</h3>
      {isLoading ? (
        <div className="flex flex-col space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-2 text-left" />
              <div className="text-right font-medium text-gray-600">Total value</div>
              <div className="text-right font-medium text-gray-600">Today’s price</div>
              <div className="text-right font-medium text-gray-600">All time return</div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {holdings.map((holding) => (
              <div key={holding.id} className="grid grid-cols-5 gap-4 border-b p-4">
                <div className="col-span-2 flex-grow text-left">
                  <p className="mb-1 font-bold">
                    <Link to={`/holdings/${holding.symbol}`}>{holding.symbol}</Link>
                  </p>
                  <p className="text-sm">{holding.symbolName}</p>
                </div>

                <div className="text-right">
                  <p className="">{formatAmount(holding.marketValueConverted, holding.currency)}</p>
                  <p className="text-sm text-gray-600">
                    {formatStockQuantity(holding.quantity)} shares
                  </p>
                </div>

                <div className="text-right">
                  <p className=" ">
                    {formatAmount(holding.marketPrice || 0, holding.currency, false)}
                  </p>
                  <p className="text-sm text-gray-600">{holding.currency}</p>
                </div>

                <div className="text-right">
                  <GainAmount
                    className="text-sm"
                    value={holding.performance.totalGainAmount}
                    currency={holding.currency}
                  ></GainAmount>
                  <GainPercent
                    className="text-sm"
                    value={holding.performance.totalGainPercent}
                  ></GainPercent>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AccountHoldings;
