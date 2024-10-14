import React, { useState, useMemo } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Badge } from '@/components/ui/badge';
import { useLocation, useParams } from 'react-router-dom';
import SymbolCard from './symbol-card';
import SymbolHoldingCard from './symbol-holding';
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

type Sector = {
  name: string;
  weight: number;
};

type Country = {
  code: string;
  weight: number;
};

export const AssetProfilePage = () => {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const location = useLocation();

  const { data, isLoading: isAssetDataLoading } = useQuery<AssetData, Error>({
    queryKey: [QueryKeys.ASSET_DATA, symbol],
    queryFn: () => getAssetData(symbol),
  });

  // Query to fetch all holdings
  const { data: allHoldings, isLoading: isHoldingsLoading } = useQuery<Holding[], Error>({
    queryKey: [QueryKeys.HOLDINGS],
    queryFn: computeHoldings,
  });

  // Memoized aggregated holdings
  const aggregatedHoldings = useMemo(() => {
    return allHoldings?.filter((holding) => holding.account?.id === 'TOTAL') || [];
  }, [allHoldings]);

  // Find the specific holding for the current symbol
  const holding = useMemo(() => {
    return location.state?.holding || aggregatedHoldings.find((h) => h.symbol === symbol);
  }, [location.state?.holding, aggregatedHoldings, symbol]);

  const { updateAssetProfileMutation } = useAssetProfileMutations();

  const [isEditing, setIsEditing] = useState(false);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [comment, setComment] = useState('');
  const [assetSubClass, setAssetSubClass] = useState('');

  React.useEffect(() => {
    if (data) {
      setSectors(JSON.parse(data.asset.sectors || '[]'));
      setCountries(JSON.parse(data.asset.countries || '[]'));
      setComment(data.asset.comment || '');
      setAssetSubClass(data.asset.assetSubClass || '');
    }
  }, [data]);

  const isLoading = isHoldingsLoading || isAssetDataLoading;

  if (isLoading) return null;

  const quote = data?.quoteHistory ? data?.quoteHistory[0] : null;

  const profile = {
    ...data?.asset,
    marketPrice: quote?.adjclose ?? 0,
    totalGainAmount: holding?.performance?.totalGainAmount ?? 0,
    totalGainPercent: holding?.performance?.totalGainPercent ?? 0,
    calculatedAt: holding?.calculatedAt,
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

  const handleSave = () => {
    updateAssetProfileMutation.mutate({
      symbol,
      sectors: JSON.stringify(sectors),
      countries: JSON.stringify(countries),
      comment,
      assetSubClass,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (data) {
      setSectors(JSON.parse(data.asset.sectors || '[]'));
      setCountries(JSON.parse(data.asset.countries || '[]'));
      setComment(data.asset.comment || '');
      setAssetSubClass(data.asset.assetSubClass || '');
    }
  };

  return (
    <ApplicationShell className="p-6">
      <ApplicationHeader
        heading={profile?.name || holding?.symbolName || '-'}
        headingPrefix={profile?.symbol || holding?.symbol}
        displayBack={true}
        backUrl={location.state ? '/holdings?tab=holdings' : undefined}
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
      <div className="group relative">
        <h3 className="text-lg font-bold">About</h3>
        <div className="flex h-12 flex-row items-center space-x-2 py-4">
          <Badge variant="secondary" className="uppercase">
            {profile?.assetClass}
          </Badge>
          {isEditing ? (
            <Input
              value={assetSubClass}
              onChange={(e) => setAssetSubClass(e.target.value)}
              placeholder="Enter sub-class"
              className="w-[180px] bg-white dark:bg-neutral-950"
            />
          ) : (
            <Badge variant="secondary" className="uppercase">
              {profile?.assetSubClass}
            </Badge>
          )}
          <Separator orientation="vertical" />
          {isEditing ? (
            <InputTags
              value={sectors.map(
                (s) => `${s.name}:${s.weight <= 1 ? (s.weight * 100).toFixed(0) : s.weight}%`,
              )}
              placeholder="sector:weight"
              // @ts-ignore
              onChange={(values: string[]) =>
                setSectors(
                  values.map((value) => {
                    const [name, weight] = value.split(':');
                    return { name, weight: parseFloat(weight) || 0 };
                  }),
                )
              }
            />
          ) : (
            <>
              {sectors.map((sector) => (
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
              value={countries.map(
                (c) => `${c.code}:${c.weight <= 1 ? (c.weight * 100).toFixed(0) : c.weight}%`,
              )}
              // @ts-ignore
              onChange={(values: string[]) =>
                setCountries(
                  values.map((value) => {
                    const [code, weight] = value.split(':');
                    return { code, weight: parseFloat(weight) || 0 };
                  }),
                )
              }
            />
          ) : (
            countries.map((country) => (
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
              value={comment}
              placeholder="Symbol/Company description"
              rows={6}
              onChange={(e) => setComment(e.target.value)}
            />
          ) : (
            <p className="text-sm font-light text-muted-foreground">{comment}</p>
          )}
        </div>
      </div>
    </ApplicationShell>
  );
};

export default AssetProfilePage;
