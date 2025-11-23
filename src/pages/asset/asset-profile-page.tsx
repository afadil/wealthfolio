import { getAssetProfile } from "@/commands/market-data";
import { getHolding } from "@/commands/portfolio";
import { TickerAvatar } from "@/components/ticker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { InputTags } from "@/components/ui/tag-input";
import { useHapticFeedback } from "@/hooks";
import { useQuoteHistory } from "@/hooks/use-quote-history";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { DataSource, PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Asset, Country, Holding, Quote, Sector } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AnimatedToggleGroup, Page, PageContent, PageHeader, SwipableView } from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AssetDetailCard from "./asset-detail-card";
import AssetHistoryCard from "./asset-history-card";
import AssetLotsTable from "./asset-lots-table";
import QuoteHistoryTable from "./quote-history-table";
import { useAssetProfileMutations } from "./use-asset-profile-mutations";
import { useQuoteMutations } from "./use-quote-mutations";

interface AssetProfileFormData {
  name: string;
  sectors: Sector[];
  countries: Country[];
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
  const triggerHaptic = useHapticFeedback();
  const [formData, setFormData] = useState<AssetProfileFormData>({
    name: "",
    sectors: [],
    countries: [],
    assetClass: "",
    assetSubClass: "",
    notes: "",
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
  const syncMarketDataMutation = useSyncMarketDataMutation();

  useEffect(() => {
    setFormData({
      name: holding?.instrument?.name ?? "",
      sectors: holding?.instrument?.sectors ?? [],
      countries: holding?.instrument?.countries ?? [],
      assetSubClass: holding?.instrument?.assetSubclass ?? "",
      assetClass: holding?.instrument?.assetClass ?? "",
      notes: holding?.instrument?.notes ?? "",
      dataSource: (holding?.instrument?.dataSource as DataSource) ?? DataSource.YAHOO,
    });
  }, [holding]);

  const profile = useMemo(() => {
    if (!holding?.instrument) return null;
    const totalGainAmount = holding?.totalGain?.local ?? 0;
    const totalGainPercent = holding?.totalGainPct ?? 0;
    const calculatedAt = holding?.asOfDate;

    return {
      id: holding.instrument.id,
      symbol: holding.instrument.symbol,
      name: holding.instrument.name ?? "-",
      isin: null,
      assetType: null,
      symbolMapping: null,
      assetClass: holding.instrument.assetClass ?? "",
      assetSubClass: holding.instrument.assetSubclass ?? "",
      notes: holding.instrument.notes ?? null,
      countries: JSON.stringify(holding.instrument.countries ?? []),
      categories: null,
      classes: null,
      attributes: null,
      createdAt: holding.openDate ? new Date(holding.openDate) : new Date(),
      updatedAt: new Date(),
      currency: holding.instrument.currency ?? "USD",
      dataSource: (holding.instrument.dataSource as DataSource) ?? DataSource.YAHOO,
      sectors: JSON.stringify(holding.instrument.sectors ?? []),
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
      currency: holding.localCurrency ?? holding.instrument?.currency ?? "USD",
      quote: quoteData?.quote ?? null,
    };
  }, [holding, quote]);

  const handleSave = useCallback(() => {
    if (!holding) return;
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
  }, [holding, symbol, formData, updateAssetProfileMutation]);

  const handleSaveTitle = useCallback(() => {
    if (!holding) return;
    updateAssetProfileMutation.mutate({
      symbol,
      name: formData.name,
      sectors: JSON.stringify(formData.sectors),
      countries: JSON.stringify(formData.countries),
      notes: formData.notes,
      assetSubClass: formData.assetSubClass,
      assetClass: formData.assetClass,
    });
  }, [holding, symbol, formData, updateAssetProfileMutation]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setFormData({
      name: holding?.instrument?.name ?? "",
      sectors: holding?.instrument?.sectors ?? [],
      countries: holding?.instrument?.countries ?? [],
      assetSubClass: holding?.instrument?.assetSubclass ?? "",
      assetClass: holding?.instrument?.assetClass ?? "",
      notes: holding?.instrument?.notes ?? "",
      dataSource: (holding?.instrument?.dataSource as DataSource) ?? DataSource.YAHOO,
    });
  }, [holding]);

  // Build toggle items dynamically based on available data
  const toggleItems = useMemo(() => {
    const items: { value: AssetTab; label: string }[] = [];

    if (profile) {
      items.push({ value: "overview", label: "Overview" });
    }

    if (holding?.lots && holding.lots.length > 0) {
      items.push({ value: "lots", label: "Lots" });
    }

    items.push({ value: "history", label: "Quotes" });

    return items;
  }, [profile, holding]);

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

    tabs.push({
      name: "Quotes",
      content: (
        <QuoteHistoryTable
          data={quoteHistory ?? []}
          isManualDataSource={formData.dataSource === DataSource.MANUAL}
          onSaveQuote={(quote: Quote) => {
            const updatedQuote = { ...quote };
            if (!updatedQuote.id) {
              const datePart = new Date(updatedQuote.timestamp)
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, "");
              updatedQuote.id = `${datePart}_${symbol.toUpperCase()}`;
            }
            if (!updatedQuote.currency) {
              updatedQuote.currency = profile?.currency ?? "USD";
            }
            saveQuoteMutation.mutate(updatedQuote);
          }}
          onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
          onChangeDataSource={(isManual) => {
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
  if (assetProfile?.assetType === "FOREX") {
    return (
      <Page>
        <PageHeader
          heading="Quote History"
          text={symbol}
          onBack={handleBack}
          actions={
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={handleRefreshQuotes}
              disabled={syncMarketDataMutation.isPending}
              title="Refresh Quote"
            >
              <Icons.Refresh
                className={`size-4 ${syncMarketDataMutation.isPending ? "animate-spin" : ""}`}
              />
            </Button>
          }
        />
        <PageContent>
          <QuoteHistoryTable
            data={quoteHistory ?? []}
            // Default to non-manual source, disable changing it as there's no profile context
            isManualDataSource={assetProfile?.dataSource === DataSource.MANUAL}
            onSaveQuote={(quote: Quote) => {
              const updatedQuote = { ...quote };
              // Generate id if missing
              if (!updatedQuote.id) {
                const datePart = new Date(updatedQuote.timestamp)
                  .toISOString()
                  .slice(0, 10)
                  .replace(/-/g, "");
                updatedQuote.id = `${datePart}_${symbol.toUpperCase()}`;
              }
              // Set currency if missing
              if (!updatedQuote.currency) {
                updatedQuote.currency = profile?.currency ?? "USD";
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
        </PageContent>
      </Page>
    );
  }

  // Handle case where loading finished but we have neither profile/holding nor quote data
  if (!profile && !holding && (!quoteHistory || quoteHistory.length === 0)) {
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
      <PageHeader>
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <Icons.ArrowLeft className="h-8 w-8 md:h-9 md:w-9" />
            </Button>
            {(profile?.symbol ?? holding?.instrument?.symbol) && (
              <TickerAvatar
                symbol={profile?.symbol ?? holding?.instrument?.symbol ?? symbol}
                className="size-8"
              />
            )}
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
                      name: holding?.instrument?.name ?? "",
                    }));
                  }
                }}
                autoFocus
              />
            ) : (
              <div className="group flex min-w-0 flex-1 items-center gap-3">
                <div className="flex min-w-0 flex-col">
                  <h1 className="text-md truncate font-semibold md:text-xl">
                    <span
                      onClick={() => setIsEditingTitle(true)}
                      className="cursor-pointer md:cursor-default"
                    >
                      {formData.name ?? holding?.instrument?.symbol ?? symbol ?? "-"}
                    </span>
                  </h1>
                  {formData.name && (holding?.instrument?.symbol ?? symbol) && (
                    <span className="text-muted-foreground truncate text-xs md:text-sm">
                      {holding?.instrument?.symbol ?? symbol}
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsEditingTitle(true)}
                  className="hidden h-6 w-6 flex-shrink-0 md:inline-flex md:opacity-0 md:group-hover:opacity-100"
                >
                  <Icons.Pencil className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="hidden md:flex md:items-center md:gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={handleRefreshQuotes}
              disabled={syncMarketDataMutation.isPending}
              title="Refresh Quote"
            >
              <Icons.Refresh
                className={`size-4 ${syncMarketDataMutation.isPending ? "animate-spin" : ""}`}
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
              size="sm"
              className="md:text-base"
            />
          </div>
        </div>
      </PageHeader>
      <PageContent>
        {/* Mobile: SwipableView */}
        <div className="md:hidden">
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
        </div>

        {/* Desktop: Regular Tabs */}
        <Tabs value={activeTab} className="hidden space-y-4 md:block">
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
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
            <QuoteHistoryTable
              data={quoteHistory ?? []}
              isManualDataSource={formData.dataSource === DataSource.MANUAL}
              onSaveQuote={(quote: Quote) => {
                const updatedQuote = { ...quote };
                // Generate id if missing
                if (!updatedQuote.id) {
                  const datePart = new Date(updatedQuote.timestamp)
                    .toISOString()
                    .slice(0, 10)
                    .replace(/-/g, "");
                  updatedQuote.id = `${datePart}_${symbol.toUpperCase()}`;
                }
                // Set currency if missing
                if (!updatedQuote.currency) {
                  updatedQuote.currency = profile?.currency ?? "USD";
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
      </PageContent>
    </Page>
  );
};

export default AssetProfilePage;
