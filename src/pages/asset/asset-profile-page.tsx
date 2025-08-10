import { useState, useMemo, useEffect } from 'react';
import { ApplicationHeader } from '@/components/header';
import { ApplicationShell } from '@wealthfolio/ui';
import { Badge } from '@/components/ui/badge';
import { useLocation, useParams } from 'react-router-dom';
import AssetHistoryCard from './asset-history-card';
import { Holding, Quote, Sector, Country, Asset } from '@/lib/types';
import { DataSource, PORTFOLIO_ACCOUNT_ID } from '@/lib/constants';
import { useQuery } from '@tanstack/react-query';
import { Separator } from '@/components/ui/separator';
import { InputTags } from '@/components/ui/tag-input';
import { Button } from '@/components/ui/button';
import { useAssetProfileMutations } from './use-asset-profile-mutations';
import { useQuoteMutations } from './use-quote-mutations';
import { Icons } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { getHolding } from '@/commands/portfolio';
import { QueryKeys } from '@/lib/query-keys';
import { useQuoteHistory } from '@/hooks/use-quote-history';
import AssetDetailCard from './asset-detail-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QuoteHistoryTable from './quote-history-table';
import AssetLotsTable from './asset-lots-table';
import { getAssetProfile } from '@/commands/market-data';

interface AssetProfileFormData {
  sectors: Array<Sector>;
  countries: Array<Country>;
  assetClass: string;
  assetSubClass: string;
  notes: string;
  dataSource: DataSource;
}

