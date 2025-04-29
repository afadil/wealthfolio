import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Holding, HoldingType } from '@/lib/types';
import { formatAmount } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { AmountDisplay } from '@/components/amount-display';
import { useBalancePrivacy } from '@/context/privacy-context';
import { QuantityDisplay } from '@/components/quantity-display';
import { getHoldings } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';

const AccountHoldings = ({ accountId }: { accountId: string }) => {
  const { isBalanceHidden } = useBalancePrivacy();

  const { data: holdings, isLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS, accountId],
    queryFn: () => getHoldings(accountId),
  });

  if (!isLoading && !holdings?.length) {
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
              <div className="text-right font-medium text-muted-foreground">Total value</div>
              <div className="text-right font-medium text-muted-foreground">Today's price</div>
              <div className="text-right font-medium text-muted-foreground">All time return</div>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {holdings?.filter(holding => holding.holdingType !== HoldingType.CASH).map((holding) => (
              <div key={holding.id} className="grid grid-cols-5 gap-4 border-b p-4 text-sm">
                <div className="col-span-2 flex-grow text-left">
                  <p className="mb-1 font-bold">
                    <Link to={`/holdings/${holding.instrument?.symbol}`}>{holding.instrument?.symbol ?? '-'}</Link>
                  </p>
                  <p className="text-sm">{holding.instrument?.name}</p>
                </div>

                <div className="text-right">
                  <AmountDisplay
                    value={holding.marketValue.local}
                    currency={holding.localCurrency}
                    isHidden={isBalanceHidden}
                  />
                  <p className="text-sm text-muted-foreground">
                    <QuantityDisplay value={holding.quantity} isHidden={isBalanceHidden} /> shares
                  </p>
                </div>

                <div className="text-right">
                  <p>{formatAmount(holding.price ?? 0, holding.localCurrency, false)}</p>
                  <p className="text-sm text-muted-foreground">{holding.localCurrency}</p>
                </div>

                <div className="text-right flex items-center justify-end gap-4">
                  <GainAmount
                    value={holding.totalGain?.local ?? 0}
                    currency={holding.localCurrency}
                    displayCurrency={false}
                  />
                  <GainPercent
                    value={holding.totalGainPct ?? 0}
                    animated={true}
                    variant="badge"
                  />
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
