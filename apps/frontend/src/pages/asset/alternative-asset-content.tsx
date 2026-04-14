import { buildIntervalButtonLabels, buildIntervalLabels } from "@/lib/interval-labels";
import React, { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
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
import {
  Icons,
  IntervalSelector,
  EmptyPlaceholder,
  AmountDisplay,
  formatPercent,
  getInitialIntervalData,
} from "@wealthfolio/ui";
import HistoryChart from "@/components/history-chart-symbol";
import { ValueHistoryDataGrid } from "./alternative-assets";
import {
  AssetDetailsSheet,
  type AssetDetailsSheetAsset,
  UpdateValuationModal,
  AlternativeAssetQuickAddModal,
} from "./alternative-assets";
import { useAlternativeAssetMutations } from "./alternative-assets/hooks/use-alternative-asset-mutations";
import { LinkedLiabilitiesSection, LinkedAssetSection } from "./linked-liabilities-card";
import { useQuoteMutations } from "./hooks/use-quote-mutations";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useLinkedLiabilities, useAlternativeHoldings } from "@/hooks/use-alternative-assets";
import type { AlternativeAssetHolding, Quote, Asset, TimePeriod, DateRange } from "@/lib/types";
import { AlternativeAssetKind } from "@/lib/types";
import { parseLocalDate } from "@/lib/utils";

interface AlternativeAssetContentProps {
  assetId: string;
  assetProfile: Asset;
  holding: AlternativeAssetHolding;
  quoteHistory: Quote[];
  activeTab: "overview" | "history";
  isMobile?: boolean;
}

/**
 * Content component for alternative asset detail pages.
 * Handles Overview and History tabs with alternative-specific layouts.
 */
