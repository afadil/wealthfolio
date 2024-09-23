import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Badge } from '@/components/ui/badge';
import { useLocation, useParams } from 'react-router-dom';
import SymbolCard from './symbol-card';
import SymbolHoldingCard from './symbol-holding';
import { AssetData, Holding } from '@/lib/types';
import { getAssetData } from '@/commands/market-data';
import { useQuery } from '@tanstack/react-query';

export const AssetProfilePage = () => {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const location = useLocation();

  const holding = location.state?.holding as Holding;
  const { data, isLoading } = useQuery<AssetData, Error>({
    queryKey: ['asset_data', symbol],
    queryFn: () => getAssetData(symbol),
  });

  if (isLoading) return null;

  const quote = data?.quoteHistory ? data?.quoteHistory[0] : null;

  const profile = {
    ...data?.asset,
    marketPrice: quote?.adjclose ?? 0,
    totalGainAmount: holding?.performance?.totalGainAmount ?? 0,
    totalGainPercent: holding?.performance?.totalGainPercent ?? 0,
  };

  if (!symbol || !holding) return null;

  const symbolHolding = {
    numShares: holding?.quantity,
    marketValue: holding?.marketValue,
    bookValue: holding?.bookValue,
    averagePrice: holding?.averageCost ?? 0,
    portfolioPercent: holding?.portfolioPercent,
    todaysReturn: (quote?.adjclose ?? 0) - (quote?.open ?? 0),
    todaysReturnPercent: (((quote?.adjclose ?? 0) - (quote?.open ?? 0)) / (quote?.open ?? 1)) * 100,
    totalReturn: holding?.performance?.totalGainAmount,
    totalReturnPercent: holding?.performance?.totalGainPercent,
    currency: data?.asset.currency || 'USD',
  };

  type Sector = {
    name: string;
  };
  const sectors: Sector[] = JSON.parse(profile?.sectors || '[]');

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader
        heading={profile?.name || holding?.symbolName || '-'}
        headingPrefix={profile?.symbol || holding?.symbol}
        displayBack={true}
      />

      <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
        {profile && (
          <SymbolCard
            className="col-span-1 md:col-span-2"
            marketPrice={profile?.marketPrice}
            totalGainAmount={profile?.totalGainAmount}
            totalGainPercent={profile?.totalGainPercent}
            currency={profile?.currency || 'USD'}
            quoteHistory={data?.quoteHistory ?? []}
          />
        )}
        <SymbolHoldingCard holdingData={symbolHolding} className="col-span-1 md:col-span-1" />
      </div>
      <div>
        <h3 className="text-lg font-bold">About</h3>
        <div className="flex flex-row items-center space-x-2 py-4">
          <Badge variant="secondary" className="uppercase">
            {profile?.assetClass}
          </Badge>
          <Badge variant="secondary" className="uppercase">
            {profile?.assetSubClass}
          </Badge>
          {sectors.map((sector: Sector) => (
            <Badge variant="secondary" key={sector.name} className="uppercase">
              {sector.name}
            </Badge>
          ))}
        </div>
        <p className="text-sm font-light text-muted-foreground">{profile?.comment}</p>
      </div>
    </ApplicationShell>
  );
};

export default AssetProfilePage;
