import { EmptyPlaceholder } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useCallback, useMemo, useState } from "react";

import { useHoldings } from "@/hooks/use-holdings";
import { usePortfolioAllocations } from "@/hooks/use-portfolio-allocations";
import { PORTFOLIO_ACCOUNT_ID, isAlternativeAssetKind, type AssetKind } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { localizeAllocationCategoryName } from "@/lib/taxonomy-i18n";
import type { TaxonomyAllocation } from "@/lib/types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AllocationDetailSheet } from "./components/allocation-detail-sheet";
import { CashHoldingsWidget } from "./components/cash-holdings-widget";
import { CompactAllocationStrip } from "./components/compact-allocation-strip";
import { PortfolioComposition } from "./components/composition-chart";
import { HoldingCurrencyChart } from "./components/currency-chart";
import { DrillableAccountChart } from "./components/drillable-account-chart";
import { DrillableDonutChart } from "./components/drillable-donut-chart";
import { SectorsChart } from "./components/sectors-chart";
import { SegmentedAllocationBar } from "./components/segmented-allocation-bar";

interface HoldingsInsightsPageProps {
  accountId?: string;
}

function isUnknownAllocationCategory(categoryId: string): boolean {
  const normalized = (categoryId ?? "").toUpperCase();
  return normalized === "UNKNOWN" || normalized === "__UNKNOWN__";
}