export const AlternativeAssetContent: React.FC<AlternativeAssetContentProps> = ({
  assetId,
  assetProfile,
  holding,
  quoteHistory,
  activeTab,
}) => {
  const { t } = useTranslation();
  const intervalLabels = useMemo(() => buildIntervalLabels(t), [t]);
  const intervalButtonLabels = useMemo(() => buildIntervalButtonLabels(t), [t]);
  const kindBadgeConfig = useMemo(
    () => ({
      property: { label: t("asset.alternative.kind.property"), color: "#6b7280" },
      vehicle: { label: t("asset.alternative.kind.vehicle"), color: "#6b7280" },
      collectible: { label: t("asset.alternative.kind.collectible"), color: "#6b7280" },
      precious: { label: t("asset.alternative.kind.precious"), color: "#6b7280" },
      liability: { label: t("asset.alternative.kind.liability"), color: "#6b7280" },
      other: { label: t("asset.alternative.kind.other"), color: "#6b7280" },
    }),
    [t],
  );
  const { isBalanceHidden } = useBalancePrivacy();

  // Chart state
  const [selectedIntervalCode, setSelectedIntervalCode] = useState<TimePeriod>("ALL");
  const selectedIntervalDesc = useMemo(
    () => getInitialIntervalData(selectedIntervalCode, intervalLabels).description,
    [selectedIntervalCode, intervalLabels],
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Fetch linked liabilities for property/vehicle
  const isLinkableAsset =
    holding.kind.toLowerCase() === "property" || holding.kind.toLowerCase() === "vehicle";
  const { data: linkedLiabilities = [] } = useLinkedLiabilities({
    assetId,
    enabled: isLinkableAsset,
  });

  // Fetch all alternative holdings to find linked asset for liabilities
  const { data: allHoldings = [] } = useAlternativeHoldings({ enabled: !!holding.linkedAssetId });
  const linkedAsset = useMemo(() => {
    if (!holding.linkedAssetId) return undefined;
    return allHoldings.find((h) => h.id === holding.linkedAssetId);
  }, [holding.linkedAssetId, allHoldings]);

  // Quote mutations for history grid
  const { saveQuoteMutation, deleteQuoteMutation } = useQuoteMutations(assetId);

  // Filter chart data by date range
  const filteredChartData = useMemo(() => {
    if (!quoteHistory || quoteHistory.length === 0) return [];

    // Sort quotes chronologically (oldest first)
    const sortedQuotes = [...quoteHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    if (!dateRange?.from || !dateRange?.to || selectedIntervalCode === "ALL") {
      return sortedQuotes.map((quote) => ({
        timestamp: quote.timestamp,
        totalValue: quote.close,
        currency: holding.currency,
      }));
    }

    return sortedQuotes
      .filter((quote) => {
        const quoteDate = new Date(quote.timestamp);
        return (
          dateRange.from && dateRange.to && quoteDate >= dateRange.from && quoteDate <= dateRange.to
        );
      })
      .map((quote) => ({
        timestamp: quote.timestamp,
        totalValue: quote.close,
        currency: holding.currency,
      }));
  }, [dateRange, quoteHistory, holding.currency, selectedIntervalCode]);

  // Calculate gain for displayed interval
  const { gainAmount, gainPercent } = useMemo(() => {
    const unrealizedGain = holding.unrealizedGain ? parseFloat(holding.unrealizedGain) : null;
    const unrealizedGainPct = holding.unrealizedGainPct
      ? parseFloat(holding.unrealizedGainPct)
      : null;

    if (selectedIntervalCode === "ALL") {
      return {
        gainAmount: unrealizedGain,
        gainPercent: unrealizedGainPct,
      };
    }

    // Calculate gain for filtered period
    const startValue = filteredChartData[0]?.totalValue;
    const endValue = filteredChartData.at(-1)?.totalValue;
    const isValidStartValue = typeof startValue === "number" && startValue !== 0;

    return {
      gainAmount:
        typeof startValue === "number" && typeof endValue === "number"
          ? endValue - startValue
          : null,
      gainPercent:
        isValidStartValue && typeof endValue === "number"
          ? (endValue - startValue) / startValue
          : null,
    };
  }, [filteredChartData, selectedIntervalCode, holding.unrealizedGain, holding.unrealizedGainPct]);

  const handleIntervalSelect = (code: TimePeriod, _description: string, range: DateRange | undefined) => {
    setSelectedIntervalCode(code);
    setDateRange(range);
  };

  const isLiability = holding.kind.toLowerCase() === "liability";
  const marketValue = parseFloat(holding.marketValue);

  // Calculate net equity for linkable assets
  const netEquity = useMemo(() => {
    if (linkedLiabilities.length === 0) {
      return null;
    }
    const liabilityTotal = linkedLiabilities.reduce((sum, liability) => {
      return sum + Math.abs(parseFloat(liability.marketValue));
    }, 0);
    return marketValue - liabilityTotal;
  }, [marketValue, linkedLiabilities]);

  if (activeTab === "overview") {
    return (
      <div className="space-y-4">
        {/* Main grid: Chart on left, Details on right */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Left: Value history chart with value/gain/equity in header */}
          <Card className="col-span-1 md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-md">
                <div>
                  <p className="pt-3 text-xl font-bold">
                    <AmountDisplay
                      value={isLiability ? -marketValue : marketValue}
                      currency={holding.currency}
                      isHidden={isBalanceHidden}
                    />
                  </p>
                  {gainAmount !== null && gainPercent !== null && (
                    <p
                      className={`text-sm ${
                        isLiability
                          ? gainAmount <= 0
                            ? "text-success"
                            : "text-destructive"
                          : gainAmount >= 0
                            ? "text-success"
                            : "text-destructive"
                      }`}
                    >
                      {isLiability ? (
                        <>
                          {gainAmount <= 0
                            ? t("asset.alternative.liability_paid_down")
                            : t("asset.alternative.liability_increased")}
                          <AmountDisplay
                            value={Math.abs(gainAmount)}
                            currency={holding.currency}
                            isHidden={isBalanceHidden}
                          />{" "}
                          ({formatPercent(Math.abs(gainPercent))}) {selectedIntervalDesc}
                        </>
                      ) : (
                        <>
                          <AmountDisplay
                            value={gainAmount}
                            currency={holding.currency}
                            isHidden={isBalanceHidden}
                          />{" "}
                          ({formatPercent(gainPercent)}) {selectedIntervalDesc}
                        </>
                      )}
                    </p>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-0">
              {filteredChartData.length > 0 ? (
                <>
                  <HistoryChart data={filteredChartData} />
                  <IntervalSelector
                    onIntervalSelect={handleIntervalSelect}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 transform"
                    defaultValue="ALL"
                    intervalLabels={intervalLabels}
                    intervalButtonLabels={intervalButtonLabels}
                  />
                </>
              ) : (
                <div className="flex h-[200px] items-center justify-center">
                  <EmptyPlaceholder
                    icon={<Icons.Activity className="text-muted-foreground h-8 w-8" />}
                    title={t("asset.alternative.chart_empty_title")}
                    description={t("asset.alternative.chart_empty_desc")}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Detail card */}
          <AlternativeAssetDetailCard
            holding={holding}
            linkedAsset={linkedAsset}
            netEquity={isLinkableAsset ? (netEquity ?? marketValue) : null}
            hasLinkedLiabilities={linkedLiabilities.length > 0}
            linkedLiabilities={isLinkableAsset ? linkedLiabilities : []}
            isLiability={isLiability}
            className="col-span-1"
          />
        </div>

        {/* Second row: About section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold">{t("asset.alternative.about")}</h3>

          {/* Kind and subtype badges */}
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const kind = holding.kind.toLowerCase();
              const kindConfig =
                kind in kindBadgeConfig
                  ? kindBadgeConfig[kind as keyof typeof kindBadgeConfig]
                  : kindBadgeConfig.other;
              const subtypeLabel = getSubtypeLabel(kind, holding.metadata || {}, t);

              return (
                <>
                  <Badge
                    variant="secondary"
                    className="gap-1.5"
                    style={{
                      backgroundColor: `${kindConfig.color}15`,
                      color: kindConfig.color,
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: kindConfig.color }}
                    />
                    {kindConfig.label}
                  </Badge>
                  {subtypeLabel && (
                    <Badge
                      variant="secondary"
                      className="gap-1.5"
                      style={{
                        backgroundColor: `${kindConfig.color}10`,
                        color: kindConfig.color,
                      }}
                    >
                      {subtypeLabel}
                    </Badge>
                  )}
                </>
              );
            })()}
          </div>

          {/* Notes */}
          <p className="text-muted-foreground text-sm">
            {holding.notes || assetProfile?.notes || t("asset.alternative.no_notes")}
          </p>
        </div>
      </div>
    );
  }

  // History tab
  return (
    <ValueHistoryDataGrid
      data={quoteHistory}
      currency={holding.currency}
      isLiability={isLiability}
      onSaveQuote={(quote: Quote) => saveQuoteMutation.mutate(quote)}
      onDeleteQuote={(id: string) => deleteQuoteMutation.mutate(id)}
    />
  );
};

// Type-specific subtype labels (fallbacks for t(..., { defaultValue }))
const PROPERTY_TYPE_LABELS: Record<string, string> = {
  residence: "Primary Residence",
  rental: "Rental Property",
  land: "Land",
  commercial: "Commercial",
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  car: "Car",
  motorcycle: "Motorcycle",
  boat: "Boat",
  rv: "RV",
  aircraft: "Aircraft",
};

const COLLECTIBLE_TYPE_LABELS: Record<string, string> = {
  art: "Art",
  wine: "Wine",
  watch: "Watch",
  jewelry: "Jewelry",
  memorabilia: "Memorabilia",
};

const METAL_TYPE_LABELS: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
};

const WEIGHT_UNIT_LABELS: Record<string, string> = {
  oz: "Troy Ounce",
  g: "Gram",
  kg: "Kilogram",
};

function weightUnitLabel(unit: string | undefined, t: TFunction): string {
  if (!unit) return "";
  return t(`asset.alternative.weight.${unit}`, {
    defaultValue: WEIGHT_UNIT_LABELS[unit] ?? unit,
  });
}

interface AlternativeAssetDetailCardProps {
  holding: AlternativeAssetHolding;
  linkedAsset?: AlternativeAssetHolding;
  netEquity: number | null;
  hasLinkedLiabilities: boolean;
  linkedLiabilities: AlternativeAssetHolding[];
  className?: string;
  isLiability?: boolean;
}

/**
 * Get subtype label from metadata based on asset kind.
 * Checks both the unified 'sub_type' field and legacy type-specific fields.
 */
function getSubtypeLabel(
  kind: string,
  metadata: Record<string, unknown>,
  t: TFunction,
): string | null {
  // First check the unified sub_type field (used by quick-add modal)
  const subType = metadata.sub_type as string | undefined;

  switch (kind) {
    case "property": {
      const propertyType = subType || (metadata.property_type as string | undefined);
      return propertyType
        ? t(`asset.alternative.subtype.property.${propertyType}`, {
            defaultValue: PROPERTY_TYPE_LABELS[propertyType] ?? propertyType,
          })
        : null;
    }
    case "vehicle": {
      const vehicleType = subType || (metadata.vehicle_type as string | undefined);
      return vehicleType
        ? t(`asset.alternative.subtype.vehicle.${vehicleType}`, {
            defaultValue: VEHICLE_TYPE_LABELS[vehicleType] ?? vehicleType,
          })
        : null;
    }
    case "collectible": {
      const collectibleType = subType || (metadata.collectible_type as string | undefined);
      return collectibleType
        ? t(`asset.alternative.subtype.collectible.${collectibleType}`, {
            defaultValue: COLLECTIBLE_TYPE_LABELS[collectibleType] ?? collectibleType,
          })
        : null;
    }
    case "precious": {
      const metalType = subType || (metadata.metal_type as string | undefined);
      return metalType
        ? t(`asset.alternative.subtype.precious.${metalType}`, {
            defaultValue: METAL_TYPE_LABELS[metalType] ?? metalType,
          })
        : null;
    }
    case "liability": {
      const liabilityType = subType || (metadata.liability_type as string | undefined);
      return liabilityType
        ? t(`asset.alternative.subtype.liability.${liabilityType}`, {
            defaultValue: t(`holdings.liability_type.${liabilityType}`, {
              defaultValue: liabilityType,
            }),
          })
        : null;
    }
    default:
      return null;
  }
}

/**
 * Detail card for alternative assets showing:
 * - Net equity in header (for property/vehicle)
 * - Amount paid in header (for liabilities)
 * - Purchase info and last valued date
 * - Type-specific metadata
 */
const AlternativeAssetDetailCard: React.FC<AlternativeAssetDetailCardProps> = ({
  holding,
  linkedAsset,
  netEquity,
  hasLinkedLiabilities,
  linkedLiabilities,
  isLiability,
  className,
}) => {
  const { t } = useTranslation();
  const { isBalanceHidden } = useBalancePrivacy();

  const metadata = holding.metadata || {};
  const kind = holding.kind.toLowerCase();

  // Build detail rows based on asset type
  const detailRows = getDetailRows(kind, metadata, holding, isBalanceHidden, t);

  // Calculate liability progress
  const liabilityProgress = useMemo(() => {
    if (!isLiability) return null;

    const currentBalance = Math.abs(parseFloat(holding.marketValue));
    // Check both new field (original_amount) and legacy field (purchase_price) for backwards compatibility
    const origAmountStr = (metadata.original_amount ?? metadata.purchase_price) as
      | string
      | undefined;
    const originalAmount = origAmountStr ? parseFloat(origAmountStr) : null;

    if (!originalAmount || originalAmount <= 0) {
      return { amountPaid: null, percentPaid: null, originalAmount: null, currentBalance };
    }

    const amountPaid = originalAmount - currentBalance;
    const percentPaid = amountPaid / originalAmount;

    return { amountPaid, percentPaid, originalAmount, currentBalance };
  }, [isLiability, holding.marketValue, metadata.original_amount, metadata.purchase_price]);

  // Determine if we should show a header with value info
  const showNetEquityHeader = netEquity !== null;
  const showLiabilityHeader = isLiability && liabilityProgress;

  return (
    <Card className={className}>
      {/* Header: Net Equity for property/vehicle */}
      {showNetEquityHeader && (
        <CardHeader className="flex flex-row items-center justify-between pb-0">
          <CardTitle className="flex w-full justify-between text-lg font-bold">
            <div>
              <div className="text-muted-foreground text-sm font-normal">
                {t("asset.alternative.net_equity")}
              </div>
              {!hasLinkedLiabilities && (
                <div className="text-muted-foreground text-xs font-normal">
                  {t("asset.alternative.no_liabilities")}
                </div>
              )}
            </div>
            <div>
              <div
                className={`text-xl font-extrabold ${netEquity >= 0 ? "text-success" : "text-destructive"}`}
              >
                <AmountDisplay
                  value={netEquity}
                  currency={holding.currency}
                  isHidden={isBalanceHidden}
                />
              </div>
              <div className="text-muted-foreground text-right text-sm font-normal">
                {holding.currency}
              </div>
            </div>
          </CardTitle>
        </CardHeader>
      )}

      {/* Header: Amount Paid for liabilities */}
      {showLiabilityHeader && liabilityProgress.amountPaid !== null && (
        <CardHeader className="flex flex-row items-center justify-between pb-0">
          <CardTitle className="flex w-full justify-between text-lg font-bold">
            <div>
              <div className="text-muted-foreground text-sm font-normal">
                {t("asset.alternative.amount_paid")}
              </div>
              {liabilityProgress.percentPaid !== null && (
                <div className="text-muted-foreground text-xs font-normal">
                  {t("asset.alternative.percent_of_original", {
                    percent: formatPercent(liabilityProgress.percentPaid),
                  })}
                </div>
              )}
            </div>
            <div>
              <div
                className={`text-xl font-extrabold ${liabilityProgress.amountPaid >= 0 ? "text-success" : "text-destructive"}`}
              >
                <AmountDisplay
                  value={liabilityProgress.amountPaid}
                  currency={holding.currency}
                  isHidden={isBalanceHidden}
                />
              </div>
              <div className="text-muted-foreground text-right text-sm font-normal">
                {holding.currency}
              </div>
            </div>
          </CardTitle>
        </CardHeader>
      )}

      {/* Fallback header for assets without special headers */}
      {!showNetEquityHeader && !showLiabilityHeader && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("asset.alternative.details_heading")}</CardTitle>
        </CardHeader>
      )}

      <CardContent>
        {(showNetEquityHeader || showLiabilityHeader) && <Separator className="my-3" />}
        {/* Summary rows - skip purchase info for liabilities (shown in detail rows) */}
        <div className="space-y-4 text-sm">
          {!isLiability && holding.purchasePrice && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("asset.alternative.purchase_price")}</span>
              <span className="font-medium">
                <AmountDisplay
                  value={parseFloat(holding.purchasePrice)}
                  currency={holding.currency}
                  isHidden={isBalanceHidden}
                />
              </span>
            </div>
          )}

          {!isLiability && holding.purchaseDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("asset.alternative.purchase_date")}</span>
              <span className="font-medium">
                {format(parseLocalDate(holding.purchaseDate), "MMM d, yyyy")}
              </span>
            </div>
          )}

          {holding.valuationDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("asset.alternative.last_updated")}</span>
              <span className="font-medium">
                {format(parseLocalDate(holding.valuationDate), "MMM d, yyyy")}
              </span>
            </div>
          )}
        </div>

        {/* Type-specific details (continued without separator) */}
        {detailRows.length > 0 && (
          <div className="mt-4 space-y-4 text-sm">
            {detailRows.map((row, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-right font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Linked Asset (for liabilities) */}
        {isLiability && linkedAsset && (
          <>
            <Separator className="my-4" />
            <LinkedAssetSection
              assetId={linkedAsset.id}
              assetName={linkedAsset.name}
              assetKind={linkedAsset.kind}
              assetValue={linkedAsset.marketValue}
              currency={linkedAsset.currency}
            />
          </>
        )}

        {/* Linked Liabilities (for property/vehicle) */}
        {linkedLiabilities.length > 0 && (
          <>
            <Separator className="my-4" />
            <LinkedLiabilitiesSection liabilities={linkedLiabilities} />
          </>
        )}
      </CardContent>
    </Card>
  );
};

interface DetailRow {
  label: string;
  value: React.ReactNode;
}

function getDetailRows(
  kind: string,
  metadata: Record<string, unknown>,
  holding: AlternativeAssetHolding,
  isBalanceHidden: boolean,
  t: TFunction,
): DetailRow[] {
  const rows: DetailRow[] = [];

  switch (kind) {
    case "property": {
      // Address (type is shown in badge)
      const address = metadata.address as string | undefined;
      if (address) {
        rows.push({ label: t("asset.alternative.row.address"), value: address });
      }
      break;
    }

    case "vehicle": {
      // Make/Model (type is shown in badge)
      const description = metadata.description as string | undefined;
      if (description) {
        rows.push({ label: t("asset.alternative.row.make_model"), value: description });
      }
      break;
    }

    case "collectible": {
      // Description (type is shown in badge)
      const description = metadata.description as string | undefined;
      if (description) {
        rows.push({ label: t("asset.alternative.row.description"), value: description });
      }
      break;
    }

    case "precious": {
      // Quantity and unit
      const quantity = metadata.quantity as string | number | undefined;
      const unit = metadata.unit as string | undefined;
      if (quantity) {
        const unitLabel = weightUnitLabel(unit, t);
        rows.push({
          label: t("asset.alternative.row.quantity"),
          value: `${quantity} ${unitLabel}`.trim(),
        });
      }
      // Purchase price per unit
      const pricePerUnit = metadata.purchase_price_per_unit as string | undefined;
      if (pricePerUnit) {
        rows.push({
          label: t("asset.alternative.row.purchase_price_unit"),
          value: (
            <AmountDisplay
              value={parseFloat(pricePerUnit)}
              currency={holding.currency}
              isHidden={isBalanceHidden}
            />
          ),
        });
      }
      // Description
      const description = metadata.description as string | undefined;
      if (description) {
        rows.push({ label: t("asset.alternative.row.description"), value: description });
      }
      break;
    }

    case "liability": {
      // Current balance (shown prominently for liabilities)
      const currentBalance = Math.abs(parseFloat(holding.marketValue));
      rows.push({
        label: t("asset.alternative.row.current_balance"),
        value: (
          <AmountDisplay
            value={currentBalance}
            currency={holding.currency}
            isHidden={isBalanceHidden}
          />
        ),
      });

      // Original amount (check both new and legacy field names)
      const originalAmount = (metadata.original_amount ?? metadata.purchase_price) as
        | string
        | undefined;
      if (originalAmount) {
        rows.push({
          label: t("asset.alternative.row.original_amount"),
          value: (
            <AmountDisplay
              value={parseFloat(originalAmount)}
              currency={holding.currency}
              isHidden={isBalanceHidden}
            />
          ),
        });
      }

      // Interest rate
      const interestRate = metadata.interest_rate as string | undefined;
      if (interestRate) {
        rows.push({
          label: t("asset.alternative.row.interest_rate"),
          value: `${interestRate}%`,
        });
      }

      // Note: Linked asset is shown in its own section with LinkedAssetSection

      // Origination date (check both new and legacy field names)
      const originationDate = (metadata.origination_date ?? metadata.purchase_date) as
        | string
        | undefined;
      if (originationDate) {
        rows.push({
          label: t("asset.alternative.row.origination_date"),
          value: format(parseLocalDate(originationDate), "MMM d, yyyy"),
        });
      }
      break;
    }

    case "other":
    default: {
      const description = metadata.description as string | undefined;
      if (description) {
        rows.push({ label: t("asset.alternative.row.description"), value: description });
      }
      break;
    }
  }

  return rows;
}

interface AlternativeAssetActionsProps {
  holding: AlternativeAssetHolding | null | undefined;
  assetProfile: Asset | null | undefined;
  allHoldings: AlternativeAssetHolding[];
  onNavigateBack: () => void;
}

/**
 * Hook that provides alternative asset actions and modals.
 */
export function useAlternativeAssetActions({
  holding,
  allHoldings,
  onNavigateBack,
}: AlternativeAssetActionsProps) {
  const { t } = useTranslation();
  // Modal state
  const [updateValuationOpen, setUpdateValuationOpen] = useState(false);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);
  const [addLiabilityOpen, setAddLiabilityOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Mutations
  const { deleteMutation, updateMetadataMutation, linkLiabilityMutation, unlinkLiabilityMutation } =
    useAlternativeAssetMutations({
      onDeleteSuccess: onNavigateBack,
    });

  // Fetch linked liabilities for property/vehicle
  const holdingKind = holding?.kind?.toLowerCase() ?? "";
  const isLinkableAsset = holdingKind === "property" || holdingKind === "vehicle";
  const { data: linkedLiabilities = [] } = useLinkedLiabilities({
    assetId: holding?.id ?? "",
    enabled: isLinkableAsset && !!holding?.id,
  });

  // Build linkable assets for liability linking (properties and vehicles)
  const linkableAssets = useMemo(() => {
    return allHoldings.filter(
      (h) => h.kind.toLowerCase() === "property" || h.kind.toLowerCase() === "vehicle",
    );
  }, [allHoldings]);

  // Find linked asset name for liabilities
  const linkedAssetName = useMemo(() => {
    if (!holding?.linkedAssetId) return undefined;
    const linkedAsset = allHoldings.find((h) => h.id === holding.linkedAssetId);
    return linkedAsset?.name;
  }, [holding?.linkedAssetId, allHoldings]);

  // Get available (unlinked) mortgages for property linking
  const availableMortgages = useMemo(() => {
    const holdingId = holding?.id ?? "";
    return allHoldings.filter(
      (h) => h.kind.toLowerCase() === "liability" && !h.linkedAssetId && h.id !== holdingId,
    );
  }, [allHoldings, holding?.id]);

  // Handle edit sheet save
  const handleEditSave = async (
    _assetId: string,
    metadata: Record<string, string>,
    name?: string,
    notes?: string | null,
  ) => {
    if (!holding) return;
    await updateMetadataMutation.mutateAsync({
      assetId: holding.id,
      metadata,
      name,
      notes,
    });
  };

  // Handle mortgage linking
  const handleLinkMortgage = async (mortgageId: string) => {
    if (!holding) return;
    await linkLiabilityMutation.mutateAsync({
      liabilityId: mortgageId,
      request: { targetAssetId: holding.id },
    });
  };

  // Handle mortgage unlinking
  const handleUnlinkMortgage = async (mortgageId: string) => {
    await unlinkLiabilityMutation.mutateAsync(mortgageId);
  };

  // Handle delete
  const handleDelete = () => {
    if (!holding) return;
    deleteMutation.mutate(holding.id);
  };

  // Convert holding to edit sheet asset format (only if holding exists)
  const editSheetAsset: AssetDetailsSheetAsset | null = holding
    ? {
        id: holding.id,
        name: holding.name,
        kind: holding.kind.toUpperCase() as AlternativeAssetKind,
        currency: holding.currency,
        metadata: holding.metadata,
        notes: holding.notes,
      }
    : null;

  // Render modals (only if holding exists)
  const modals = holding ? (
    <>
      {/* Update Valuation Modal */}
      <UpdateValuationModal
        open={updateValuationOpen}
        onOpenChange={setUpdateValuationOpen}
        assetId={holding.id}
        assetName={holding.name}
        currentValue={holding.marketValue}
        lastUpdatedDate={holding.valuationDate}
        currency={holding.currency}
      />

      {/* Edit Details Sheet */}
      <AssetDetailsSheet
        open={editDetailsOpen}
        onOpenChange={setEditDetailsOpen}
        asset={editSheetAsset}
        onSave={handleEditSave}
        linkedAssetName={linkedAssetName}
        linkableAssets={linkableAssets.map((a) => ({ id: a.id, name: a.name }))}
        linkedLiabilities={linkedLiabilities.map((l) => ({
          id: l.id,
          name: l.name,
          balance: l.marketValue,
        }))}
        availableMortgages={availableMortgages.map((m) => ({
          id: m.id,
          name: m.name,
          balance: m.marketValue,
        }))}
        onLinkMortgage={handleLinkMortgage}
        onUnlinkMortgage={handleUnlinkMortgage}
        isSaving={updateMetadataMutation.isPending}
      />

      {/* Add Liability Modal */}
      <AlternativeAssetQuickAddModal
        open={addLiabilityOpen}
        onOpenChange={setAddLiabilityOpen}
        defaultKind={AlternativeAssetKind.LIABILITY}
        linkedAssetId={holding.id}
        defaultLiabilityType="mortgage"
        defaultName={`${holding.name} Mortgage`}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("asset.alternative.delete_title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span>
                <Trans
                  i18nKey="asset.alternative.delete_description"
                  values={{ name: holding.name }}
                  components={{ highlight: <span className="font-semibold" /> }}
                />
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("settings.shared.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  {t("asset.alternative.deleting")}
                </>
              ) : (
                t("settings.shared.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  ) : null;

  return {
    openUpdateValuation: () => setUpdateValuationOpen(true),
    openEditDetails: () => setEditDetailsOpen(true),
    openAddLiability: () => setAddLiabilityOpen(true),
    openDeleteConfirm: () => setDeleteConfirmOpen(true),
    modals,
    isLinkableAsset,
  };
}

export default AlternativeAssetContent;