interface AssetDetailData {
  numShares: number;
  marketValue: number;
  costBasis: number;
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

export const AssetProfilePage = () => {
  const { symbol: encodedSymbol = '' } = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(encodedSymbol);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = queryParams.get('tab') || 'overview';
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<AssetProfileFormData>({
    sectors: [],
    countries: [],
    assetClass: '',
    assetSubClass: '',
    notes: '',
    dataSource: DataSource.MANUAL,
  });


   const {
     data: assetProfile,
     isLoading: isAssetProfileLoading,
     isError: isAssetProfileError,
   } = useQuery<Asset | null, Error>({
     queryKey: [QueryKeys.ASSET_DATA, symbol],
     queryFn: () => getAssetProfile(symbol),
     enabled: !!symbol,
   });

  const {
    data: holding,
    isLoading: isHoldingLoading,
    isError: isHoldingError,
  } = useQuery<Holding | null, Error>({
    queryKey: [QueryKeys.HOLDING, PORTFOLIO_ACCOUNT_ID, symbol],
    queryFn: () => getHolding(PORTFOLIO_ACCOUNT_ID, symbol),
    enabled: !!symbol,
  });

  const {
    data: quoteHistory,
    isLoading: isQuotesLoading,
    isError: isQuotesError,
  } = useQuoteHistory({
    symbol,
    enabled: !!symbol,
  });

  const quote = useMemo(() => {
    return quoteHistory?.at(-1) ?? null;
  }, [quoteHistory]);

  const { updateAssetProfileMutation, updateAssetDataSourceMutation } = useAssetProfileMutations();
  const { saveQuoteMutation, deleteQuoteMutation } = useQuoteMutations(symbol);

  useEffect(() => {
    setFormData({
      sectors: holding?.instrument?.sectors || [],
      countries: holding?.instrument?.countries || [],
      assetSubClass: holding?.instrument?.assetSubclass || '',
      assetClass: holding?.instrument?.assetClass || '',
      notes: holding?.instrument?.notes || '',
      dataSource: (holding?.instrument?.dataSource as DataSource) || DataSource.YAHOO,
    });
  }, [holding]);

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      sectors: holding?.instrument?.sectors || [],
      countries: holding?.instrument?.countries || [],
      assetSubClass: holding?.instrument?.assetSubclass || '',
      assetClass: holding?.instrument?.assetClass || '',
      notes: holding?.instrument?.notes || '',
      dataSource: (holding?.instrument?.dataSource as DataSource) || DataSource.YAHOO,
    });
  };

  const profile = useMemo(() => {
    if (!holding?.instrument) return null;
    const totalGainAmount = holding?.totalGain?.local ?? 0;
    const totalGainPercent = holding?.totalGainPct ?? 0;
    const calculatedAt = holding?.asOfDate;

    return {
      id: holding.instrument.id,
      symbol: holding.instrument.symbol,
      name: holding.instrument.name || '-',
      isin: null,
      assetType: null,
      symbolMapping: null,
      assetClass: holding.instrument.assetClass || '',
      assetSubClass: holding.instrument.assetSubclass || '',
      notes: holding.instrument.notes || null,
      countries: JSON.stringify(holding.instrument.countries || []),
      categories: null,
      classes: null,
      attributes: null,
      createdAt: holding.openDate ? new Date(holding.openDate) : new Date(),
      updatedAt: new Date(),
      currency: holding.instrument.currency || 'USD',
      dataSource: (holding.instrument.dataSource as DataSource) || DataSource.YAHOO,
      sectors: JSON.stringify(holding.instrument.sectors || []),
      url: null,
      marketPrice: quote?.close ?? 0,
      totalGainAmount,
      totalGainPercent,
      calculatedAt,
    };
  }, [holding, quote]);

  const symbolHolding = useMemo((): AssetDetailData | null => {
    if (!holding) return null;

    const averageCostPrice =
      holding.costBasis?.local && holding.quantity !== 0
        ? holding.costBasis.local / holding.quantity
        : 0;

    const quoteData = quote
      ? {
          todaysReturn: quote.close - quote.open,
          todaysReturnPercent: Number((quote.close - quote.open) / quote.open),
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
      marketValue: Number(holding.marketValue.local ?? 0),
      costBasis: Number(holding.costBasis?.local ?? 0),
      averagePrice: Number(averageCostPrice),
      portfolioPercent: Number(holding.weight ?? 0),
      todaysReturn: quoteData?.todaysReturn ?? null,
      todaysReturnPercent: quoteData?.todaysReturnPercent ?? null,
      totalReturn: Number(holding.totalGain?.local ?? 0),
      totalReturnPercent: Number(holding.totalGainPct ?? 0),
      currency: holding.localCurrency || holding.instrument?.currency || 'USD',
      quote: quoteData?.quote ?? null,
    };
  }, [holding, quote]);

  const handleSave = () => {
    if (!holding) return;
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

  const isLoading = isHoldingLoading || isQuotesLoading || isAssetProfileLoading;


  if (isLoading)
    return (
      <ApplicationShell className="flex items-center justify-center p-6">
        <Icons.Spinner className="h-6 w-6 animate-spin" />
      </ApplicationShell>
    ); // Show loading spinner

  // Simplified view for quote-only symbols (like FX rates)
  if (assetProfile?.assetType === 'FOREX') {
    return (
      <ApplicationShell className="p-6">
        <ApplicationHeader
          heading="Quote History"
          headingPrefix={symbol}
          displayBack={true}
          backUrl={location.state?.from || '/holdings?tab=holdings'} // Use from state or default back
        />
        <QuoteHistoryTable
          data={quoteHistory ?? []}
          // Default to non-manual source, disable changing it as there's no profile context
          isManualDataSource={assetProfile?.dataSource === DataSource.MANUAL}
          onSaveQuote={(quote: Quote) => {
            let updatedQuote = { ...quote };
            // Generate id if missing
            if (!updatedQuote.id) {
              const datePart = new Date(updatedQuote.timestamp)
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, '');
              updatedQuote.id = `${datePart}_${symbol.toUpperCase()}`;
            }
            // Set currency if missing
            if (!updatedQuote.currency) {
              updatedQuote.currency = profile?.currency || 'USD';
            }
            saveQuoteMutation.mutate(updatedQuote);
          }}
          onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
          onChangeDataSource={(isManual) => {
            updateAssetDataSourceMutation.mutate({
              symbol,
              dataSource: isManual ? DataSource.MANUAL : DataSource.YAHOO,
            });
            setFormData((prev) => ({
              ...prev,
              dataSource: isManual ? DataSource.MANUAL : DataSource.YAHOO,
            }));
          }}
        />
      </ApplicationShell>
    );
  }

  // Handle case where loading finished but we have neither profile/holding nor quote data
  if (!profile && !holding && (!quoteHistory || quoteHistory.length === 0)) {
    return (
      <ApplicationShell className="p-6">
        <ApplicationHeader
          heading={`Error loading data for ${symbol}`}
          displayBack={true}
          backUrl={location.state?.from || '/holdings?tab=holdings'} // Use from state or default back
        />
        <p>
          Could not load necessary information for this symbol. Please check the symbol or try again
          later.
        </p>
        {isHoldingError && <p className="text-sm text-red-500">Holding fetch error.</p>}
        {isQuotesError && <p className="text-sm text-red-500">Quote fetch error.</p>}
        {isAssetProfileError && <p className="text-sm text-red-500">Asset profile fetch error.</p>}
      </ApplicationShell>
    );
  }

  // --- Original View (Tabs) ---
  return (
    <ApplicationShell className="p-6">
      <Tabs defaultValue={defaultTab} className="space-y-4">
        <ApplicationHeader
          heading={profile?.name || holding?.instrument?.symbol || symbol || '-'}
          headingPrefix={profile?.symbol || holding?.instrument?.symbol}
          displayBack={true}
          backUrl={location.state?.from || '/holdings?tab=holdings'} // Use from state or default back
        >
          <div className="flex items-center space-x-2">
            <TabsList className="flex space-x-1 rounded-full bg-secondary p-1">
              {/* Overview Tab: Requires profile */}
              {profile && (
                <TabsTrigger
                  className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                  value="overview"
                >
                  Overview
                </TabsTrigger>
              )}
              {/* Lots Tab: Requires holding with lots */}
              {holding?.lots && holding.lots.length > 0 && (
                <TabsTrigger
                  className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                  value="lots"
                >
                  Lots
                </TabsTrigger>
              )}
              {/* History/Quotes Tab: Requires quoteHistory */}
              <TabsTrigger
                className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                value="history"
              >
                Quotes
              </TabsTrigger>
            </TabsList>
          </div>
        </ApplicationHeader>

        {/* Overview Content: Requires profile */}
        {profile && (
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
              <AssetHistoryCard
                symbol={profile.symbol || ''}
                currency={profile.currency || 'USD'}
                marketPrice={profile.marketPrice}
                totalGainAmount={profile.totalGainAmount}
                totalGainPercent={profile.totalGainPercent}
                quoteHistory={quoteHistory ?? []}
                className={`col-span-1 ${holding ? 'md:col-span-2' : 'md:col-span-3'}`}
              />
              {symbolHolding && (
                <AssetDetailCard assetData={symbolHolding} className="col-span-1 md:col-span-1" />
              )}
            </div>

            <div className="group relative">
              <h3 className="text-lg font-bold">About</h3>
              <div className="flex flex-row items-center space-x-2 py-4">
                {isEditing ? (
                  <Input
                    value={formData.assetClass}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, assetClass: e.target.value }))
                    }
                    placeholder="Enter asset class"
                    className="w-[180px]"
                  />
                ) : (
                  formData.assetClass && (
                    <Badge variant="secondary" className="flex-none uppercase">
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
                    <Badge variant="secondary" className="flex-none uppercase">
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
                          const [name, weightStr] = value.split(':');
                          // Keep original weight parsing logic, assuming input like 'Sector:75'
                          return { name: name?.trim(), weight: parseFloat(weightStr) || 0 };
                        }),
                      }))
                    }
                  />
                ) : (
                  <div className="flex flex-wrap">
                    {formData.sectors.map((sector) => (
                      <Badge
                        variant="secondary"
                        key={sector.name}
                        className="m-1 cursor-help bg-indigo-100 uppercase dark:text-primary-foreground"
                        title={`${sector.name}: ${sector.weight <= 1 ? (sector.weight * 100).toFixed(2) : sector.weight}%`}
                      >
                        {sector.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {formData.sectors.length > 0 && formData.countries.length > 0 && (
                  <Separator orientation="vertical" />
                )}
                {isEditing ? (
                  <InputTags
                    placeholder="country:weight"
                    value={formData.countries.map(
                      (c) => `${c.name}:${c.weight <= 1 ? (c.weight * 100).toFixed(0) : c.weight}%`,
                    )}
                    onChange={(values) =>
                      setFormData((prev) => ({
                        ...prev,
                        countries: (values as string[]).map((value) => {
                          const [name, weightStr] = value.split(':');
                          // Keep original weight parsing logic
                          return { name: name?.trim(), weight: parseFloat(weightStr) || 0 };
                        }),
                      }))
                    }
                  />
                ) : (
                  <div className="flex flex-wrap">
                    {formData.countries.map((country) => (
                      <Badge
                        variant="secondary"
                        key={country.name}
                        className="m-1 bg-purple-100 uppercase dark:text-primary-foreground"
                        title={`${country.name}: ${country.weight <= 1 ? (country.weight * 100).toFixed(2) : country.weight}%`}
                      >
                        {country.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {(formData.sectors.length > 0 || formData.countries.length > 0) && (
                  <Separator orientation="vertical" />
                )}
                {isEditing ? (
                  <>
                    <Button variant="default" size="icon" className="min-w-10" onClick={handleSave}>
                      <Icons.Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="min-w-10"
                      onClick={handleCancel}
                    >
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
                  <p className="text-sm font-light text-muted-foreground">
                    {formData.notes || 'No description available.'}
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        )}

        {/* Lots Content: Requires profile and holding with lots */}
        {profile && holding?.lots && holding.lots.length > 0 && (
          <TabsContent value="lots" className="pt-6">
            <AssetLotsTable
              lots={holding.lots}
              currency={profile.currency || 'USD'}
              marketPrice={profile.marketPrice}
            />
          </TabsContent>
        )}

        {/* History/Quotes Content: Requires quoteHistory */}
          <TabsContent value="history" className="space-y-16 pt-6">
            <QuoteHistoryTable
              data={quoteHistory ?? []}
              isManualDataSource={formData.dataSource === DataSource.MANUAL}
              onSaveQuote={(quote: Quote) => {
                let updatedQuote = { ...quote };
                // Generate id if missing
                if (!updatedQuote.id) {
                  const datePart = new Date(updatedQuote.timestamp)
                    .toISOString()
                    .slice(0, 10)
                    .replace(/-/g, '');
                  updatedQuote.id = `${datePart}_${symbol.toUpperCase()}`;
                }
                // Set currency if missing
                if (!updatedQuote.currency) {
                  updatedQuote.currency = profile?.currency || 'USD';
                }
                saveQuoteMutation.mutate(updatedQuote);
              }}
              onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
              onChangeDataSource={(isManual) => {
                // Only allow changing data source if there's a profile/holding to update
                if (profile) {
                  updateAssetDataSourceMutation.mutate({
                    symbol,
                    dataSource: isManual ? DataSource.MANUAL : DataSource.YAHOO,
                  });
                  setFormData((prev) => ({
                    ...prev,
                    dataSource: isManual ? DataSource.MANUAL : DataSource.YAHOO,
                  }));
                }
              }}
            />
          </TabsContent>
      </Tabs>
    </ApplicationShell>
  );
};

export default AssetProfilePage;
