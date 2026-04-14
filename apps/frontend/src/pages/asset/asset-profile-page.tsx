import {
  createActivity,
  getAssetHoldings,
  getHolding,
  openUrlInAppWebviewWindow,
  openUrlInBrowser,
  translateText,
} from "@/adapters";
import i18n from "@/i18n/i18n";
import { ActionPalette, type ActionPaletteGroup } from "@/components/action-palette";
import { TickerAvatar } from "@/components/ticker-avatar";
import { useHapticFeedback } from "@/hooks";
import { useAlternativeAssetHolding, useAlternativeHoldings } from "@/hooks/use-alternative-assets";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useQuoteHistory } from "@/hooks/use-quote-history";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { useAssetTaxonomyAssignments, useTaxonomy } from "@/hooks/use-taxonomies";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { localizeCategoryName } from "@/lib/taxonomy-i18n";
import {
  EXTERNAL_RESEARCH_SETTINGS_CHANGED_EVENT,
  type ExternalResearchAssetRef,
  externalResearchLinksForAsset,
  loadExternalResearchSettings,
  yahooFinanceChartUrlForAsset,
} from "@/lib/external-research-links";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/id";
import { QueryKeys } from "@/lib/query-keys";
import { useSettingsContext } from "@/lib/settings-provider";
import { AssetKind, Holding, Quote } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatedToggleGroup, Page, PageContent, PageHeader, SwipableView } from "@wealthfolio/ui";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Tabs, TabsContent } from "@wealthfolio/ui/components/ui/tabs";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlternativeAssetContent, useAlternativeAssetActions } from "./alternative-asset-content";
import { ValueHistoryDataGrid } from "./alternative-assets";
import AssetDetailCard from "./asset-detail-card";
import { AssetEditSheet } from "./asset-edit-sheet";
import AssetHistoryCard from "./asset-history-card";
import {
  AssetAccountHoldings,
  AssetSnapshotHistory,
  useHasManualSnapshots,
} from "./asset-account-holdings";
import AssetLotsTable from "./asset-lots-table";
import { useAssetProfile } from "./hooks/use-asset-profile";
import { useAssetProfileMutations } from "./hooks/use-asset-profile-mutations";
import { RefreshQuotesConfirmDialog } from "./refresh-quotes-confirm-dialog";
import { useQuoteMutations } from "./hooks/use-quote-mutations";
import { QuoteHistoryDataGrid } from "./quote-history-data-grid";
import { ProviderFundHoldings } from "./provider-fund-holdings";
import {
  getCountriesListFromAsset,
  getFundHoldingsListFromAsset,
  getSectorsListFromAsset,
} from "./asset-utils";

// Alternative asset kinds that should use ValueHistoryDataGrid
const ALTERNATIVE_ASSET_KINDS: AssetKind[] = [
  "PROPERTY",
  "VEHICLE",
  "COLLECTIBLE",
  "PRECIOUS_METAL",
  "LIABILITY",
  "OTHER",
];

const isAlternativeAsset = (kind: AssetKind | undefined | null): boolean => {
  if (!kind) return false;
  return ALTERNATIVE_ASSET_KINDS.includes(kind);
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
  quoteCurrency: string | null;
  quote: {
    open: number;
    high: number;
    low: number;
    volume: number;
    close: number;
    adjclose: number;
  } | null;
  bondSpec?: {
    maturityDate?: string | null;
    couponRate?: number | null;
    couponFrequency?: string | null;
  } | null;
  optionSpec?: {
    right?: string | null;
    strike?: number | null;
    expiration?: string | null;
  } | null;
}

type AssetTab = "overview" | "lots" | "history";

/** Map UI locale (e.g. de-DE, zh-CN) to MyMemory language codes. */
function mapUiLanguageToTranslationTarget(code: string): string {
  const c = code.trim();
  if (!c) return "en";
  if (/^zh/i.test(c)) {
    if (/hant|\btw\b|hk|mo/i.test(c)) return "zh-TW";
    return "zh-CN";
  }
  const short = c.split("-")[0]?.toLowerCase();
  return short && short.length >= 2 ? short : "en";
}

function YahooChartButton({
  t,
  asset,
}: {
  t: TFunction;
  asset: ExternalResearchAssetRef | null;
}) {
  const chartUrl = useMemo(
    () => yahooFinanceChartUrlForAsset(asset),
    [
      asset?.displayCode,
      asset?.instrumentSymbol,
      asset?.instrumentExchangeMic,
      asset?.instrumentType,
      asset?.profileQuoteType,
    ],
  );
  if (!chartUrl) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      type="button"
      onClick={() => {
        const settings = loadExternalResearchSettings();
        const sym = asset?.displayCode?.trim() || asset?.instrumentSymbol?.trim() || "";
        const title = `${t("asset.profile.yahoo_chart")} · ${sym}`;
        if (settings.openMode === "system_browser") {
          void openUrlInBrowser(chartUrl);
        } else {
          void openUrlInAppWebviewWindow(chartUrl, title);
        }
      }}
    >
      <Icons.BarChart className="mr-1 h-3.5 w-3.5" />
      {t("asset.profile.yahoo_chart")}
    </Button>
  );
}