export const HoldingsInsightsPage = ({ accountId: accountIdProp }: HoldingsInsightsPageProps) => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const accountId = accountIdProp ?? PORTFOLIO_ACCOUNT_ID;
  const { holdings, isLoading: holdingsLoading } = useHoldings(accountId);
  const { allocations, isLoading: allocationsLoading } = usePortfolioAllocations(accountId);

  const isLoading = holdingsLoading || allocationsLoading;

  // State for allocation detail sheet
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedAllocation, setSelectedAllocation] = useState<TaxonomyAllocation | undefined>(
    undefined,
  );
  const [initialCategoryId, setInitialCategoryId] = useState<string | null>(null);

  const { cashHoldings, nonCashHoldings } = useMemo(() => {
    const EPSILON = 1e-8;
    const cash =
      holdings?.filter((holding) => {
        if (holding.holdingType?.toLowerCase() !== "cash") return false;
        const cashValue = Math.abs(holding.marketValue?.base ?? holding.marketValue?.local ?? 0);
        return cashValue > EPSILON;
      }) ?? [];
    const nonCash =
      holdings?.filter((holding) => {
        if (holding.holdingType?.toLowerCase() === "cash") return false;
        if (holding.assetKind && isAlternativeAssetKind(holding.assetKind as AssetKind))
          return false;
        const quantity = Math.abs(holding.quantity ?? 0);
        const marketValue = Math.abs(holding.marketValue?.base ?? holding.marketValue?.local ?? 0);
        return quantity > EPSILON || marketValue > EPSILON;
      }) ?? [];

    return { cashHoldings: cash, nonCashHoldings: nonCash };
  }, [holdings]);

  const hasNoHoldingsAtAll = !isLoading && cashHoldings.length === 0 && nonCashHoldings.length === 0;

  const hasRiskAllocations =
    allocations?.riskCategory && allocations.riskCategory.categories.length > 0;

  const localizeAllocation = useCallback(
    (allocation: TaxonomyAllocation | undefined): TaxonomyAllocation | undefined => {
      if (!allocation) return allocation;
      return {
        ...allocation,
        categories: allocation.categories.map((category) => ({
          ...category,
          categoryName: localizeAllocationCategoryName(
            t,
            allocation.taxonomyId,
            category.categoryName,
          ),
          children: category.children?.map((child) => ({
            ...child,
            categoryName: localizeAllocationCategoryName(
              t,
              allocation.taxonomyId,
              child.categoryName,
            ),
          })),
        })),
      };
    },
    [t],
  );

  const localizedAllocations = useMemo(
    () => ({
      assetClasses: localizeAllocation(allocations?.assetClasses),
      sectors: localizeAllocation(allocations?.sectors),
      regions: localizeAllocation(allocations?.regions),
      riskCategory: localizeAllocation(allocations?.riskCategory),
      securityTypes: localizeAllocation(allocations?.securityTypes),
      customGroups: allocations?.customGroups?.map((taxonomy) => localizeAllocation(taxonomy)!),
    }),
    [
      allocations?.assetClasses,
      allocations?.customGroups,
      allocations?.regions,
      allocations?.riskCategory,
      allocations?.sectors,
      allocations?.securityTypes,
      localizeAllocation,
    ],
  );

  const hasCustomGroups =
    localizedAllocations.customGroups?.some(
      (taxonomy) =>
        taxonomy.categories.length > 0 &&
        taxonomy.categories.some(
          (cat) => cat.value > 0 && !isUnknownAllocationCategory(cat.categoryId),
        ),
    ) ?? false;

  // Map filter types to allocations
  const getAllocationForType = useCallback(
    (type: string): TaxonomyAllocation | undefined => {
      switch (type) {
        case "class":
          return localizedAllocations.assetClasses;
        case "sector":
          return localizedAllocations.sectors;
        case "country":
          return localizedAllocations.regions;
        case "risk":
          return localizedAllocations.riskCategory;
        case "securityType":
          return localizedAllocations.securityTypes;
        default:
          // Check custom groups
          if (type === "custom" && localizedAllocations.customGroups?.length) {
            return localizedAllocations.customGroups[0];
          }
          return undefined;
      }
    },
    [localizedAllocations],
  );

  // Handle chart section click - opens sheet with clicked category pre-selected
  const handleChartSectionClick = useCallback(
    (type: string, _name: string, _title?: string, categoryId?: string) => {
      const allocation = getAllocationForType(type);
      if (allocation) {
        setSelectedAllocation(allocation);
        setInitialCategoryId(categoryId ?? null);
        setIsSheetOpen(true);
      }
    },
    [getAllocationForType],
  );

  // Handle card click - opens sheet with first category selected
  const openAllocationSheet = useCallback((allocation: TaxonomyAllocation | undefined) => {
    if (allocation) {
      setSelectedAllocation(allocation);
      setInitialCategoryId(null); // Will default to first category
      setIsSheetOpen(true);
    }
  }, []);

  const renderEmptyState = () => (
    <div className="flex items-center justify-center py-16">
      <EmptyPlaceholder
        icon={<Icons.TrendingUp className="text-muted-foreground h-10 w-10" />}
        title={t("holdings.insights.empty_title")}
        description={t("holdings.insights.empty_description")}
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button size="default" onClick={() => navigate("/activities/manage")}>
            <Icons.Plus className="mr-2 h-4 w-4" />
            {t("holdings.insights.add_transaction")}
          </Button>
          <Button size="default" variant="outline" onClick={() => navigate("/import")}>
            <Icons.Import className="mr-2 h-4 w-4" />
            {t("holdings.insights.import_csv")}
          </Button>
        </div>
      </EmptyPlaceholder>
    </div>
  );

  const renderAnalyticsView = () => {
    if (hasNoHoldingsAtAll) {
      return renderEmptyState();
    }

    return (
      <div className="space-y-4">
        {/* Row 1: Cash Balance (full width) */}
        <CashHoldingsWidget cashHoldings={cashHoldings ?? []} isLoading={isLoading} />

        {/* Row 2: 4 semi-donut charts */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <HoldingCurrencyChart
            holdings={[...cashHoldings, ...nonCashHoldings]}
            baseCurrency={baseCurrency}
            isLoading={isLoading}
            onCurrencySectionClick={(currencyName) =>
              handleChartSectionClick(
                "currency",
                currencyName,
                t("holdings.allocation_sheet.holdings_in") + " " + currencyName,
              )
            }
          />

          <DrillableAccountChart isLoading={isLoading} />

          <DrillableDonutChart
            title={t("holdings.insights.title_classes")}
            allocation={localizedAllocations.assetClasses}
            baseCurrency={baseCurrency}
            isLoading={isLoading}
            onCategoryClick={(categoryId, categoryName) =>
              handleChartSectionClick(
                "class",
                categoryName,
                `${t("holdings.insights.title_classes")}: ${categoryName}`,
                categoryId,
              )
            }
            onCardClick={() => openAllocationSheet(localizedAllocations.assetClasses)}
          />

          <DrillableDonutChart
            title={t("holdings.insights.title_regions")}
            allocation={localizedAllocations.regions}
            baseCurrency={baseCurrency}
            isLoading={isLoading}
            onCategoryClick={(categoryId, categoryName) =>
              handleChartSectionClick(
                "country",
                categoryName,
                t("holdings.allocation_sheet.holdings_in") + " " + categoryName,
                categoryId,
              )
            }
            onCardClick={() => openAllocationSheet(localizedAllocations.regions)}
          />
        </div>

        {/* Row 3: Composition (col-span-3) + Right column (Security Type, Risk Profile, Sectors) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="col-span-1 lg:col-span-3">
            <PortfolioComposition holdings={nonCashHoldings ?? []} isLoading={isLoading} />
          </div>

          <div className="col-span-1 space-y-4">
            {hasRiskAllocations && (
              <CompactAllocationStrip
                title={t("holdings.insights.risk_composition")}
                allocation={localizedAllocations.riskCategory}
                baseCurrency={baseCurrency}
                isLoading={isLoading}
                variant="risk-composition"
                onSegmentClick={(categoryId, categoryName) =>
                  handleChartSectionClick(
                    "risk",
                    categoryName,
                `${t("holdings.insights.risk_composition")}: ${categoryName}`,
                    categoryId,
                  )
                }
              />
            )}

            <CompactAllocationStrip
              title={t("holdings.insights.security_types")}
              allocation={localizedAllocations.securityTypes}
              baseCurrency={baseCurrency}
              isLoading={isLoading}
              variant="security-types"
              onSegmentClick={(categoryId, categoryName) =>
                handleChartSectionClick(
                  "securityType",
                  categoryName,
                `${t("holdings.insights.security_types")}: ${categoryName}`,
                  categoryId,
                )
              }
            />

            <SectorsChart
              allocation={localizedAllocations.sectors}
              baseCurrency={baseCurrency}
              isLoading={isLoading}
              onSectorSectionClick={(categoryId, categoryName) =>
                handleChartSectionClick(
                  "sector",
                  categoryName,
                t("holdings.widgets.sectors") + ": " + categoryName,
                  categoryId,
                )
              }
            />
          </div>
        </div>

        {/* Row 4: Custom Groups (under composition, col-span-3) */}
        {hasCustomGroups && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="col-span-1 space-y-4 lg:col-span-3">
              {localizedAllocations.customGroups?.map(
                (taxonomy) =>
                  taxonomy.categories.length > 0 &&
                  taxonomy.categories.some(
                    (cat) => cat.value > 0 && !isUnknownAllocationCategory(cat.categoryId),
                  ) && (
                    <SegmentedAllocationBar
                      key={taxonomy.taxonomyId}
                      title={taxonomy.taxonomyName}
                      allocation={taxonomy}
                      baseCurrency={baseCurrency}
                      isLoading={isLoading}
                      compact={true}
                      onSegmentClick={(categoryId, categoryName) =>
                        handleChartSectionClick(
                          "custom",
                          categoryName,
                          `${taxonomy.taxonomyName}: ${categoryName}`,
                          categoryId,
                        )
                      }
                    />
                  ),
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {renderAnalyticsView()}

      {/* Allocation Detail Sheet */}
      <AllocationDetailSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        allocation={selectedAllocation}
        accountId={accountId}
        baseCurrency={baseCurrency}
        initialCategoryId={initialCategoryId}
      />
    </>
  );
};

export default HoldingsInsightsPage;
