import { useState, useMemo, useEffect } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@/components/shell';
import { Badge } from '@/components/ui/badge';
import { useLocation, useParams } from 'react-router-dom';
import AssetHistoryCard from './asset-history-card';
import { AssetData, Holding, Quote } from '@/lib/types';
import { DataSource } from '@/lib/constants';
import { getAssetData } from '@/commands/market-data';
import { useQuery } from '@tanstack/react-query';
import { Separator } from '@/components/ui/separator';
import { InputTags } from '@/components/ui/tag-input';
import { Button } from '@/components/ui/button';
import { useAssetProfileMutations } from './useAssetProfileMutations';
import { useQuoteMutations } from './useQuoteMutations';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { computeHoldings } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';
import AssetDetailCard from './asset-detail-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AssetHistoryTable from './asset-history-table';

interface AssetProfileFormData {
  sectors: Array<{ name: string; weight: number }>;
  countries: Array<{ code: string; weight: number }>;
  notes: string;
  assetClass: string;
  assetSubClass: string;
  dataSource: DataSource;
}

interface AssetDetailData {
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
  quote: {
    open: number;
    high: number;
    low: number;
    volume: number;
    close: number;
    adjclose: number;
  } | null;
}

const PORTFOLIO_ACCOUNT_ID = 'PORTFOLIO';

export const AssetProfilePage = () => {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get('tab') || 'overview';
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<AssetProfileFormData>({
    sectors: [],
    countries: [],
    notes: '',
    assetClass: '',
    assetSubClass: '',
    dataSource: DataSource.MANUAL,
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
    return allHoldings?.find((h) => h.account?.id === PORTFOLIO_ACCOUNT_ID && h.symbol === symbol);
  }, [location.state?.holding, allHoldings, symbol]);

  const quote = useMemo(() => {
    return assetData?.quoteHistory?.[0] ?? null;
  }, [assetData?.quoteHistory]);

  const { updateAssetProfileMutation, updateAssetDataSourceMutation } = useAssetProfileMutations();
  const { saveQuoteMutation, deleteQuoteMutation } = useQuoteMutations(symbol);

  useEffect(() => {
    if (assetData?.asset) {
      setFormData({
        sectors: JSON.parse(assetData.asset.sectors || '[]'),
        countries: JSON.parse(assetData.asset.countries || '[]'),
        notes: assetData.asset.notes || '',
        assetSubClass: assetData.asset.assetSubClass || '',
        assetClass: assetData.asset.assetClass || '',
        dataSource: (assetData.asset.dataSource as DataSource) || DataSource.YAHOO,
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

  const symbolHolding = useMemo((): AssetDetailData | null => {
    if (!holding) return null;

    const quoteData = quote
      ? {
          todaysReturn: quote.close - quote.open,
          todaysReturnPercent: Number(((quote.close - quote.open) / quote.open) * 100),
          quote: {
            open: quote.open,
            high: quote.high,
            low: quote.low,
            volume: quote.volume,
            close: quote.close,
            adjclose: quote.adjclose,
          },
        }
      : null;

    return {
      numShares: Number(holding.quantity),
      marketValue: Number(holding.marketValue),
      bookValue: Number(holding.bookValue),
      averagePrice: Number(holding.averageCost ?? 0),
      portfolioPercent: Number(holding.portfolioPercent ?? 0),
      todaysReturn: quoteData?.todaysReturn ?? null,
      todaysReturnPercent: quoteData?.todaysReturnPercent ?? null,
      totalReturn: Number(holding.performance?.totalGainAmount ?? 0),
      totalReturnPercent: Number(holding.performance?.totalGainPercent ?? 0),
      currency: assetData?.asset.currency || 'USD',
      quote: quoteData?.quote ?? null,
    };
  }, [holding, quote, assetData?.asset?.currency]);

  const handleSave = () => {
    updateAssetProfileMutation.mutate({
      symbol,
      sectors: JSON.stringify(formData.sectors),
      countries: JSON.stringify(formData.countries),
      notes: formData.notes,
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
        notes: assetData.asset.notes || '',
        assetSubClass: assetData.asset.assetSubClass || '',
        assetClass: assetData.asset.assetClass || '',
        dataSource: (assetData.asset.dataSource as DataSource) || DataSource.YAHOO,
      });
    }
  };

  if (isHoldingsLoading || isAssetDataLoading || !profile) return null;

  return (
    <ApplicationShell className="p-6">
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <ApplicationHeader
          heading={profile.name || holding?.symbolName || '-'}
          headingPrefix={profile.symbol || holding?.symbol}
          displayBack={true}
          backUrl={location.state ? '/holdings?tab=holdings' : undefined}
        >
          <div className="flex items-center space-x-2">
            <TabsList className="flex space-x-1 rounded-full bg-secondary p-1">
              <TabsTrigger
                className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                value="overview"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                value="history"
              >
                History
              </TabsTrigger>
            </TabsList>
          </div>
        </ApplicationHeader>

        <TabsContent value="overview" className="space-y-4">
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
                formData.assetClass && (
                  <Badge variant="secondary" className="uppercase">
                    {formData.assetClass}
                  </Badge>
                )
              )}
              {isEditing ? (
                <Input
                  value={formData.assetSubClass}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, assetSubClass: e.target.value }))
                  }
                  placeholder="Enter sub-class"
                  className="w-[180px]"
                />
              ) : (
                formData.assetSubClass && (
                  <Badge variant="secondary" className="uppercase">
                    {formData.assetSubClass}
                  </Badge>
                )
              )}
              {(formData.assetClass || formData.assetSubClass) && formData.sectors.length > 0 && (
                <Separator orientation="vertical" />
              )}
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
              {formData.sectors.length > 0 && formData.countries.length > 0 && (
                <Separator orientation="vertical" />
              )}
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
              {(formData.sectors.length > 0 || formData.countries.length > 0) && (
                <Separator orientation="vertical" />
              )}
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
                  value={formData.notes}
                  placeholder="Symbol/Company description"
                  rows={6}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                />
              ) : (
                <p className="text-sm font-light text-muted-foreground">{formData.notes}</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-16 pt-6">
          <AssetHistoryTable
            data={assetData?.quoteHistory ?? []}
            isManualDataSource={assetData?.asset?.dataSource === DataSource.MANUAL}
            onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
            onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
            onChangeDataSource={(isManual) => {
              updateAssetDataSourceMutation.mutate({
                symbol,
                dataSource: isManual ? DataSource.MANUAL : DataSource.YAHOO,
              });
            }}
          />
        </TabsContent>
      </Tabs>
    </ApplicationShell>
  );
};

export default AssetProfilePage;
