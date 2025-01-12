import { useState, useMemo, useEffect } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Badge } from '@/components/ui/badge';
import { useLocation, useParams } from 'react-router-dom';
import AssetHistoryCard from './asset-history-card';
import { AssetData, Holding } from '@/lib/types';
import { getAssetData } from '@/commands/market-data';
import { useQuery } from '@tanstack/react-query';
import { Separator } from '@/components/ui/separator';
import { InputTags } from '@/components/ui/tag-input';
import { Button } from '@/components/ui/button';
import { useAssetProfileMutations } from './useAssetProfileMutations';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { computeHoldings } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';
import AssetDetailCard from './asset-detail-card';

interface AssetProfileFormData {
  sectors: Array<{ name: string; weight: number }>;
  countries: Array<{ code: string; weight: number }>;
  comment: string;
  assetClass: string;
  assetSubClass: string;
}

export const AssetProfilePage = () => {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const location = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<AssetProfileFormData>({
    sectors: [],
    countries: [],
    comment: '',
    assetClass: '',
    assetSubClass: '',
  });

  const { data: assetData, isLoading: isAssetDataLoading } = useQuery<AssetData, Error>({
    queryKey: [QueryKeys.ASSET_DATA, symbol],
    queryFn: () => getAssetData(symbol),
    enabled: !!symbol,
  });

  const { data: allHoldings, isLoading: isHoldingsLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS],
    queryFn: computeHoldings,
  });

  const holding = useMemo(() => {
    if (location.state?.holding) return location.state.holding;
    return allHoldings?.find((h) => h.account?.id === 'TOTAL' && h.symbol === symbol);
  }, [location.state?.holding, allHoldings, symbol]);

  const quote = useMemo(() => {
    return assetData?.quoteHistory?.[0] ?? null;
  }, [assetData?.quoteHistory]);

  const { updateAssetProfileMutation } = useAssetProfileMutations();

  useEffect(() => {
    if (assetData?.asset) {
      setFormData({
        sectors: JSON.parse(assetData.asset.sectors || '[]'),
        countries: JSON.parse(assetData.asset.countries || '[]'),
        comment: assetData.asset.comment || '',
        assetSubClass: assetData.asset.assetSubClass || '',
        assetClass: assetData.asset.assetClass || '',
      });
    }
  }, [assetData?.asset]);

  const profile = useMemo(() => {
    if (!assetData?.asset) return null;
    return {
      ...assetData.asset,
      marketPrice: quote?.close ?? 0,
      totalGainAmount: holding?.performance?.totalGainAmount ?? 0,
      totalGainPercent: holding?.performance?.totalGainPercent ?? 0,
      calculatedAt: holding?.calculatedAt,
    };
  }, [assetData?.asset, quote, holding]);

  const symbolHolding = useMemo(() => {
    if (!holding || !quote) return null;
    const todaysReturn = (quote.close ?? 0) - (quote.open ?? 0);
    return {
      numShares: holding.quantity,
      marketValue: holding.marketValue,
      bookValue: holding.bookValue,
      averagePrice: holding.averageCost ?? 0,
      portfolioPercent: holding.portfolioPercent,
      todaysReturn,
      todaysReturnPercent: Number((todaysReturn / (quote.open ?? 1)) * 100),
      totalReturn: holding.performance?.totalGainAmount,
      totalReturnPercent: holding.performance?.totalGainPercent,
      currency: assetData?.asset.currency || 'USD',
      quote: {
        open: quote.open,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
        close: quote.close,
        adjclose: quote.adjclose,
      },
    };
  }, [holding, quote, assetData?.asset.currency]);

  const handleSave = () => {
    updateAssetProfileMutation.mutate({
      symbol,
      sectors: JSON.stringify(formData.sectors),
      countries: JSON.stringify(formData.countries),
      comment: formData.comment,
      assetSubClass: formData.assetSubClass,
      assetClass: formData.assetClass,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (assetData?.asset) {
      setFormData({
        sectors: JSON.parse(assetData.asset.sectors || '[]'),
        countries: JSON.parse(assetData.asset.countries || '[]'),
        comment: assetData.asset.comment || '',
        assetSubClass: assetData.asset.assetSubClass || '',
        assetClass: assetData.asset.assetClass || '',
      });
    }
  };

  if (isHoldingsLoading || isAssetDataLoading || !profile) return null;

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader
        heading={profile.name || holding?.symbolName || '-'}
        headingPrefix={profile.symbol || holding?.symbol}
        displayBack={true}
        backUrl={location.state ? '/holdings?tab=holdings' : undefined}
      />

      <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
        <AssetHistoryCard
          symbol={profile.symbol || holding?.symbol}
          className={`col-span-1 ${holding ? 'md:col-span-2' : 'md:col-span-3'}`}
          marketPrice={profile.marketPrice}
          totalGainAmount={profile.totalGainAmount}
          totalGainPercent={profile.totalGainPercent}
          currency={profile.currency || 'USD'}
          quoteHistory={assetData?.quoteHistory ?? []}
        />
        {symbolHolding && (
          <AssetDetailCard assetData={symbolHolding} className="col-span-1 md:col-span-1" />
        )}
      </div>

      <div className="group relative">
        <h3 className="text-lg font-bold">About</h3>
        <div className="flex h-12 flex-row items-center space-x-2 py-4">
          {isEditing ? (
            <Input
              value={formData.assetClass}
              onChange={(e) => setFormData((prev) => ({ ...prev, assetClass: e.target.value }))}
              placeholder="Enter asset class"
              className="w-[180px]"
            />
          ) : (
            <Badge variant="secondary" className="uppercase">
              {profile.assetClass}
            </Badge>
          )}
          {isEditing ? (
            <Input
              value={formData.assetSubClass}
              onChange={(e) => setFormData((prev) => ({ ...prev, assetSubClass: e.target.value }))}
              placeholder="Enter sub-class"
              className="w-[180px]"
            />
          ) : (
            <Badge variant="secondary" className="uppercase">
              {profile.assetSubClass}
            </Badge>
          )}
          <Separator orientation="vertical" />
          {isEditing ? (
            <InputTags
              value={formData.sectors.map(
                (s) => `${s.name}:${s.weight <= 1 ? (s.weight * 100).toFixed(0) : s.weight}%`,
              )}
              placeholder="sector:weight"
              onChange={(values) =>
                setFormData((prev) => ({
                  ...prev,
                  sectors: (values as string[]).map((value) => {
                    const [name, weight] = value.split(':');
                    return { name, weight: parseFloat(weight) || 0 };
                  }),
                }))
              }
            />
          ) : (
            <>
              {formData.sectors.map((sector) => (
                <Badge
                  variant="secondary"
                  key={sector.name}
                  className="cursor-help bg-indigo-100 uppercase dark:text-primary-foreground"
                  title={`${sector.name}: ${sector.weight <= 1 ? (sector.weight * 100).toFixed(2) : sector.weight}%`}
                >
                  {sector.name}
                </Badge>
              ))}
            </>
          )}
          <Separator orientation="vertical" />
          {isEditing ? (
            <InputTags
              placeholder="country:weight"
              value={formData.countries.map(
                (c) => `${c.code}:${c.weight <= 1 ? (c.weight * 100).toFixed(0) : c.weight}%`,
              )}
              onChange={(values) =>
                setFormData((prev) => ({
                  ...prev,
                  countries: (values as string[]).map((value) => {
                    const [code, weight] = value.split(':');
                    return { code, weight: parseFloat(weight) || 0 };
                  }),
                }))
              }
            />
          ) : (
            formData.countries.map((country) => (
              <Badge
                variant="secondary"
                key={country.code}
                className="bg-purple-100 uppercase dark:text-primary-foreground"
                title={`${country.code}: ${country.weight <= 1 ? (country.weight * 100).toFixed(2) : country.weight}%`}
              >
                {country.code}
              </Badge>
            ))
          )}
          <Separator orientation="vertical" />
          {isEditing ? (
            <>
              <Button variant="default" size="icon" className="min-w-10" onClick={handleSave}>
                <Icons.Check className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="min-w-10" onClick={handleCancel}>
                <Icons.Close className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsEditing(true)}
              className="min-w-10 opacity-0 group-hover:opacity-100"
            >
              <Icons.Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-2">
          {isEditing ? (
            <textarea
              className="mt-12 w-full rounded-md border border-neutral-200 p-2 text-sm"
              value={formData.comment}
              placeholder="Symbol/Company description"
              rows={6}
              onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
            />
          ) : (
            <p className="text-sm font-light text-muted-foreground">{formData.comment}</p>
          )}
        </div>
      </div>
    </ApplicationShell>
  );
};

export default AssetProfilePage;
