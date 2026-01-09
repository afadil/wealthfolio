import { getAssetProfile } from "@/commands/market-data";
import { getHolding } from "@/commands/portfolio";
import { AssetEditSheet } from "./asset-edit-sheet";
import { MobileActionsMenu } from "@/components/mobile-actions-menu";
import { TickerAvatar } from "@/components/ticker-avatar";
import { ValueHistoryDataGrid } from "@/features/alternative-assets";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tabs, TabsContent } from "@wealthfolio/ui/components/ui/tabs";
import { useHapticFeedback } from "@/hooks";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useQuoteHistory } from "@/hooks/use-quote-history";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { useAssetTaxonomyAssignments, useTaxonomy } from "@/hooks/use-taxonomies";
import { useAssetProfileMutations } from "./hooks/use-asset-profile-mutations";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Asset, AssetKind, Holding, Quote } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AnimatedToggleGroup, Page, PageContent, PageHeader, SwipableView } from "@wealthfolio/ui";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AssetDetailCard from "./asset-detail-card";
import AssetHistoryCard from "./asset-history-card";
import AssetLotsTable from "./asset-lots-table";
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

// Helper to parse JSON field that might be a string or already an object
const parseJsonField = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
};

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
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editSheetDefaultTab, setEditSheetDefaultTab] = useState<"general" | "classification" | "market-data">("general");
  const triggerHaptic = useHapticFeedback();
  const isMobile = useIsMobileViewport();

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

  // Taxonomy data for category badges - use same approach as edit sheet
  const { data: assignments = [], isLoading: isAssignmentsLoading } = useAssetTaxonomyAssignments(symbol);
  const { updateAssetDataSourceMutation } = useAssetProfileMutations();

  // Fetch taxonomy details for taxonomies with assignments
  // We need the categories to get name and color
  const { data: typeOfSecurityTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "type_of_security")?.taxonomyId ?? null
  );
  const { data: riskCategoryTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "risk_category")?.taxonomyId ?? null
  );
  const { data: assetClassesTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "asset_classes")?.taxonomyId ?? null
  );

  const isClassificationsLoading = isAssignmentsLoading;

  // Build category badges from assignments and taxonomy data
  // Order: Class, Type, Risk
  const categoryBadges = useMemo(() => {
    const badges: Array<{ id: string; categoryName: string; categoryColor: string; taxonomyName: string }> = [];

    // Asset Class badge (first)
    const assetClassAssignment = assignments.find((a) => a.taxonomyId === "asset_classes");
    if (assetClassAssignment && assetClassesTaxonomy?.categories) {
      const category = assetClassesTaxonomy.categories.find((c) => c.id === assetClassAssignment.categoryId);
      if (category) {
        badges.push({
          id: category.id,
          categoryName: category.name,
          categoryColor: category.color,
          taxonomyName: "Class",
        });
      }
    }

    // Type of Security badge (second)
    const typeAssignment = assignments.find((a) => a.taxonomyId === "type_of_security");
    if (typeAssignment && typeOfSecurityTaxonomy?.categories) {
      const category = typeOfSecurityTaxonomy.categories.find((c) => c.id === typeAssignment.categoryId);
      if (category) {
        badges.push({
          id: category.id,
          categoryName: category.name === "Exchange Traded Fund (ETF)" ? "ETF" : category.name,
          categoryColor: category.color,
          taxonomyName: "Type",
        });
      }
    }

    // Risk Category badge (third)
    const riskAssignment = assignments.find((a) => a.taxonomyId === "risk_category");
    if (riskAssignment && riskCategoryTaxonomy?.categories) {
      const category = riskCategoryTaxonomy.categories.find((c) => c.id === riskAssignment.categoryId);
      if (category) {
        badges.push({
          id: category.id,
          categoryName: `Risk: ${category.name}`,
          categoryColor: category.color,
          taxonomyName: "Risk",
        });
      }
    }

    return badges;
  }, [assignments, assetClassesTaxonomy, typeOfSecurityTaxonomy, riskCategoryTaxonomy]);

  const quote = useMemo(() => {
    // Backend returns quotes in descending order (newest first)
    // So .at(0) gives the latest quote
    return quoteHistory?.at(0) ?? null;
  }, [quoteHistory]);

  const { saveQuoteMutation, deleteQuoteMutation } = useQuoteMutations(symbol);
  const syncMarketDataMutation = useSyncMarketDataMutation();

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

    // Legacy data is in asset.metadata.legacy (for migration purposes)
    // New data should come from taxonomies
    const legacy = asset?.metadata?.legacy as
      | { sectors?: string | null; countries?: string | null }
      | undefined;

    return {
      id: instrument?.id ?? asset?.id ?? "",
      symbol: instrument?.symbol ?? asset?.symbol ?? symbol,
      name: instrument?.name ?? asset?.name ?? "-",
      isin: null,
      assetType: null,
      symbolMapping: null,
      assetClass: instrument?.assetClass ?? "",
      assetSubClass: instrument?.assetSubclass ?? "",
      notes: instrument?.notes ?? asset?.notes ?? null,
      countries:
        typeof instrument?.countries === "string"
          ? instrument.countries
          : JSON.stringify(instrument?.countries ?? parseJsonField(legacy?.countries) ?? []),
      categories: null,
      classes: null,
      attributes: null,
      createdAt: holding?.openDate ? new Date(holding.openDate) : new Date(),
      updatedAt: new Date(),
      currency: instrument?.currency ?? asset?.currency ?? "USD",
      sectors:
        typeof instrument?.sectors === "string"
          ? instrument.sectors
          : JSON.stringify(instrument?.sectors ?? parseJsonField(legacy?.sectors) ?? []),
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

            <div className="space-y-4">
              <h3 className="text-lg font-bold">About</h3>

              {/* Category badges */}
              <div className="flex flex-wrap items-center gap-2">
                {isClassificationsLoading ? (
                  <>
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </>
                ) : categoryBadges.length > 0 ? (
                  <>
                    {categoryBadges.map((badge) => (
                      <Badge
                        key={badge.id}
                        variant="secondary"
                        className="gap-1.5"
                        style={{
                          backgroundColor: `${badge.categoryColor}20`,
                          color: badge.categoryColor,
                          borderColor: badge.categoryColor,
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: badge.categoryColor }}
                        />
                        {badge.categoryName}
                      </Badge>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => {
                        setEditSheetDefaultTab("classification");
                        setEditSheetOpen(true);
                      }}
                    >
                      More
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground"
                    onClick={() => {
                      setEditSheetDefaultTab("classification");
                      setEditSheetOpen(true);
                    }}
                  >
                    + Add classifications
                  </Button>
                )}
              </div>

              {/* Notes section */}
              <p className="text-muted-foreground text-sm">
                {assetProfile?.notes || holding?.instrument?.notes || "No notes added."}
              </p>
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
                dataSource: isManual ? "MANUAL" : "MARKET",
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
    saveQuoteMutation,
    deleteQuoteMutation,
    symbol,
    isAltAsset,
    isLiability,
    isManualPricingMode,
    categoryBadges,
    isClassificationsLoading,
    assetProfile,
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
              <Button
                variant="outline"
                size="icon"
                onClick={() => setEditSheetOpen(true)}
                title="Edit Asset"
              >
                <Icons.Pencil className="h-4 w-4" />
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
                  {
                    icon: "Pencil",
                    label: "Edit",
                    description: "Edit asset details and settings",
                    onClick: () => setEditSheetOpen(true),
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
            <h1 className="text-lg font-semibold md:text-xl">
              {assetProfile?.name ?? holding?.instrument?.name ?? symbol ?? "-"}
            </h1>
            {(assetProfile?.name || holding?.instrument?.name) && (
              <p className="text-muted-foreground text-sm md:text-base">
                {holding?.instrument?.symbol ?? symbol}
              </p>
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

                <div className="space-y-4">
                  <h3 className="text-lg font-bold">About</h3>

                  {/* Category badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    {isClassificationsLoading ? (
                      <>
                        <Skeleton className="h-6 w-16 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </>
                    ) : categoryBadges.length > 0 ? (
                      <>
                        {categoryBadges.map((badge) => (
                          <Badge
                            key={badge.id}
                            variant="secondary"
                            className="gap-1.5"
                            style={{
                              backgroundColor: `${badge.categoryColor}20`,
                              color: badge.categoryColor,
                              borderColor: badge.categoryColor,
                            }}
                          >
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: badge.categoryColor }}
                            />
                            {badge.categoryName}
                          </Badge>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            setEditSheetDefaultTab("classification");
                            setEditSheetOpen(true);
                          }}
                        >
                          More
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={() => {
                          setEditSheetDefaultTab("classification");
                          setEditSheetOpen(true);
                        }}
                      >
                        + Add classifications
                      </Button>
                    )}
                  </div>

                  {/* Notes section */}
                  <p className="text-muted-foreground text-sm">
                    {assetProfile?.notes || holding?.instrument?.notes || "No notes added."}
                  </p>
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

      {/* Edit Sheet */}
      <AssetEditSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        asset={assetProfile ?? null}
        latestQuote={quote}
        defaultTab={editSheetDefaultTab}
      />
    </Page>
  );
};

export default AssetProfilePage;
