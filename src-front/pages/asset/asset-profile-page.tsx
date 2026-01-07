import { getAssetProfile } from "@/commands/market-data";
import { getHolding } from "@/commands/portfolio";
import { MobileActionsMenu } from "@/components/mobile-actions-menu";
import { TickerAvatar } from "@/components/ticker-avatar";
import { ValueHistoryDataGrid } from "@/features/alternative-assets";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Tabs, TabsContent } from "@wealthfolio/ui/components/ui/tabs";
import { InputTags } from "@wealthfolio/ui/components/ui/tag-input";
import { useHapticFeedback } from "@/hooks";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useQuoteHistory } from "@/hooks/use-quote-history";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Asset, AssetKind, Country, Holding, Quote, Sector } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AnimatedToggleGroup, Page, PageContent, PageHeader, SwipableView } from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AssetDetailCard from "./asset-detail-card";
import AssetHistoryCard from "./asset-history-card";
import AssetLotsTable from "./asset-lots-table";
import { useAssetProfileMutations } from "./hooks/use-asset-profile-mutations";
import { useQuoteMutations } from "./hooks/use-quote-mutations";
import { QuoteHistoryDataGrid } from "./quote-history-data-grid";

// Alternative asset kinds that should use ValueHistoryDataGrid
const ALTERNATIVE_ASSET_KINDS: AssetKind[] = [
  "PROPERTY",
  "VEHICLE",
  "COLLECTIBLE",
  "PHYSICAL_PRECIOUS",
  "LIABILITY",
  "OTHER",
];

const isAlternativeAsset = (kind: AssetKind | undefined | null): boolean => {
  if (!kind) return false;
  return ALTERNATIVE_ASSET_KINDS.includes(kind);
};

