import { EmptyPlaceholder } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useMemo, useState, useCallback } from "react";

import { AccountSelector } from "@/components/account-selector";
import { useHoldings } from "@/hooks/use-holdings";
import { usePortfolioAllocations } from "@/hooks/use-portfolio-allocations";
import { PORTFOLIO_ACCOUNT_ID, isAlternativeAssetId } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account, TaxonomyAllocation } from "@/lib/types";
import { useNavigate } from "react-router-dom";
import { AllocationDetailSheet } from "./components/allocation-detail-sheet";
import { CashHoldingsWidget } from "./components/cash-holdings-widget";
import { CompactAllocationStrip } from "./components/compact-allocation-strip";
import { PortfolioComposition } from "./components/composition-chart";
import { HoldingCurrencyChart } from "./components/currency-chart";
import { DrillableAccountChart } from "./components/drillable-account-chart";
import { DrillableDonutChart } from "./components/drillable-donut-chart";
import { SectorsChart } from "./components/sectors-chart";
import { SegmentedAllocationBar } from "./components/segmented-allocation-bar";

export const HoldingsInsightsPage = () => {
  const navigate = useNavigate();
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: "All Portfolio",
    accountType: "PORTFOLIO" as unknown as Account["accountType"],
    balance: 0,
    currency: baseCurrency,
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  const accountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;
  const { holdings, isLoading: holdingsLoading } = useHoldings(accountId);
  const { allocations, isLoading: allocationsLoading } = usePortfolioAllocations(accountId);

  const isLoading = holdingsLoading || allocationsLoading;

  // State for allocation detail sheet
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedAllocation, setSelectedAllocation] = useState<TaxonomyAllocation | undefined>(
    undefined,
  );
  const [initialCategoryId, setInitialCategoryId] = useState<string | null>(null);

  // Map filter types to allocations
  const getAllocationForType = useCallback(
    (type: string): TaxonomyAllocation | undefined => {
      switch (type) {
        case "class":
          return allocations?.assetClasses;
        case "sector":
          return allocations?.sectors;
        case "country":
          return allocations?.regions;
        case "risk":
          return allocations?.riskCategory;
        case "securityType":
          return allocations?.securityTypes;
        default:
          // Check custom groups
          if (type === "custom" && allocations?.customGroups?.length) {
            return allocations.customGroups[0];
          }
          return undefined;
      }
    },
    [allocations],
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

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

  const { cashHoldings, nonCashHoldings } = useMemo(() => {
    const cash = holdings?.filter((holding) => holding.holdingType?.toLowerCase() === "cash") ?? [];
    const nonCash =
      holdings?.filter((holding) => {
        if (holding.holdingType?.toLowerCase() === "cash") return false;
        const symbol = holding.instrument?.symbol ?? holding.id;
        if (isAlternativeAssetId(symbol)) return false;
        return true;
      }) ?? [];

    return { cashHoldings: cash, nonCashHoldings: nonCash };
  }, [holdings]);

  const hasNoHoldingsAtAll = !isLoading && (!holdings || holdings.length === 0);

  const hasRiskAllocations =
    allocations?.riskCategory && allocations.riskCategory.categories.length > 0;

  const hasCustomGroups =
    allocations?.customGroups?.some(
      (taxonomy) =>
        taxonomy.categories.length > 0 &&
        taxonomy.categories.some(
          (cat) => cat.value > 0 && cat.categoryName.toLowerCase() !== "unknown",
        ),
    ) ?? false;

  const renderEmptyState = () => (
    <div className="flex items-center justify-center py-16">
      <EmptyPlaceholder
        icon={<Icons.TrendingUp className="text-muted-foreground h-10 w-10" />}
        title="No holdings yet"
        description="Get started by adding your first transaction or quickly import your existing holdings from a CSV file."
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button size="default" onClick={() => navigate("/activities/manage")}>
            <Icons.Plus className="mr-2 h-4 w-4" />
            Add Transaction
          </Button>
          <Button size="default" variant="outline" onClick={() => navigate("/import")}>
            <Icons.Import className="mr-2 h-4 w-4" />
            Import from CSV
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
              handleChartSectionClick("currency", currencyName, `Holdings in ${currencyName}`)
            }
          />

          <DrillableAccountChart isLoading={isLoading} />

          <DrillableDonutChart
            title="Classes"
            allocation={allocations?.assetClasses}
            baseCurrency={baseCurrency}
            isLoading={isLoading}
            onCategoryClick={(categoryId, categoryName) =>
              handleChartSectionClick(
                "class",
                categoryName,
                `Asset Class: ${categoryName}`,
                categoryId,
              )
            }
            onCardClick={() => openAllocationSheet(allocations?.assetClasses)}
          />

          <DrillableDonutChart
            title="Regions"
            allocation={allocations?.regions}
            baseCurrency={baseCurrency}
            isLoading={isLoading}
            onCategoryClick={(categoryId, categoryName) =>
              handleChartSectionClick(
                "country",
                categoryName,
                `Holdings in ${categoryName}`,
                categoryId,
              )
            }
            onCardClick={() => openAllocationSheet(allocations?.regions)}
          />
        </div>

        {/* Row 3: Composition (col-span-3) + Right column (Security Type, Risk Profile, Sectors) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="col-span-1 lg:col-span-3">
            <PortfolioComposition holdings={nonCashHoldings ?? []} isLoading={isLoading} />
          </div>

          <div className="col-span-1 space-y-4">
            <CompactAllocationStrip
              title="Security Types"
              allocation={allocations?.securityTypes}
              baseCurrency={baseCurrency}
              isLoading={isLoading}
              variant="security-types"
              onSegmentClick={(categoryId, categoryName) =>
                handleChartSectionClick(
                  "securityType",
                  categoryName,
                  `Type: ${categoryName}`,
                  categoryId,
                )
              }
            />

            {hasRiskAllocations && (
              <CompactAllocationStrip
                title="Risk Composition"
                allocation={allocations?.riskCategory}
                baseCurrency={baseCurrency}
                isLoading={isLoading}
                variant="risk-composition"
                onSegmentClick={(categoryId, categoryName) =>
                  handleChartSectionClick(
                    "risk",
                    categoryName,
                    `Risk Category: ${categoryName}`,
                    categoryId,
                  )
                }
              />
            )}

            <SectorsChart
              allocation={allocations?.sectors}
              baseCurrency={baseCurrency}
              isLoading={isLoading}
              onSectorSectionClick={(categoryId, categoryName) =>
                handleChartSectionClick(
                  "sector",
                  categoryName,
                  `Holdings in Sector: ${categoryName}`,
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
              {allocations?.customGroups?.map(
                (taxonomy) =>
                  taxonomy.categories.length > 0 &&
                  taxonomy.categories.some(
                    (cat) => cat.value > 0 && cat.categoryName.toLowerCase() !== "unknown",
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
      {/* Account selector - fixed position in header area */}
      <div className="pointer-events-auto fixed right-2 top-4 z-20 hidden md:block lg:right-4">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

      <div className="mb-4 flex justify-end md:hidden">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

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