function ExternalResearchLinksMenu({
  t,
  asset,
}: {
  t: TFunction;
  asset: ExternalResearchAssetRef | null;
}) {
  const [settingsTick, setSettingsTick] = useState(0);

  useEffect(() => {
    const bump = () => setSettingsTick((x) => x + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "wealthfolio.externalResearchLinks.v2") {
        bump();
      }
    };
    window.addEventListener(EXTERNAL_RESEARCH_SETTINGS_CHANGED_EVENT, bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EXTERNAL_RESEARCH_SETTINGS_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const links = useMemo(() => {
    void settingsTick;
    const hasSymbol = Boolean(asset?.displayCode?.trim() || asset?.instrumentSymbol?.trim());
    if (!hasSymbol) return [];
    return externalResearchLinksForAsset(asset, loadExternalResearchSettings());
  }, [
    asset?.displayCode,
    asset?.instrumentSymbol,
    asset?.instrumentExchangeMic,
    asset?.instrumentType,
    asset?.profileQuoteType,
    settingsTick,
  ]);

  if (links.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Icons.Link className="mr-1 h-3.5 w-3.5" />
          {t("asset.profile.external_links.button")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {links.map((link) => (
          <DropdownMenuItem
            key={`${link.provider ?? link.customId}-${link.url}`}
            onClick={() => {
              const settings = loadExternalResearchSettings();
              const titleBase = link.label ?? (link.labelKey ? t(link.labelKey) : link.url);
              const title = `${titleBase} · ${asset?.displayCode ?? asset?.instrumentSymbol ?? ""}`;
              const useSystemBrowser =
                link.openInSystemBrowser === true || settings.openMode === "system_browser";
              if (useSystemBrowser) {
                void openUrlInBrowser(link.url);
              } else {
                void openUrlInAppWebviewWindow(link.url, title);
              }
            }}
          >
            {link.label ?? (link.labelKey ? t(link.labelKey) : link.url)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ProviderAboutTranslateControlsProps {
  t: TFunction;
  canTranslate: boolean;
  isTranslating: boolean;
  isTranslated: boolean;
  onTranslate: () => void;
  onShowOriginal: () => void;
  /** Extra layout classes (e.g. alignment next to composition heading). */
  className?: string;
}

function ProviderAboutTranslateControls({
  t,
  canTranslate,
  isTranslating,
  isTranslated,
  onTranslate,
  onShowOriginal,
  className,
}: ProviderAboutTranslateControlsProps) {
  if (!canTranslate) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {isTranslated ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          type="button"
          onClick={onShowOriginal}
        >
          {t("asset.profile.show_original_notes")}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          type="button"
          onClick={onTranslate}
          disabled={isTranslating}
        >
          {isTranslating ? t("asset.profile.translating") : t("asset.profile.translate_notes")}
        </Button>
      )}
      <p className="text-muted-foreground text-[11px] leading-snug">
        {t("asset.profile.translate_disclaimer")}
      </p>
    </div>
  );
}

interface ProviderAboutNotesProps {
  t: TFunction;
  bodyText: string;
}

function ProviderAboutNotes({ t, bodyText }: ProviderAboutNotesProps) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">{t("asset.profile.notes_label")}</p>
      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{bodyText}</p>
    </div>
  );
}

export const AssetProfilePage = () => {
  const { t } = useTranslation("common");
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const { assetId: encodedAssetId = "" } = useParams<{ assetId: string }>();
  const assetId = decodeURIComponent(encodedAssetId);
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const tabParam = queryParams.get("tab");
  const defaultTab: AssetTab =
    tabParam === "overview" || tabParam === "lots" || tabParam === "history"
      ? tabParam
      : "overview";
  const [activeTab, setActiveTab] = useState<AssetTab>(defaultTab);
  type OverviewSubTab = "about" | "holdings" | "snapshots";
  const [overviewSubTab, setOverviewSubTab] = useState<OverviewSubTab>("about");
  const hasManualSnapshots = useHasManualSnapshots(assetId);
  const overviewSubTabs = useMemo(() => {
    const items: { value: OverviewSubTab; label: string }[] = [
      { value: "about", label: t("asset.profile.overview_subtab.about") },
      { value: "holdings", label: t("asset.profile.overview_subtab.holdings") },
    ];
    if (hasManualSnapshots) {
      items.push({ value: "snapshots", label: t("asset.profile.overview_subtab.snapshots") });
    }
    return items;
  }, [hasManualSnapshots, t]);
  const [actionPaletteOpen, setActionPaletteOpen] = useState(false);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editSheetDefaultTab, setEditSheetDefaultTab] = useState<
    "general" | "classification" | "market-data"
  >("general");
  const { triggerHaptic } = useHapticFeedback();
  const isMobile = useIsMobileViewport();
  const [translatedNotes, setTranslatedNotes] = useState<string | null>(null);
  const [isTranslatingNotes, setIsTranslatingNotes] = useState(false);

  const fxTabs = useMemo(() => {
    const items: { value: "overview" | "quotes"; label: string }[] = [
      { value: "overview", label: t("asset.profile.tab.overview") },
      { value: "quotes", label: t("asset.profile.tab.quotes") },
    ];
    return items;
  }, [t]);

  const [fxActiveTab, setFxActiveTab] = useState<"overview" | "quotes">(
    queryParams.get("tab") === "quotes" ? "quotes" : "overview",
  );

  const {
    data: assetProfile,
    isLoading: isAssetProfileLoading,
    isError: isAssetProfileError,
  } = useAssetProfile(assetId);

  const externalResearchAsset = useMemo((): ExternalResearchAssetRef | null => {
    if (!assetProfile) return null;
    const profileQuoteType =
      (assetProfile.metadata?.profile as { quoteType?: string } | undefined)?.quoteType ?? null;
    return {
      displayCode: assetProfile.displayCode,
      instrumentSymbol: assetProfile.instrumentSymbol,
      instrumentExchangeMic: assetProfile.instrumentExchangeMic,
      instrumentType: assetProfile.instrumentType,
      profileQuoteType,
    };
  }, [
    assetProfile?.displayCode,
    assetProfile?.instrumentSymbol,
    assetProfile?.instrumentExchangeMic,
    assetProfile?.instrumentType,
    assetProfile?.metadata,
  ]);

  const {
    data: holding,
    isLoading: isHoldingLoading,
    isError: isHoldingError,
  } = useQuery<Holding | null, Error>({
    queryKey: [QueryKeys.HOLDING, PORTFOLIO_ACCOUNT_ID, assetId],
    queryFn: () => getHolding(PORTFOLIO_ACCOUNT_ID, assetId),
    enabled: !!assetId,
  });

  const {
    data: quoteHistory,
    isLoading: isQuotesLoading,
    isError: isQuotesError,
  } = useQuoteHistory({
    assetId,
    enabled: !!assetId,
  });

  // Taxonomy data for category badges - use same approach as edit sheet
  const { data: assignments = [], isLoading: isAssignmentsLoading } =
    useAssetTaxonomyAssignments(assetId);
  const { updateQuoteModeMutation } = useAssetProfileMutations();

  // Fetch taxonomy details for taxonomies with assignments
  // We need the categories to get name and color
  const { data: typeOfSecurityTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "instrument_type")?.taxonomyId ?? null,
  );
  const { data: riskCategoryTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "risk_category")?.taxonomyId ?? null,
  );
  const { data: assetClassesTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "asset_classes")?.taxonomyId ?? null,
  );
  const { data: industriesTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "industries_gics")?.taxonomyId ?? null,
  );
  const { data: regionsTaxonomy } = useTaxonomy(
    assignments.find((a) => a.taxonomyId === "regions")?.taxonomyId ?? null,
  );

  const isClassificationsLoading = isAssignmentsLoading;

  // Build category badges from assignments and taxonomy data
  // Order: Class, Type, Risk
  const categoryBadges = useMemo(() => {
    const badges: {
      id: string;
      categoryName: string;
      categoryColor: string;
      taxonomyName: string;
    }[] = [];

    // Asset Class badge (first)
    const assetClassAssignment = assignments.find((a) => a.taxonomyId === "asset_classes");
    if (assetClassAssignment && assetClassesTaxonomy?.categories) {
      const category = assetClassesTaxonomy.categories.find(
        (c) => c.id === assetClassAssignment.categoryId,
      );
      if (category) {
        const localizedName = localizeCategoryName(t, assetClassesTaxonomy?.taxonomy, category);
        badges.push({
          id: category.id,
          categoryName: localizedName,
          categoryColor: category.color,
          taxonomyName: t("asset.profile.badge.taxonomy.class"),
        });
      }
    }

    // Type of Security badge (second)
    const typeAssignment = assignments.find((a) => a.taxonomyId === "instrument_type");
    if (typeAssignment && typeOfSecurityTaxonomy?.categories) {
      const category = typeOfSecurityTaxonomy.categories.find(
        (c) => c.id === typeAssignment.categoryId,
      );
      if (category) {
        const normalizedCategoryKey = (category.key ?? "").toUpperCase();
        const isEtfCategory =
          normalizedCategoryKey === "ETF" ||
          normalizedCategoryKey === "ETP" ||
          normalizedCategoryKey === "EXCHANGE_TRADED_FUND_ETF";
        const localizedName = localizeCategoryName(t, typeOfSecurityTaxonomy?.taxonomy, category);
        badges.push({
          id: category.id,
          categoryName: isEtfCategory ? t("asset.profile.badge.etf_short") : localizedName,
          categoryColor: category.color,
          taxonomyName: t("asset.profile.badge.taxonomy.type"),
        });
      }
    }

    // Risk Category badge (third)
    const riskAssignment = assignments.find((a) => a.taxonomyId === "risk_category");
    if (riskAssignment && riskCategoryTaxonomy?.categories) {
      const category = riskCategoryTaxonomy.categories.find(
        (c) => c.id === riskAssignment.categoryId,
      );
      if (category) {
        const localizedName = localizeCategoryName(t, riskCategoryTaxonomy?.taxonomy, category);
        badges.push({
          id: category.id,
          categoryName: t("asset.profile.badge.risk_label", { name: localizedName }),
          categoryColor: category.color,
          taxonomyName: t("asset.profile.badge.taxonomy.risk"),
        });
      }
    }

    // Industries (GICS) - top 2 by weight
    const industryAssignments = assignments
      .filter((a) => a.taxonomyId === "industries_gics")
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 2);
    if (industriesTaxonomy?.categories) {
      for (const assignment of industryAssignments) {
        const category = industriesTaxonomy.categories.find((c) => c.id === assignment.categoryId);
        if (category) {
          const localizedName = localizeCategoryName(t, industriesTaxonomy?.taxonomy, category);
          badges.push({
            id: `industry-${category.id}`,
            categoryName: localizedName,
            categoryColor: category.color,
            taxonomyName: t("asset.profile.badge.taxonomy.industry"),
          });
        }
      }
    }

    // Regions - top 2 by weight
    const regionAssignments = assignments
      .filter((a) => a.taxonomyId === "regions")
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 2);
    if (regionsTaxonomy?.categories) {
      for (const assignment of regionAssignments) {
        const category = regionsTaxonomy.categories.find((c) => c.id === assignment.categoryId);
        if (category) {
          const localizedName = localizeCategoryName(t, regionsTaxonomy?.taxonomy, category);
          badges.push({
            id: `region-${category.id}`,
            categoryName: localizedName,
            categoryColor: category.color,
            taxonomyName: t("asset.profile.badge.taxonomy.region"),
          });
        }
      }
    }

    return badges;
  }, [
    assignments,
    assetClassesTaxonomy,
    typeOfSecurityTaxonomy,
    riskCategoryTaxonomy,
    industriesTaxonomy,
    regionsTaxonomy,
    t,
  ]);

  const quote = useMemo(() => {
    // Backend returns quotes in descending order (newest first)
    // So .at(0) gives the latest quote
    return quoteHistory?.at(0) ?? null;
  }, [quoteHistory]);

  // Bond metadata for display (only when asset is a bond)
  const bondSpec = useMemo(() => {
    if (assetProfile?.instrumentType !== "BOND" || !assetProfile?.metadata) return null;
    const bond = assetProfile.metadata.bond as
      | {
          maturityDate?: string | null;
          couponRate?: number | null;
          couponFrequency?: string | null;
        }
      | undefined;
    if (!bond || (!bond.maturityDate && bond.couponRate == null)) return null;
    return bond;
  }, [assetProfile]);

  // Option metadata for display (only when asset is an option)
  const optionSpec = useMemo(() => {
    if (assetProfile?.instrumentType !== "OPTION" || !assetProfile?.metadata) return null;
    const option = assetProfile.metadata.option as
      | { right?: string | null; strike?: number | null; expiration?: string | null }
      | undefined;
    if (!option || (!option.right && option.strike == null && !option.expiration)) return null;
    return option;
  }, [assetProfile]);

  const isExpiredOption = useMemo(() => {
    if (!optionSpec?.expiration) return false;
    // Compare date-only: expired once the calendar day after expiration has started
    const today = new Date().toISOString().split("T")[0];
    return optionSpec.expiration < today;
  }, [optionSpec]);

  const [confirmExpiryOpen, setConfirmExpiryOpen] = useState(false);
  const queryClient = useQueryClient();

  const confirmExpiryMutation = useMutation({
    mutationFn: async () => {
      const accountHoldings = await getAssetHoldings(assetId);
      const nonZeroHoldings = accountHoldings.filter((h) => h.quantity > 0);
      if (nonZeroHoldings.length === 0) {
        throw new Error(i18n.t("asset.option_expiry.error.no_open_positions"));
      }

      for (const h of nonZeroHoldings) {
        await createActivity({
          idempotencyKey: generateId("option-expiry"),
          accountId: h.accountId,
          activityType: "ADJUSTMENT",
          subtype: "OPTION_EXPIRY",
          activityDate: optionSpec?.expiration ?? new Date().toISOString().split("T")[0],
          symbol: { id: assetId },
          quantity: String(h.quantity),
          unitPrice: "0",
          fee: "0",
          currency: h.localCurrency,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(i18n.t("asset.option_expiry.toast.success"));
    },
    onError: (error) => {
      const description = error instanceof Error ? error.message : String(error);
      toast.error(i18n.t("asset.option_expiry.toast.error_title"), { description });
    },
  });

  const { saveQuoteMutation, deleteQuoteMutation } = useQuoteMutations(assetId);
  const syncMarketDataMutation = useSyncMarketDataMutation(true);
  const updateMarketDataMutation = useSyncMarketDataMutation(false);

  // Determine if manual tracking based on asset's quoteMode
  const isManualPricingMode = assetProfile?.quoteMode === "MANUAL";

  // Determine if this is an alternative asset (property, vehicle, liability, etc.)
  const isAltAsset = isAlternativeAsset(assetProfile?.kind);
  const isLiability = assetProfile?.kind === "LIABILITY";

  const [quoteChartJump, setQuoteChartJump] = useState<{
    isoTimestamp: string;
    requestId: number;
  } | null>(null);

  const clearQuoteChartJump = useCallback(() => setQuoteChartJump(null), []);

  const handleQuoteChartDayClick = useCallback(
    (isoTimestamp: string) => {
      triggerHaptic();
      setQuoteChartJump({ isoTimestamp, requestId: Date.now() });
      if (assetProfile?.kind === "FX") {
        setFxActiveTab("quotes");
        navigate(`${location.pathname}?tab=quotes`, { replace: true });
        return;
      }
      setActiveTab("history");
      navigate(`${location.pathname}?tab=history`, { replace: true });
    },
    [assetProfile?.kind, location.pathname, navigate, triggerHaptic],
  );

  // Fetch alternative asset holding data (for alternative assets only)
  const { data: altHolding } = useAlternativeAssetHolding({
    assetId,
    enabled: isAltAsset,
  });

  // Fetch all alternative holdings for linking context
  const { data: allAltHoldings = [] } = useAlternativeHoldings({
    enabled: isAltAsset,
  });

  const profile = useMemo(() => {
    const instrument = holding?.instrument;
    const asset = assetProfile;

    if (!instrument && !asset) return null;

    const totalGainAmount = holding?.totalGain?.local ?? 0;
    const totalGainPercent = holding?.totalGainPct ?? 0;
    const calculatedAt = holding?.asOfDate;

    return {
      id: instrument?.id ?? asset?.id ?? "",
      symbol: instrument?.symbol ?? asset?.displayCode ?? assetId,
      name: instrument?.name ?? asset?.name ?? "-",
      isin: null,
      assetType: null,
      symbolMapping: null,
      notes: instrument?.notes ?? asset?.notes ?? null,
      // Sectors/countries: legacy JSON and/or provider profile JSON (see asset-utils merge)
      countries: asset ? JSON.stringify(getCountriesListFromAsset(asset)) : JSON.stringify([]),
      categories: null,
      classes: null,
      attributes: null,
      createdAt: holding?.openDate ? new Date(holding.openDate) : new Date(),
      updatedAt: new Date(),
      currency: instrument?.currency ?? asset?.quoteCcy ?? baseCurrency,
      sectors: asset ? JSON.stringify(getSectorsListFromAsset(asset)) : JSON.stringify([]),
      url: null,
      marketPrice: holding?.price ?? quote?.close ?? 0,
      totalGainAmount,
      totalGainPercent,
      calculatedAt,
    };
  }, [holding, assetProfile, quote, assetId]);

  const compositionSectors = useMemo(() => {
    if (!assetProfile) return [];
    return [...getSectorsListFromAsset(assetProfile)].sort((a, b) => b.weight - a.weight);
  }, [assetProfile]);

  /** Yahoo `topHoldings.holdings` (largest positions in the fund), not portfolio accounts. */
  const fundTopHoldings = useMemo(() => {
    if (!assetProfile) return [];
    return [...getFundHoldingsListFromAsset(assetProfile)].sort((a, b) => b.weight - a.weight);
  }, [assetProfile]);

  const providerNotesRaw = useMemo(
    () => (assetProfile?.notes ?? holding?.instrument?.notes ?? "").trim(),
    [assetProfile?.notes, holding?.instrument?.notes],
  );

  useEffect(() => {
    setTranslatedNotes(null);
  }, [assetId, providerNotesRaw]);

  const handleTranslateNotes = useCallback(async () => {
    if (!providerNotesRaw) return;
    const target = mapUiLanguageToTranslationTarget(i18n.language);
    const source = (settings?.translationSourceLang ?? "en").trim() || "en";
    setIsTranslatingNotes(true);
    try {
      const out = await translateText(providerNotesRaw, source, target);
      setTranslatedNotes(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(t("asset.profile.translate_error"), { description: msg });
    } finally {
      setIsTranslatingNotes(false);
    }
  }, [providerNotesRaw, settings?.translationSourceLang, t, i18n.language]);

  /** Stocks get Yahoo longBusinessSummary → notes; ETFs usually have no provider text — explain instead of "no notes". */
  const aboutSectionNotesDisplay = useMemo(() => {
    if (providerNotesRaw) return providerNotesRaw;
    const profileMeta = assetProfile?.metadata?.profile as { quoteType?: string } | undefined;
    const qt = profileMeta?.quoteType?.toUpperCase() ?? "";
    const it = (assetProfile?.instrumentType ?? "").toUpperCase();
    const etfLike =
      qt === "ETF" ||
      qt === "MUTUALFUND" ||
      qt === "ETP" ||
      it === "ETF" ||
      it === "MUTUALFUND" ||
      it === "ETP";
    if (etfLike) return t("asset.profile.etf_no_provider_text");
    return t("asset.alternative.no_notes");
  }, [providerNotesRaw, assetProfile, t]);

  const symbolHolding = useMemo((): AssetDetailData | null => {
    if (!holding) return null;

    const averageCostPrice =
      holding.costBasis?.local && holding.quantity !== 0
        ? holding.costBasis.local / holding.quantity
        : 0;

    const quoteData = quote
      ? {
          quote: {
            open: quote.open,
            high: quote.high,
            low: quote.low,
            volume: quote.volume,
            close: quote.close,
            adjclose: quote.adjclose,
          },
          quoteCurrency: quote.currency ?? null,
        }
      : null;

    const todaysReturn = holding.dayChange?.local;
    const todaysReturnPercent = holding.dayChangePct;

    return {
      numShares: Number(holding.quantity),
      marketValue: Number(holding.marketValue.local ?? 0),
      costBasis: Number(holding.costBasis?.local ?? 0),
      averagePrice: Number(averageCostPrice),
      portfolioPercent: Number(holding.weight ?? 0),
      todaysReturn: todaysReturn != null ? Number(todaysReturn) : null,
      todaysReturnPercent: todaysReturnPercent != null ? Number(todaysReturnPercent) : null,
      totalReturn: Number(holding.totalGain?.local ?? 0),
      totalReturnPercent: Number(holding.totalGainPct ?? 0),
      currency: holding.localCurrency ?? holding.instrument?.currency ?? baseCurrency,
      quoteCurrency: quoteData?.quoteCurrency ?? null,
      quote: quoteData?.quote ?? null,
      bondSpec: bondSpec ?? null,
      optionSpec: optionSpec ?? null,
    };
  }, [holding, quote, bondSpec, optionSpec]);

  // Build toggle items dynamically based on available data
  const toggleItems = useMemo(() => {
    const items: { value: AssetTab; label: string }[] = [];

    // For alternative assets: Overview | History (no Lots tab)
    if (isAltAsset) {
      items.push({ value: "overview", label: t("asset.profile.tab.overview") });
      items.push({ value: "history", label: t("asset.profile.tab.values") });
      return items;
    }

    // For regular assets
    if (profile) {
      items.push({ value: "overview", label: t("asset.profile.tab.overview") });
    }

    if (holding?.lots && holding.lots.length > 0) {
      items.push({ value: "lots", label: t("asset.profile.tab.lots") });
    }

    items.push({ value: "history", label: t("asset.profile.tab.quotes") });

    return items;
  }, [profile, holding, isAltAsset, t]);

  // Build swipable tabs for mobile
  const swipableTabs = useMemo(() => {
    const tabs: { name: string; content: React.ReactNode }[] = [];
    const slideTabKeys: AssetTab[] = [];

    if (profile) {
      tabs.push({
        name: t("asset.profile.tab.overview"),
        content: (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
              <AssetHistoryCard
                assetId={profile.id ?? ""}
                currency={quote?.currency ?? profile.currency ?? baseCurrency}
                marketPrice={quote?.close ?? profile.marketPrice}
                totalGainAmount={profile.totalGainAmount}
                totalGainPercent={profile.totalGainPercent}
                quoteHistory={quoteHistory ?? []}
                className={`col-span-1 ${holding ? "md:col-span-2" : "md:col-span-3"}`}
                onChartDayClick={!isAltAsset ? handleQuoteChartDayClick : undefined}
                chartClickHint={
                  !isAltAsset ? t("asset.history.chart_click_hint") : undefined
                }
              />
              {symbolHolding && (
                <AssetDetailCard assetData={symbolHolding} className="col-span-1 md:col-span-1" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AnimatedToggleGroup
                items={overviewSubTabs}
                value={overviewSubTab}
                onValueChange={(v: OverviewSubTab) => setOverviewSubTab(v)}
                className="text-sm"
              />
              <ExternalResearchLinksMenu t={t} asset={externalResearchAsset} />
              <YahooChartButton t={t} asset={externalResearchAsset} />
            </div>

            {overviewSubTab === "about" && (
              <div className="space-y-4">
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
                        {t("asset.profile.more_badges")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-6 text-xs"
                      onClick={() => {
                        setEditSheetDefaultTab("classification");
                        setEditSheetOpen(true);
                      }}
                    >
                      {t("asset.profile.add_classifications")}
                    </Button>
                  )}
                </div>

                {compositionSectors.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-medium">{t("asset.profile.composition_title")}</h4>
                      <ProviderAboutTranslateControls
                        t={t}
                        canTranslate={providerNotesRaw.length > 0}
                        isTranslating={isTranslatingNotes}
                        isTranslated={translatedNotes !== null}
                        onTranslate={handleTranslateNotes}
                        onShowOriginal={() => setTranslatedNotes(null)}
                      />
                    </div>
                    <ul className="space-y-2">
                      {compositionSectors.map((row) => {
                        const pct =
                          row.weight <= 1 && row.weight >= 0 ? row.weight * 100 : row.weight;
                        const pctLabel =
                          pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
                        return (
                          <li key={row.name} className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate font-medium">{row.name}</span>
                              <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                                {pctLabel}
                              </span>
                            </div>
                            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                              <div
                                className="bg-primary/70 h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, Math.max(0, pct))}%`,
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {compositionSectors.length === 0 && providerNotesRaw.length > 0 && (
                  <ProviderAboutTranslateControls
                    t={t}
                    canTranslate
                    isTranslating={isTranslatingNotes}
                    isTranslated={translatedNotes !== null}
                    onTranslate={handleTranslateNotes}
                    onShowOriginal={() => setTranslatedNotes(null)}
                  />
                )}

                <ProviderAboutNotes
                  t={t}
                  bodyText={translatedNotes ?? aboutSectionNotesDisplay}
                />
              </div>
            )}

            {overviewSubTab === "holdings" && (
              <div className="space-y-6">
                <ProviderFundHoldings rows={fundTopHoldings} />
                <AssetAccountHoldings assetId={assetId} baseCurrency={baseCurrency} />
              </div>
            )}

            {overviewSubTab === "snapshots" && (
              <AssetSnapshotHistory assetId={assetId} baseCurrency={baseCurrency} />
            )}
          </div>
        ),
      });
      slideTabKeys.push("overview");
    }

    if (holding?.lots && holding.lots.length > 0 && profile) {
      tabs.push({
        name: t("asset.profile.tab.lots"),
        content: (
          <AssetLotsTable
            lots={holding.lots}
            currency={symbolHolding?.currency ?? profile.currency ?? baseCurrency}
            marketPrice={Number(holding.price ?? profile.marketPrice)}
          />
        ),
      });
      slideTabKeys.push("lots");
    }

    // Use ValueHistoryDataGrid for alternative assets, QuoteHistoryTable for regular assets
    tabs.push({
      name: isAltAsset ? t("asset.profile.tab.values") : t("asset.profile.tab.quotes"),
      content: isAltAsset ? (
        <ValueHistoryDataGrid
          data={quoteHistory ?? []}
          currency={profile?.currency ?? baseCurrency}
          isLiability={isLiability}
          onSaveQuote={(quote: Quote) => {
            saveQuoteMutation.mutate(quote);
          }}
          onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
        />
      ) : (
        <QuoteHistoryDataGrid
          data={quoteHistory ?? []}
          assetId={assetId}
          currency={quote?.currency ?? profile?.currency ?? baseCurrency}
          assetKind={assetProfile?.kind}
          isManualDataSource={isManualPricingMode}
          onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
          onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
          onChangeDataSource={(isManual) => {
            if (profile) {
              updateQuoteModeMutation.mutate({
                assetId: assetId,
                quoteMode: isManual ? "MANUAL" : "MARKET",
              });
            }
          }}
          jumpToQuoteAt={quoteChartJump?.isoTimestamp ?? null}
          jumpRequestId={quoteChartJump?.requestId ?? 0}
          onQuoteJumpHandled={clearQuoteChartJump}
        />
      ),
    });
    slideTabKeys.push("history");

    return { items: tabs, slideTabKeys };
  }, [
    profile,
    holding,
    symbolHolding,
    quoteHistory,
    saveQuoteMutation,
    deleteQuoteMutation,
    assetId,
    isAltAsset,
    isLiability,
    isManualPricingMode,
    categoryBadges,
    isClassificationsLoading,
    assetProfile,
    compositionSectors,
    fundTopHoldings,
    aboutSectionNotesDisplay,
    translatedNotes,
    isTranslatingNotes,
    providerNotesRaw,
    handleTranslateNotes,
    overviewSubTab,
    overviewSubTabs,
    t,
    handleQuoteChartDayClick,
    clearQuoteChartJump,
    quoteChartJump,
  ]);

  const isLoading = isHoldingLoading || isQuotesLoading || isAssetProfileLoading;
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);

  const handleUpdateQuotes = useCallback(() => {
    if (!profile?.id) return;
    triggerHaptic();
    updateMarketDataMutation.mutate([profile.id]);
  }, [profile?.id, updateMarketDataMutation, triggerHaptic]);

  const handleRefreshQuotes = useCallback(() => {
    if (!profile?.id) return;
    triggerHaptic();
    syncMarketDataMutation.mutate([profile.id]);
  }, [profile?.id, syncMarketDataMutation, triggerHaptic]);

  const handleRefreshQuotesWithConfirm = useCallback(() => {
    setRefreshConfirmOpen(true);
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Alternative asset actions hook (only used when isAltAsset && altHolding)
  const altAssetActions = useAlternativeAssetActions({
    holding: altHolding,
    assetProfile: assetProfile,
    allHoldings: allAltHoldings,
    onNavigateBack: handleBack,
  });

  if (isLoading)
    return (
      <Page>
        <PageContent>
          <Icons.Spinner className="h-6 w-6 animate-spin" />
        </PageContent>
      </Page>
    ); // Show loading spinner

  // FX assets use tabs: Overview (with chart) | Quotes

  // Simplified view for quote-only assets (like FX rates)
  if (assetProfile?.kind === "FX") {
    return (
      <Page>
        <PageHeader
          heading={assetProfile.displayCode ?? assetId}
          text={assetProfile.name ?? ""}
          onBack={handleBack}
          actions={
            <div className="flex items-center gap-2">
              <AnimatedToggleGroup
                items={fxTabs}
                value={fxActiveTab}
                onValueChange={(next: "overview" | "quotes") => {
                  if (next === fxActiveTab) return;
                  triggerHaptic();
                  setFxActiveTab(next);
                  const url = `${location.pathname}?tab=${next}`;
                  navigate(url, { replace: true });
                }}
                className="mr-2"
              />
              <ActionPalette
                open={actionPaletteOpen}
                onOpenChange={setActionPaletteOpen}
                title={assetProfile.displayCode ?? assetId}
                groups={
                  [
                    {
                      title: t("asset.profile.palette.manage"),
                      items: [
                        {
                          icon: Icons.Download,
                          label: t("asset.profile.action.update_price"),
                          onClick: handleUpdateQuotes,
                        },
                        {
                          icon: Icons.Refresh,
                          label: t("asset.profile.action.refresh_history"),
                          onClick: handleRefreshQuotesWithConfirm,
                        },
                        {
                          icon: Icons.Pencil,
                          label: t("asset.profile.action.edit"),
                          onClick: () => setEditSheetOpen(true),
                        },
                      ],
                    },
                  ] satisfies ActionPaletteGroup[]
                }
                trigger={
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Icons.DotsThreeVertical className="h-5 w-5" weight="fill" />
                  </Button>
                }
              />
            </div>
          }
        />
        <PageContent>
          {fxActiveTab === "overview" && (
            <div className="space-y-4">
              <AssetHistoryCard
                assetId={assetId}
                currency={quote?.currency ?? profile?.currency ?? baseCurrency}
                marketPrice={quote?.close ?? 0}
                totalGainAmount={0}
                totalGainPercent={0}
                quoteHistory={quoteHistory ?? []}
                className="w-full"
                onChartDayClick={handleQuoteChartDayClick}
                chartClickHint={t("asset.history.chart_click_hint")}
              />

              {/* Type badge */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {t("asset.profile.fx_rate_badge")}
                </Badge>
              </div>

              {/* Notes section */}
              <p className="text-muted-foreground text-sm">
                {assetProfile?.notes || t("asset.alternative.no_notes")}
              </p>
            </div>
          )}
          {fxActiveTab === "quotes" && (
            <QuoteHistoryDataGrid
              data={quoteHistory ?? []}
              assetId={assetId}
              currency={profile?.currency ?? baseCurrency}
              assetKind={assetProfile?.kind}
              isManualDataSource={isManualPricingMode}
              onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
              onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
              onChangeDataSource={(isManual) => {
                updateQuoteModeMutation.mutate({
                  assetId: assetId,
                  quoteMode: isManual ? "MANUAL" : "MARKET",
                });
              }}
              jumpToQuoteAt={quoteChartJump?.isoTimestamp ?? null}
              jumpRequestId={quoteChartJump?.requestId ?? 0}
              onQuoteJumpHandled={clearQuoteChartJump}
            />
          )}
        </PageContent>

        <AssetEditSheet
          open={editSheetOpen}
          onOpenChange={setEditSheetOpen}
          asset={assetProfile ?? null}
          latestQuote={quote}
          defaultTab="general"
        />
      </Page>
    );
  }

  // Handle case where loading finished but we have no asset data at all
  if (!profile && (!quoteHistory || quoteHistory.length === 0)) {
    return (
      <Page>
        <PageHeader
          heading={assetId}
          text={t("asset.profile.error.load_title", { assetId })}
          onBack={handleBack}
        />
        <PageContent>
          <p>{t("asset.profile.error.description")}</p>
          {isHoldingError && (
            <p className="text-sm text-red-500">{t("asset.profile.error.holding_fetch")}</p>
          )}
          {isQuotesError && (
            <p className="text-sm text-red-500">{t("asset.profile.error.quote_fetch")}</p>
          )}
          {isAssetProfileError && (
            <p className="text-sm text-red-500">{t("asset.profile.error.profile_fetch")}</p>
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
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex">
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
            <ActionPalette
              open={actionPaletteOpen}
              onOpenChange={setActionPaletteOpen}
              title={
                isAltAsset && altHolding
                  ? altHolding.name
                  : (assetProfile?.displayCode ?? assetProfile?.name ?? assetId)
              }
              groups={
                isAltAsset && altHolding
                  ? ([
                      {
                        title: t("asset.profile.palette.valuation"),
                        items: [
                          {
                            icon: Icons.DollarSign,
                            label: t("asset.profile.action.update_value"),
                            onClick: () => altAssetActions.openUpdateValuation(),
                          },
                        ],
                      },
                      {
                        title: t("asset.profile.palette.manage"),
                        items: [
                          {
                            icon: Icons.Pencil,
                            label: t("asset.profile.action.edit_details"),
                            onClick: () => altAssetActions.openEditDetails(),
                          },
                          ...(altAssetActions.isLinkableAsset
                            ? [
                                {
                                  icon: Icons.Link,
                                  label: t("asset.profile.action.add_liability"),
                                  onClick: () => altAssetActions.openAddLiability(),
                                },
                              ]
                            : []),
                          {
                            icon: Icons.Trash,
                            label: t("asset.profile.action.delete"),
                            onClick: () => altAssetActions.openDeleteConfirm(),
                          },
                        ],
                      },
                    ] satisfies ActionPaletteGroup[])
                  : ([
                      {
                        title: t("account.page.actions.record_transaction"),
                        items: [
                          {
                            icon: Icons.TrendingUp,
                            label: t("activity.types.BUY"),
                            onClick: () =>
                              navigate(
                                `/activities/manage?assetId=${encodeURIComponent(assetId)}&type=BUY`,
                              ),
                          },
                          {
                            icon: Icons.TrendingDown,
                            label: t("activity.types.SELL"),
                            onClick: () =>
                              navigate(
                                `/activities/manage?assetId=${encodeURIComponent(assetId)}&type=SELL`,
                              ),
                          },
                          {
                            icon: Icons.Coins,
                            label: t("activity.types.DIVIDEND"),
                            onClick: () =>
                              navigate(
                                `/activities/manage?assetId=${encodeURIComponent(assetId)}&type=DIVIDEND`,
                              ),
                          },
                          {
                            icon: Icons.Ellipsis,
                            label: t("asset.profile.action.other_activity"),
                            onClick: () =>
                              navigate(`/activities/manage?assetId=${encodeURIComponent(assetId)}`),
                          },
                          ...(isExpiredOption
                            ? [
                                {
                                  icon: Icons.XCircle,
                                  label: t("asset.profile.action.confirm_option_expiry"),
                                  onClick: () => setConfirmExpiryOpen(true),
                                },
                              ]
                            : []),
                        ],
                      },
                      {
                        title: t("asset.profile.palette.manage"),
                        items: [
                          {
                            icon: Icons.Download,
                            label: t("asset.profile.action.update_price"),
                            onClick: handleUpdateQuotes,
                          },
                          {
                            icon: Icons.Refresh,
                            label: t("asset.profile.action.refresh_history"),
                            onClick: handleRefreshQuotesWithConfirm,
                          },
                          {
                            icon: Icons.Pencil,
                            label: t("asset.profile.action.edit"),
                            onClick: () => setEditSheetOpen(true),
                          },
                        ],
                      },
                    ] satisfies ActionPaletteGroup[])
              }
              trigger={
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <Icons.DotsThreeVertical className="h-5 w-5" weight="fill" />
                </Button>
              }
            />
          </div>
        }
      >
        <div className="flex items-center gap-2" data-tauri-drag-region="true">
          {isAltAsset && altHolding ? (
            <div className="bg-muted flex h-9 w-9 items-center justify-center rounded-full">
              <AlternativeAssetIcon kind={altHolding.kind} size={20} />
            </div>
          ) : (
            (profile?.symbol ?? holding?.instrument?.symbol ?? assetProfile?.displayCode) && (
              <TickerAvatar
                symbol={
                  profile?.symbol ??
                  holding?.instrument?.symbol ??
                  assetProfile?.displayCode ??
                  assetId
                }
                className="size-9"
              />
            )
          )}
          <div className="flex min-w-0 flex-col justify-center">
            <h1 className="truncate text-base font-semibold leading-tight md:text-lg">
              {assetProfile?.name ?? holding?.instrument?.name ?? assetId ?? "-"}
            </h1>
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs leading-tight md:text-sm">
              {isAltAsset && altHolding ? (
                getAlternativeAssetKindLabel(altHolding.kind, t)
              ) : (
                <>
                  {assetProfile?.displayCode ?? holding?.instrument?.symbol ?? assetId}
                  {(assetProfile?.quoteCcy ?? profile?.currency) && (
                    <>
                      <span className="bg-muted-foreground/40 h-3 w-px rounded-full" />
                      {assetProfile?.quoteCcy ?? profile?.currency}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </div>
      </PageHeader>
      <PageContent>
        {/* Alternative Asset Content */}
        {isAltAsset && altHolding && assetProfile ? (
          isMobile ? (
            <SwipableView
              items={[
                {
                  name: t("asset.profile.tab.overview"),
                  content: (
                    <AlternativeAssetContent
                      assetId={assetId}
                      assetProfile={assetProfile}
                      holding={altHolding}
                      quoteHistory={quoteHistory ?? []}
                      activeTab="overview"
                      isMobile={true}
                    />
                  ),
                },
                {
                  name: t("asset.profile.tab.values"),
                  content: (
                    <AlternativeAssetContent
                      assetId={assetId}
                      assetProfile={assetProfile}
                      holding={altHolding}
                      quoteHistory={quoteHistory ?? []}
                      activeTab="history"
                      isMobile={true}
                    />
                  ),
                },
              ]}
              displayToggle={true}
              onViewChange={(index: number) => {
                const tabValue: AssetTab = index === 1 ? "history" : "overview";
                if (tabValue === activeTab) return;
                triggerHaptic();
                setActiveTab(tabValue);
                navigate(`${location.pathname}?tab=${tabValue}`, { replace: true });
              }}
            />
          ) : (
            <Tabs value={activeTab} className="space-y-4">
              <TabsContent value="overview" className="space-y-4">
                <AlternativeAssetContent
                  assetId={assetId}
                  assetProfile={assetProfile}
                  holding={altHolding}
                  quoteHistory={quoteHistory ?? []}
                  activeTab="overview"
                  isMobile={false}
                />
              </TabsContent>
              <TabsContent value="history" className="pt-6">
                <AlternativeAssetContent
                  assetId={assetId}
                  assetProfile={assetProfile}
                  holding={altHolding}
                  quoteHistory={quoteHistory ?? []}
                  activeTab="history"
                  isMobile={false}
                />
              </TabsContent>
            </Tabs>
          )
        ) : isMobile ? (
          <SwipableView
            items={swipableTabs.items}
            displayToggle={true}
            onViewChange={(index: number) => {
              const tabValue = swipableTabs.slideTabKeys[index];
              if (tabValue === undefined || tabValue === activeTab) {
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
                    assetId={profile.id ?? ""}
                    currency={quote?.currency ?? profile.currency ?? baseCurrency}
                    marketPrice={quote?.close ?? profile.marketPrice}
                    totalGainAmount={profile.totalGainAmount}
                    totalGainPercent={profile.totalGainPercent}
                    quoteHistory={quoteHistory ?? []}
                    className={`col-span-1 ${holding ? "md:col-span-2" : "md:col-span-3"}`}
                    onChartDayClick={!isAltAsset ? handleQuoteChartDayClick : undefined}
                    chartClickHint={
                      !isAltAsset ? t("asset.history.chart_click_hint") : undefined
                    }
                  />
                  {symbolHolding && (
                    <AssetDetailCard
                      assetData={symbolHolding}
                      className="col-span-1 md:col-span-1"
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <AnimatedToggleGroup
                    items={overviewSubTabs}
                    value={overviewSubTab}
                    onValueChange={(v: OverviewSubTab) => setOverviewSubTab(v)}
                    className="text-sm"
                  />
                  <ExternalResearchLinksMenu t={t} asset={externalResearchAsset} />
                  <YahooChartButton t={t} asset={externalResearchAsset} />
                </div>

                {overviewSubTab === "about" && (
                  <div className="space-y-4">
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
                            {t("asset.profile.more_badges")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground h-6 text-xs"
                          onClick={() => {
                            setEditSheetDefaultTab("classification");
                            setEditSheetOpen(true);
                          }}
                        >
                          {t("asset.profile.add_classifications")}
                        </Button>
                      )}
                    </div>

                    {compositionSectors.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-medium">{t("asset.profile.composition_title")}</h4>
                          <ProviderAboutTranslateControls
                            t={t}
                            canTranslate={providerNotesRaw.length > 0}
                            isTranslating={isTranslatingNotes}
                            isTranslated={translatedNotes !== null}
                            onTranslate={handleTranslateNotes}
                            onShowOriginal={() => setTranslatedNotes(null)}
                          />
                        </div>
                        <ul className="space-y-2">
                          {compositionSectors.map((row) => {
                            const pct =
                              row.weight <= 1 && row.weight >= 0 ? row.weight * 100 : row.weight;
                            const pctLabel =
                              pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
                            return (
                              <li key={row.name} className="space-y-0.5">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="min-w-0 truncate font-medium">{row.name}</span>
                                  <span className="text-muted-foreground shrink-0 tabular-nums text-xs">
                                    {pctLabel}
                                  </span>
                                </div>
                                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                  <div
                                    className="bg-primary/70 h-full rounded-full"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, pct))}%`,
                                    }}
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {compositionSectors.length === 0 && providerNotesRaw.length > 0 && (
                      <ProviderAboutTranslateControls
                        t={t}
                        canTranslate
                        isTranslating={isTranslatingNotes}
                        isTranslated={translatedNotes !== null}
                        onTranslate={handleTranslateNotes}
                        onShowOriginal={() => setTranslatedNotes(null)}
                      />
                    )}

                    <ProviderAboutNotes
                      t={t}
                      bodyText={translatedNotes ?? aboutSectionNotesDisplay}
                    />
                  </div>
                )}

                {overviewSubTab === "holdings" && (
                  <div className="space-y-6">
                    <ProviderFundHoldings rows={fundTopHoldings} />
                    <AssetAccountHoldings assetId={assetId} baseCurrency={baseCurrency} />
                  </div>
                )}

                {overviewSubTab === "snapshots" && (
                  <AssetSnapshotHistory assetId={assetId} baseCurrency={baseCurrency} />
                )}
              </TabsContent>
            )}

            {/* Lots Content: Requires profile and holding with lots */}
            {profile && holding?.lots && holding.lots.length > 0 && (
              <TabsContent value="lots" className="pt-6">
                <AssetLotsTable
                  lots={holding.lots}
                  currency={symbolHolding?.currency ?? profile.currency ?? baseCurrency}
                  marketPrice={Number(holding.price ?? profile.marketPrice)}
                />
              </TabsContent>
            )}

            {/* History/Quotes Content: Requires quoteHistory */}
            <TabsContent value="history" className="space-y-16 pt-6">
              {isAltAsset ? (
                <ValueHistoryDataGrid
                  data={quoteHistory ?? []}
                  currency={profile?.currency ?? baseCurrency}
                  isLiability={isLiability}
                  onSaveQuote={(quote: Quote) => {
                    saveQuoteMutation.mutate(quote);
                  }}
                  onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
                />
              ) : (
                <QuoteHistoryDataGrid
                  data={quoteHistory ?? []}
                  assetId={assetId}
                  currency={quote?.currency ?? profile?.currency ?? baseCurrency}
                  assetKind={assetProfile?.kind}
                  isManualDataSource={isManualPricingMode}
                  onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
                  onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
                  onChangeDataSource={(isManual) => {
                    if (profile) {
                      updateQuoteModeMutation.mutate({
                        assetId: assetId,
                        quoteMode: isManual ? "MANUAL" : "MARKET",
                      });
                    }
                  }}
                  jumpToQuoteAt={quoteChartJump?.isoTimestamp ?? null}
                  jumpRequestId={quoteChartJump?.requestId ?? 0}
                  onQuoteJumpHandled={clearQuoteChartJump}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </PageContent>

      <RefreshQuotesConfirmDialog
        open={refreshConfirmOpen}
        onOpenChange={setRefreshConfirmOpen}
        onConfirm={handleRefreshQuotes}
      />

      {/* Confirm Option Expiry Dialog */}
      <AlertDialog open={confirmExpiryOpen} onOpenChange={setConfirmExpiryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("asset.option_expiry.dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("asset.option_expiry.dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("asset.refresh_history.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmExpiryMutation.mutate();
                setConfirmExpiryOpen(false);
              }}
            >
              {t("asset.option_expiry.dialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Sheet (for regular assets) */}
      <AssetEditSheet
        open={editSheetOpen}
        onOpenChange={setEditSheetOpen}
        asset={assetProfile ?? null}
        latestQuote={quote}
        defaultTab={editSheetDefaultTab}
      />

      {/* Alternative Asset Modals */}
      {isAltAsset && altHolding && altAssetActions.modals}
    </Page>
  );
};

// Helper component for alternative asset icons
function AlternativeAssetIcon({ kind, size = 20 }: { kind: string; size?: number }) {
  switch (kind.toLowerCase()) {
    case "property":
      return <Icons.RealEstateDuotone size={size} />;
    case "vehicle":
      return <Icons.VehicleDuotone size={size} />;
    case "collectible":
      return <Icons.CollectibleDuotone size={size} />;
    case "precious":
      return <Icons.PreciousDuotone size={size} />;
    case "liability":
      return <Icons.LiabilityDuotone size={size} />;
    default:
      return <Icons.OtherAssetDuotone size={size} />;
  }
}

// Helper to get display label for alternative asset kinds
function getAlternativeAssetKindLabel(kind: string, t: TFunction<"common">): string {
  const k = kind.toLowerCase();
  switch (k) {
    case "property":
    case "vehicle":
    case "collectible":
    case "precious":
    case "liability":
    case "other":
      return t(`asset.alternative.kind.${k}`);
    default:
      return kind;
  }
}

export default AssetProfilePage;


