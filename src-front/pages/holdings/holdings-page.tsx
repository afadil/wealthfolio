import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { EmptyPlaceholder, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import { useCallback, useMemo, useState } from "react";

import { AccountSelector } from "@/components/account-selector";
import { useAccounts } from "@/hooks/use-accounts";
import { useHoldings } from "@/hooks/use-holdings";
import {
  useAlternativeHoldings,
  useDeleteAlternativeAsset,
} from "@/hooks/use-alternative-assets";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { PORTFOLIO_ACCOUNT_ID, HOLDING_CATEGORY_FILTERS, apiKindToAlternativeAssetKind } from "@/lib/constants";
import {
  Account,
  HoldingType,
  HoldingCategoryFilterId,
  AlternativeAssetHolding,
} from "@/lib/types";
import { useNavigate } from "react-router-dom";
import { HoldingsMobileFilterSheet } from "./components/holdings-mobile-filter-sheet";
import { HoldingsTable } from "./components/holdings-table";
import { HoldingsTableMobile } from "./components/holdings-table-mobile";
import { HoldingsCategoryFilter } from "./components/holdings-category-filter";
import { AlternativeHoldingsTable } from "./components/alternative-holdings-table";
import {
  AlternativeAssetQuickAddModal,
  AssetDetailsSheet,
  UpdateValuationModal,
  type AssetDetailsSheetAsset,
} from "@/features/alternative-assets";
import { updateAlternativeAssetMetadata } from "@/commands/alternative-assets";
import { ClassificationSheet } from "@/components/classification/classification-sheet";

export const HoldingsPage = () => {
  const navigate = useNavigate();
  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: "All Portfolio",
    accountType: "PORTFOLIO" as unknown as Account["accountType"],
    balance: 0,
    currency: "USD",
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  const { holdings, isLoading } = useHoldings(selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID);
  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const { data: alternativeHoldings, isLoading: isAlternativeHoldingsLoading } =
    useAlternativeHoldings();

  // Category filter state (persisted)
  const [categoryFilter, setCategoryFilter] = usePersistentState<HoldingCategoryFilterId>(
    "holdings-category-filter",
    "investments",
  );

  // Mobile filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isAlternativeAssetModalOpen, setIsAlternativeAssetModalOpen] = useState(false);
  const [sortBy, setSortBy] = usePersistentState<"symbol" | "marketValue">(
    "holdings-sort-by",
    "marketValue",
  );
  const [showTotalReturn, setShowTotalReturn] = usePersistentState<boolean>(
    "holdings-show-total-return",
    true,
  );

  // Alternative asset action state
  const [editAsset, setEditAsset] = useState<AssetDetailsSheetAsset | null>(null);
  const [updateValueAsset, setUpdateValueAsset] = useState<AlternativeAssetHolding | null>(null);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  // Delete mutation
  const { mutate: deleteAsset, isPending: isDeleting } = useDeleteAlternativeAsset();

  // Classification sheet state
  const [classifyAsset, setClassifyAsset] = useState<{id: string, symbol: string, name?: string} | null>(null);

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

  // Handler to convert AlternativeAssetHolding to AssetDetailsSheetAsset for editing
  const handleEditAsset = useCallback((holding: AlternativeAssetHolding) => {
    const assetForSheet: AssetDetailsSheetAsset = {
      id: holding.id,
      name: holding.name,
      kind: apiKindToAlternativeAssetKind(holding.kind),
      currency: holding.currency,
      metadata: holding.metadata as Record<string, unknown> | undefined,
    };
    setEditAsset(assetForSheet);
  }, []);

  // Handler to save asset details
  const handleSaveAssetDetails = useCallback(
    async (assetId: string, metadata: Record<string, string>) => {
      setIsSavingDetails(true);
      try {
        await updateAlternativeAssetMetadata(assetId, metadata);
      } finally {
        setIsSavingDetails(false);
      }
    },
    [],
  );

  // Handler to delete an asset
  const handleDeleteAsset = useCallback(
    (holding: AlternativeAssetHolding) => {
      deleteAsset(holding.id);
    },
    [deleteAsset],
  );

  // Handler to view value history for an asset
  const handleViewHistory = useCallback(
    (holding: AlternativeAssetHolding) => {
      // Navigate to asset profile page with history tab (use id for asset lookup)
      navigate(`/holdings/${encodeURIComponent(holding.id)}?tab=history`);
    },
    [navigate],
  );

  // Get the selected filter's allowed asset kinds
  const selectedFilter = useMemo(() => {
    return HOLDING_CATEGORY_FILTERS.find((f) => f.id === categoryFilter);
  }, [categoryFilter]);

  // Check if current tab is for alternative assets (Assets or Liabilities)
  const isAlternativeTab = categoryFilter === "assets" || categoryFilter === "liabilities";

  // Filter alternative holdings based on category
  const filteredAlternativeHoldings = useMemo(() => {
    if (!alternativeHoldings) return [];

    if (categoryFilter === "assets") {
      // Show non-liability alternative assets
      return alternativeHoldings.filter((h) => h.kind !== "liability");
    } else if (categoryFilter === "liabilities") {
      // Show only liabilities
      return alternativeHoldings.filter((h) => h.kind === "liability");
    }
    return [];
  }, [alternativeHoldings, categoryFilter]);

  // Process investment holdings with category filtering (for Investments tab)
  const { nonCashHoldings, filteredHoldings } = useMemo(() => {
    // Filter out cash holdings
    const nonCash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) ?? [];

    // Apply category filter using holding's assetKind field
    let filtered = nonCash;
    if (selectedFilter?.assetKinds) {
      const allowedKinds = selectedFilter.assetKinds as readonly string[];
      filtered = nonCash.filter((holding) => {
        return holding.assetKind && allowedKinds.includes(holding.assetKind);
      });
    }

    // Apply asset type filter (from mobile filter sheet)
    if (selectedTypes.length > 0) {
      filtered = filtered.filter(
        (holding) =>
          holding.instrument?.assetSubclass &&
          selectedTypes.includes(holding.instrument.assetSubclass),
      );
    }

    return { nonCashHoldings: nonCash, filteredHoldings: filtered };
  }, [holdings, selectedTypes, selectedFilter]);

  const hasActiveFilters = useMemo(() => {
    const hasAccountFilter = selectedAccount?.id !== PORTFOLIO_ACCOUNT_ID;
    const hasTypeFilter = selectedTypes.length > 0;
    const hasCategoryFilter = categoryFilter !== "investments"; // Default is now investments
    return hasAccountFilter || hasTypeFilter || hasCategoryFilter;
  }, [selectedAccount, selectedTypes, categoryFilter]);

  // Combined loading state
  const isDataLoading = isLoading || isAccountsLoading || isAlternativeHoldingsLoading;

  // Check if there are no holdings based on active tab
  const hasNoHoldings = useMemo(() => {
    if (isDataLoading) return false;
    if (isAlternativeTab) {
      return filteredAlternativeHoldings.length === 0;
    }
    return !nonCashHoldings || nonCashHoldings.length === 0;
  }, [isDataLoading, isAlternativeTab, filteredAlternativeHoldings, nonCashHoldings]);

  const renderEmptyState = () => {
    // Different empty states based on active tab
    if (categoryFilter === "assets") {
      return (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.Wallet className="text-muted-foreground h-10 w-10" />}
            title="No assets yet"
            description="Add your first property, vehicle, collectible, or other asset."
          >
            <Button size="default" onClick={() => setIsAlternativeAssetModalOpen(true)}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Asset
            </Button>
          </EmptyPlaceholder>
        </div>
      );
    }

    if (categoryFilter === "liabilities") {
      return (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.CreditCard className="text-muted-foreground h-10 w-10" />}
            title="No liabilities yet"
            description="Track your mortgages, loans, and other debts."
          >
            <Button size="default" onClick={() => setIsAlternativeAssetModalOpen(true)}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Liability
            </Button>
          </EmptyPlaceholder>
        </div>
      );
    }

    // Default: Investments empty state
    return (
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
  };

  const renderHoldingsView = () => {
    return (
      <div className="space-y-4">
        {/* Category Filter Chips (Desktop) */}
        <div className="hidden md:block">
          <HoldingsCategoryFilter value={categoryFilter} onValueChange={setCategoryFilter} />
        </div>

        {/* Content based on selected tab */}
        {hasNoHoldings ? (
          renderEmptyState()
        ) : isAlternativeTab ? (
          /* Alternative holdings for Assets/Liabilities tabs */
          <div className="hidden md:block">
            <AlternativeHoldingsTable
              holdings={filteredAlternativeHoldings}
              isLoading={isDataLoading}
              emptyTitle={categoryFilter === "liabilities" ? "No liabilities" : "No assets"}
              emptyDescription={
                categoryFilter === "liabilities"
                  ? "Add your first liability using the button above."
                  : "Add your first asset using the button above."
              }
              onEdit={handleEditAsset}
              onUpdateValue={setUpdateValueAsset}
              onViewHistory={handleViewHistory}
              onDelete={handleDeleteAsset}
              isDeleting={isDeleting}
            />
          </div>
        ) : (
          /* Investment holdings for Investments tab */
          <>
            {/* Desktop View - Table only */}
            <div className="hidden md:block">
              <HoldingsTable
                holdings={filteredHoldings ?? []}
                isLoading={isDataLoading}
                showTotalReturn={showTotalReturn}
                setShowTotalReturn={setShowTotalReturn}
                onClassify={(holding) => setClassifyAsset({
                  id: holding.instrument?.id ?? holding.id,
                  symbol: holding.instrument?.symbol ?? holding.id,
                  name: holding.instrument?.name ?? undefined,
                })}
              />
            </div>

            {/* Mobile View */}
            <div className="block md:hidden">
              <HoldingsTableMobile
                holdings={nonCashHoldings ?? []}
                isLoading={isDataLoading}
                selectedTypes={selectedTypes}
                setSelectedTypes={setSelectedTypes}
                selectedAccount={selectedAccount}
                accounts={accounts ?? []}
                onAccountChange={handleAccountSelect}
                showSearch={true}
                showFilterButton={false}
                sortBy={sortBy}
                showTotalReturn={showTotalReturn}
              />
            </div>
          </>
        )}

        {/* Mobile Category Filter (show for all tabs) */}
        <div className="block md:hidden">
          <HoldingsCategoryFilter value={categoryFilter} onValueChange={setCategoryFilter} />
        </div>
      </div>
    );
  };

  const filterButton = (
    <Button
      variant="outline"
      size="icon"
      className="relative size-9 flex-shrink-0"
      onClick={() => setIsFilterSheetOpen(true)}
    >
      <Icons.ListFilter className="h-4 w-4" />
      {hasActiveFilters && (
        <span className="bg-destructive absolute top-0.5 right-0 h-2 w-2 rounded-full" />
      )}
    </Button>
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Mobile: Only show filter button */}
      <div className="md:hidden">{filterButton}</div>

      {/* Desktop: Show account selector and add button */}
      <div className="hidden md:flex md:items-center md:gap-2">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
        <Button size="sm" onClick={() => setIsAlternativeAssetModalOpen(true)}>
          <Icons.Plus className="mr-2 h-4 w-4" />
          Add Asset
        </Button>
      </div>

      {/* Mobile: Add asset button */}
      <Button
        size="icon"
        className="md:hidden"
        onClick={() => setIsAlternativeAssetModalOpen(true)}
      >
        <Icons.Plus className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <Page>
      <PageHeader heading="Holdings" onBack={() => navigate(-1)} actions={headerActions} />
      <PageContent>{renderHoldingsView()}</PageContent>

      {/* Mobile Filter Sheet */}
      <HoldingsMobileFilterSheet
        open={isFilterSheetOpen}
        onOpenChange={setIsFilterSheetOpen}
        selectedAccount={selectedAccount}
        accounts={accounts ?? []}
        onAccountChange={handleAccountSelect}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        sortBy={sortBy}
        setSortBy={setSortBy}
        showTotalReturn={showTotalReturn}
        setShowTotalReturn={setShowTotalReturn}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
      />

      {/* Alternative Asset Quick Add Modal */}
      <AlternativeAssetQuickAddModal
        open={isAlternativeAssetModalOpen}
        onOpenChange={setIsAlternativeAssetModalOpen}
      />

      {/* Asset Details Sheet (Edit) */}
      <AssetDetailsSheet
        open={editAsset !== null}
        onOpenChange={(open) => !open && setEditAsset(null)}
        asset={editAsset}
        onSave={handleSaveAssetDetails}
        isSaving={isSavingDetails}
      />

      {/* Update Valuation Modal */}
      <UpdateValuationModal
        open={updateValueAsset !== null}
        onOpenChange={(open) => !open && setUpdateValueAsset(null)}
        assetId={updateValueAsset?.id ?? ""}
        assetName={updateValueAsset?.name ?? ""}
        currentValue={updateValueAsset?.marketValue ?? "0"}
        lastUpdatedDate={updateValueAsset?.valuationDate?.split("T")[0] ?? ""}
        currency={updateValueAsset?.currency ?? "USD"}
      />

      {/* Classification Sheet */}
      <ClassificationSheet
        open={!!classifyAsset}
        onOpenChange={(open) => !open && setClassifyAsset(null)}
        assetId={classifyAsset?.id ?? ""}
        assetSymbol={classifyAsset?.symbol}
        assetName={classifyAsset?.name}
      />
    </Page>
  );
};

export default HoldingsPage;