interface AssetProfileFormData {
  name: string;
  sectors: Sector[];
  countries: Country[];
  assetClass: string;
  assetSubClass: string;
  notes: string;
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

type AssetTab = "overview" | "lots" | "history";

export const AssetProfilePage = () => {
  const { symbol: encodedSymbol = "" } = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(encodedSymbol);
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const defaultTab = (queryParams.get("tab") as AssetTab) ?? "overview";
  const [activeTab, setActiveTab] = useState<AssetTab>(defaultTab);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const triggerHaptic = useHapticFeedback();
  const isMobile = useIsMobileViewport();
  const [formData, setFormData] = useState<AssetProfileFormData>({
    name: "",
    sectors: [],
    countries: [],
    assetClass: "",
    assetSubClass: "",
    notes: "",
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
    // Backend returns quotes in descending order (newest first)
    // So .at(0) gives the latest quote
    return quoteHistory?.at(0) ?? null;
  }, [quoteHistory]);

  const { updateAssetProfileMutation, updateAssetDataSourceMutation } = useAssetProfileMutations();
  const { saveQuoteMutation, deleteQuoteMutation } = useQuoteMutations(symbol);
  const syncMarketDataMutation = useSyncMarketDataMutation();

  useEffect(() => {
    const instrument = holding?.instrument;
    const asset = assetProfile;

    // Helper to safely parse JSON or return array
    const parseSectors = (data: string | Sector[] | null | undefined): Sector[] => {
      if (!data) return [];
      if (typeof data === "string") {
        try {
          return JSON.parse(data) as Sector[];
        } catch {
          return [];
        }
      }
      return data;
    };

    const parseCountries = (data: string | Country[] | null | undefined): Country[] => {
      if (!data) return [];
      if (typeof data === "string") {
        try {
          return JSON.parse(data) as Country[];
        } catch {
          return [];
        }
      }
      return data;
    };

    setFormData({
      name: instrument?.name ?? asset?.name ?? "",
      sectors: parseSectors(instrument?.sectors ?? asset?.profile?.sectors),
      countries: parseCountries(instrument?.countries ?? asset?.profile?.countries),
      assetSubClass: instrument?.assetSubclass ?? asset?.assetSubClass ?? "",
      assetClass: instrument?.assetClass ?? asset?.assetClass ?? "",
      notes: instrument?.notes ?? asset?.notes ?? "",
    });
  }, [holding, assetProfile]);

  // Determine if manual tracking based on asset's pricingMode
  const isManualPricingMode = assetProfile?.pricingMode === "MANUAL";

  // Determine if this is an alternative asset (property, vehicle, liability, etc.)
  const isAltAsset = isAlternativeAsset(assetProfile?.kind);
  const isLiability = assetProfile?.kind === "LIABILITY";

  const profile = useMemo(() => {
    const instrument = holding?.instrument;
    const asset = assetProfile;

    if (!instrument && !asset) return null;

    const totalGainAmount = holding?.totalGain?.local ?? 0;
    const totalGainPercent = holding?.totalGainPct ?? 0;
    const calculatedAt = holding?.asOfDate;

    return {
      id: instrument?.id ?? asset?.id ?? "",
      symbol: instrument?.symbol ?? asset?.symbol ?? symbol,
      name: instrument?.name ?? asset?.name ?? "-",
      isin: null,
      assetType: null,
      symbolMapping: null,
      assetClass: instrument?.assetClass ?? asset?.assetClass ?? "",
      assetSubClass: instrument?.assetSubclass ?? asset?.assetSubClass ?? "",
      notes: instrument?.notes ?? asset?.notes ?? null,
      countries:
        typeof instrument?.countries === "string"
          ? instrument.countries
          : JSON.stringify(instrument?.countries ?? (asset?.profile?.countries ? JSON.parse(asset.profile.countries) : [])),
      categories: null,
      classes: null,
      attributes: null,
      createdAt: holding?.openDate ? new Date(holding.openDate) : new Date(),
      updatedAt: new Date(),
      currency: instrument?.currency ?? asset?.currency ?? "USD",
      sectors:
        typeof instrument?.sectors === "string"
          ? instrument.sectors
          : JSON.stringify(instrument?.sectors ?? (asset?.profile?.sectors ? JSON.parse(asset.profile.sectors) : [])),
      url: null,
      marketPrice: quote?.close ?? 0,
      totalGainAmount,
      totalGainPercent,
      calculatedAt,
    };
  }, [holding, assetProfile, quote, symbol]);

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
      currency: holding.localCurrency ?? holding.instrument?.currency ?? "USD",
      quote: quoteData?.quote ?? null,
    };
  }, [holding, quote]);

  const handleSave = useCallback(() => {
    if (!profile) return;
    updateAssetProfileMutation.mutate({
      symbol,
      name: formData.name,
      sectors: JSON.stringify(formData.sectors),
      countries: JSON.stringify(formData.countries),
      notes: formData.notes,
      assetSubClass: formData.assetSubClass,
      assetClass: formData.assetClass,
    });
    setIsEditing(false);
  }, [profile, symbol, formData, updateAssetProfileMutation]);

  const handleSaveTitle = useCallback(() => {
    if (!profile) return;
    updateAssetProfileMutation.mutate({
      symbol,
      name: formData.name,
      sectors: JSON.stringify(formData.sectors),
      countries: JSON.stringify(formData.countries),
      notes: formData.notes,
      assetSubClass: formData.assetSubClass,
      assetClass: formData.assetClass,
    });
  }, [profile, symbol, formData, updateAssetProfileMutation]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    const instrument = holding?.instrument;
    const asset = assetProfile;

    // Helper to safely parse JSON or return array
    const parseSectors = (data: string | Sector[] | null | undefined): Sector[] => {
      if (!data) return [];
      if (typeof data === "string") {
        try {
          return JSON.parse(data) as Sector[];
        } catch {
          return [];
        }
      }
      return data;
    };

    const parseCountries = (data: string | Country[] | null | undefined): Country[] => {
      if (!data) return [];
      if (typeof data === "string") {
        try {
          return JSON.parse(data) as Country[];
        } catch {
          return [];
        }
      }
      return data;
    };

    setFormData({
      name: instrument?.name ?? asset?.name ?? "",
      sectors: parseSectors(instrument?.sectors ?? asset?.profile?.sectors),
      countries: parseCountries(instrument?.countries ?? asset?.profile?.countries),
      assetSubClass: instrument?.assetSubclass ?? asset?.assetSubClass ?? "",
      assetClass: instrument?.assetClass ?? asset?.assetClass ?? "",
      notes: instrument?.notes ?? asset?.notes ?? "",
    });
  }, [holding, assetProfile]);

  // Build toggle items dynamically based on available data
  const toggleItems = useMemo(() => {
    const items: { value: AssetTab; label: string }[] = [];

    if (profile) {
      items.push({ value: "overview", label: "Overview" });
    }

    if (holding?.lots && holding.lots.length > 0) {
      items.push({ value: "lots", label: "Lots" });
    }

    items.push({ value: "history", label: isAltAsset ? "Values" : "Quotes" });

    return items;
  }, [profile, holding, isAltAsset]);

  // Build swipable tabs for mobile
  const swipableTabs = useMemo(() => {
    const tabs: { name: string; content: React.ReactNode }[] = [];

    if (profile) {
      tabs.push({
        name: "Overview",
        content: (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
              <AssetHistoryCard
                symbol={profile.symbol ?? ""}
                currency={profile.currency ?? "USD"}
                marketPrice={profile.marketPrice}
                totalGainAmount={profile.totalGainAmount}
                totalGainPercent={profile.totalGainPercent}
                quoteHistory={quoteHistory ?? []}
                className={`col-span-1 ${holding ? "md:col-span-2" : "md:col-span-3"}`}
              />
              {symbolHolding && (
                <AssetDetailCard assetData={symbolHolding} className="col-span-1 md:col-span-1" />
              )}
            </div>

            <div className="group relative">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">About</h3>
                {!isEditing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsEditing(true)}
                    className="h-6 w-6 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Icons.Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
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
                          const [name, weightStr] = value.split(":");
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
                        className="dark:text-primary-foreground m-1 cursor-help bg-blue-100 uppercase"
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
                          const [name, weightStr] = value.split(":");
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
                        className="dark:text-primary-foreground m-1 bg-purple-100 uppercase"
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
                {isEditing && (
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
                  <p className="text-muted-foreground text-sm font-light">
                    {formData.notes || "No description available."}
                  </p>
                )}
              </div>
            </div>
          </div>
        ),
      });
    }

    if (holding?.lots && holding.lots.length > 0 && profile) {
      tabs.push({
        name: "Lots",
        content: (
          <AssetLotsTable
            lots={holding.lots}
            currency={profile.currency ?? "USD"}
            marketPrice={profile.marketPrice}
          />
        ),
      });
    }

    // Use ValueHistoryDataGrid for alternative assets, QuoteHistoryTable for regular assets
    tabs.push({
      name: isAltAsset ? "Values" : "Quotes",
      content: isAltAsset ? (
        <ValueHistoryDataGrid
          data={quoteHistory ?? []}
          currency={profile?.currency ?? "USD"}
          isLiability={isLiability}
          onSaveQuote={(quote: Quote) => {
            saveQuoteMutation.mutate(quote);
          }}
          onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
        />
      ) : (
        <QuoteHistoryDataGrid
          data={quoteHistory ?? []}
          symbol={symbol}
          currency={profile?.currency ?? "USD"}
          assetKind={assetProfile?.kind}
          isManualDataSource={isManualPricingMode}
          onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
          onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
          onChangeDataSource={(isManual) => {
            if (profile) {
              updateAssetDataSourceMutation.mutate({
                symbol,
                dataSource: isManual ? "MANUAL" : "YAHOO",
              });
            }
          }}
        />
      ),
    });

    return tabs;
  }, [
    profile,
    holding,
    symbolHolding,
    quoteHistory,
    isEditing,
    formData,
    saveQuoteMutation,
    deleteQuoteMutation,
    updateAssetDataSourceMutation,
    symbol,
    handleCancel,
    handleSave,
    isAltAsset,
    isLiability,
    isManualPricingMode,
  ]);

  const isLoading = isHoldingLoading || isQuotesLoading || isAssetProfileLoading;

  const handleRefreshQuotes = useCallback(() => {
    triggerHaptic();
    syncMarketDataMutation.mutate([symbol]);
  }, [symbol, syncMarketDataMutation, triggerHaptic]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  if (isLoading)
    return (
      <Page>
        <PageContent>
          <Icons.Spinner className="h-6 w-6 animate-spin" />
        </PageContent>
      </Page>
    ); // Show loading spinner

  // Simplified view for quote-only symbols (like FX rates)
  if (assetProfile?.kind === "FX_RATE") {
    return (
      <Page>
        <PageHeader
          heading="Quote History"
          text={symbol}
          onBack={handleBack}
          actions={
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefreshQuotes}
              disabled={syncMarketDataMutation.isPending}
              title="Refresh Quote"
            >
              <Icons.Refresh
                className={`h-4 w-4 ${syncMarketDataMutation.isPending ? "animate-spin" : ""}`}
              />
            </Button>
          }
        />
        <PageContent>
          <QuoteHistoryDataGrid
            data={quoteHistory ?? []}
            symbol={symbol}
            currency={profile?.currency ?? "USD"}
            assetKind={assetProfile?.kind}
            isManualDataSource={isManualPricingMode}
            onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
            onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
            onChangeDataSource={(isManual) => {
              updateAssetDataSourceMutation.mutate({
                symbol,
                dataSource: isManual ? "MANUAL" : "YAHOO",
              });
            }}
          />
        </PageContent>
      </Page>
    );
  }

  // Handle case where loading finished but we have no asset data at all
  if (!profile && (!quoteHistory || quoteHistory.length === 0)) {
    return (
      <Page>
        <PageHeader
          heading={symbol}
          text={`Error loading data for ${symbol}`}
          onBack={handleBack}
        />
        <PageContent>
          <p>
            Could not load necessary information for this symbol. Please check the symbol or try
            again later.
          </p>
          {isHoldingError && <p className="text-sm text-red-500">Holding fetch error.</p>}
          {isQuotesError && <p className="text-sm text-red-500">Quote fetch error.</p>}
          {isAssetProfileError && (
            <p className="text-sm text-red-500">Asset profile fetch error.</p>
          )}
        </PageContent>
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader
        onBack={handleBack}
        actions={
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate(`/activities/manage?symbol=${encodeURIComponent(symbol)}`)}
                title="Record Transaction"
              >
                <Icons.Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefreshQuotes}
                disabled={syncMarketDataMutation.isPending}
                title="Refresh Quote"
              >
                <Icons.Refresh
                  className={`h-4 w-4 ${syncMarketDataMutation.isPending ? "animate-spin" : ""}`}
                />
              </Button>
              <AnimatedToggleGroup
                items={toggleItems}
                value={activeTab}
                onValueChange={(next: AssetTab) => {
                  if (next === activeTab) {
                    return;
                  }
                  triggerHaptic();
                  setActiveTab(next);
                  const url = `${location.pathname}?tab=${next}`;
                  navigate(url, { replace: true });
                }}
                className="md:text-base"
              />
            </div>

            <div className="sm:hidden">
              <MobileActionsMenu
                open={mobileActionsOpen}
                onOpenChange={setMobileActionsOpen}
                title="Asset Actions"
                description="Manage this asset"
                actions={[
                  {
                    icon: "Plus",
                    label: "Record Transaction",
                    description: "Add a new activity manually",
                    onClick: () =>
                      navigate(`/activities/manage?symbol=${encodeURIComponent(symbol)}`),
                  },
                  {
                    icon: "Refresh",
                    label: "Refresh Quote",
                    description: "Update market data",
                    onClick: handleRefreshQuotes,
                  },
                ]}
              />
            </div>
          </>
        }
      >
        <div className="flex items-center gap-1" data-tauri-drag-region="true">
          {(profile?.symbol ?? holding?.instrument?.symbol) && (
            <TickerAvatar
              symbol={profile?.symbol ?? holding?.instrument?.symbol ?? symbol}
              className="size-8"
            />
          )}
          <div className="flex min-w-0 flex-col">
            {isEditingTitle ? (
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Enter asset name"
                className="font-heading text-xl font-bold tracking-tight"
                onBlur={() => {
                  setIsEditingTitle(false);
                  handleSaveTitle();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setIsEditingTitle(false);
                    handleSaveTitle();
                  }
                  if (e.key === "Escape") {
                    setIsEditingTitle(false);
                    setFormData((prev) => ({
                      ...prev,
                      name: holding?.instrument?.name ?? assetProfile?.name ?? "",
                    }));
                  }
                }}
                autoFocus
              />
            ) : (
              <>
                <h1 className="text-lg font-semibold md:text-xl">
                  {formData.name ?? holding?.instrument?.symbol ?? symbol ?? "-"}
                </h1>
                {formData.name && (holding?.instrument?.symbol ?? symbol) && (
                  <p className="text-muted-foreground text-sm md:text-base">
                    {holding?.instrument?.symbol ?? symbol}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </PageHeader>
      <PageContent>
        {isMobile ? (
          <SwipableView
            items={swipableTabs}
            displayToggle={true}
            onViewChange={(_index: number, name: string) => {
              const tabValue = name.toLowerCase() as AssetTab;
              if (tabValue === activeTab) {
                return;
              }
              triggerHaptic();
              setActiveTab(tabValue);
              const url = `${location.pathname}?tab=${tabValue}`;
              navigate(url, { replace: true });
            }}
          />
        ) : (
          <Tabs value={activeTab} className="space-y-4">
            {/* Overview Content: Requires profile */}
            {profile && (
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
                  <AssetHistoryCard
                    symbol={profile.symbol ?? ""}
                    currency={profile.currency ?? "USD"}
                    marketPrice={profile.marketPrice}
                    totalGainAmount={profile.totalGainAmount}
                    totalGainPercent={profile.totalGainPercent}
                    quoteHistory={quoteHistory ?? []}
                    className={`col-span-1 ${holding ? "md:col-span-2" : "md:col-span-3"}`}
                  />
                  {symbolHolding && (
                    <AssetDetailCard
                      assetData={symbolHolding}
                      className="col-span-1 md:col-span-1"
                    />
                  )}
                </div>

                <div className="group relative">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold">About</h3>
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsEditing(true)}
                        className="h-6 w-6 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <Icons.Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
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
                    {(formData.assetClass || formData.assetSubClass) &&
                      formData.sectors.length > 0 && <Separator orientation="vertical" />}
                    {isEditing ? (
                      <InputTags
                        value={formData.sectors.map(
                          (s) =>
                            `${s.name}:${s.weight <= 1 ? (s.weight * 100).toFixed(0) : s.weight}%`,
                        )}
                        placeholder="sector:weight"
                        onChange={(values) =>
                          setFormData((prev) => ({
                            ...prev,
                            sectors: (values as string[]).map((value) => {
                              const [name, weightStr] = value.split(":");
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
                            className="dark:text-primary-foreground m-1 cursor-help bg-blue-100 uppercase"
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
                          (c) =>
                            `${c.name}:${c.weight <= 1 ? (c.weight * 100).toFixed(0) : c.weight}%`,
                        )}
                        onChange={(values) =>
                          setFormData((prev) => ({
                            ...prev,
                            countries: (values as string[]).map((value) => {
                              const [name, weightStr] = value.split(":");
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
                            className="dark:text-primary-foreground m-1 bg-purple-100 uppercase"
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
                    {isEditing && (
                      <>
                        <Button
                          variant="default"
                          size="icon"
                          className="min-w-10"
                          onClick={handleSave}
                        >
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
                    )}
                  </div>
                  <div className="mt-2">
                    {isEditing ? (
                      <textarea
                        className="mt-12 w-full rounded-md border border-neutral-200 p-2 text-sm"
                        value={formData.notes}
                        placeholder="Symbol/Company description"
                        rows={6}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, notes: e.target.value }))
                        }
                      />
                    ) : (
                      <p className="text-muted-foreground text-sm font-light">
                        {formData.notes || "No description available."}
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
                  currency={profile.currency ?? "USD"}
                  marketPrice={profile.marketPrice}
                />
              </TabsContent>
            )}

            {/* History/Quotes Content: Requires quoteHistory */}
            <TabsContent value="history" className="space-y-16 pt-6">
              {isAltAsset ? (
                <ValueHistoryDataGrid
                  data={quoteHistory ?? []}
                  currency={profile?.currency ?? "USD"}
                  isLiability={isLiability}
                  onSaveQuote={(quote: Quote) => {
                    saveQuoteMutation.mutate(quote);
                  }}
                  onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
                />
              ) : (
                <QuoteHistoryDataGrid
                  data={quoteHistory ?? []}
                  symbol={symbol}
                  currency={profile?.currency ?? "USD"}
                  assetKind={assetProfile?.kind}
                  isManualDataSource={isManualPricingMode}
                  onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
                  onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
                  onChangeDataSource={(isManual) => {
                    if (profile) {
                      updateAssetDataSourceMutation.mutate({
                        symbol,
                        dataSource: isManual ? "MANUAL" : "YAHOO",
                      });
                    }
                  }}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </PageContent>
    </Page>
  );
};

export default AssetProfilePage;
