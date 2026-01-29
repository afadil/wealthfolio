import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { EmptyPlaceholder } from "@wealthfolio/ui";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { SwipablePage, SwipablePageView } from "@/components/page";
import { AccountSelector } from "@/components/account-selector";
import { ActionPalette, type ActionPaletteGroup } from "@/components/action-palette";
import { useAccounts } from "@/hooks/use-accounts";
import { useHoldings } from "@/hooks/use-holdings";
import { useAlternativeHoldings, useDeleteAlternativeAsset } from "@/hooks/use-alternative-assets";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  PORTFOLIO_ACCOUNT_ID,
  HOLDING_CATEGORY_FILTERS,
  apiKindToAlternativeAssetKind,
} from "@/lib/constants";
import { Account, HoldingType, AlternativeAssetHolding, AlternativeAssetKind } from "@/lib/types";
import { canAddHoldings } from "@/lib/activity-restrictions";
import { HoldingsMobileFilterSheet } from "./components/holdings-mobile-filter-sheet";
import { HoldingsTable } from "./components/holdings-table";
import { HoldingsTableMobile } from "./components/holdings-table-mobile";
import { AlternativeHoldingsTable } from "./components/alternative-holdings-table";
import { HoldingsEditMode } from "./components/holdings-edit-mode";
import {
  AlternativeAssetQuickAddModal,
  AssetDetailsSheet,
  UpdateValuationModal,
  type AssetDetailsSheetAsset,
} from "@/features/alternative-assets";
import { updateAlternativeAssetMetadata } from "@/adapters";
import { ClassificationSheet } from "@/components/classification/classification-sheet";
import { useUpdatePortfolioMutation } from "@/hooks/use-calculate-portfolio";

export const HoldingsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "investments";

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
  const [classifyAsset, setClassifyAsset] = useState<{
    id: string;
    symbol: string;
    name?: string;
  } | null>(null);

  // Edit mode state for HOLDINGS-mode accounts
  const [isEditMode, setIsEditMode] = useState(false);

  // Action palette state
  const [isActionPaletteOpen, setIsActionPaletteOpen] = useState(false);
  const [modalDefaultKind, setModalDefaultKind] = useState<AlternativeAssetKind | undefined>(
    undefined,
  );
  const updatePortfolioMutation = useUpdatePortfolioMutation();

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
    // Exit edit mode when switching accounts
    setIsEditMode(false);
  };

  // Check if the selected account supports manual holdings editing
  const canEditHoldings = useMemo(() => {
    if (!selectedAccount || selectedAccount.id === PORTFOLIO_ACCOUNT_ID) {
      return false;
    }
    return canAddHoldings(selectedAccount);
  }, [selectedAccount]);

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
      navigate(`/holdings/${encodeURIComponent(holding.id)}?tab=history`);
    },
    [navigate],
  );

  // Get the investments filter config
  const investmentsFilter = useMemo(() => {
    return HOLDING_CATEGORY_FILTERS.find((f) => f.id === "investments");
  }, []);

  // Filter alternative holdings for assets (non-liability)
  const assetsHoldings = useMemo(() => {
    if (!alternativeHoldings) return [];
    return alternativeHoldings.filter((h) => h.kind !== "liability");
  }, [alternativeHoldings]);

  // Filter alternative holdings for liabilities
  const liabilitiesHoldings = useMemo(() => {
    if (!alternativeHoldings) return [];
    return alternativeHoldings.filter((h) => h.kind === "liability");
  }, [alternativeHoldings]);

  // Process investment holdings
  const { nonCashHoldings, filteredHoldings } = useMemo(() => {
    const nonCash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) ?? [];

    let filtered = nonCash;
    if (investmentsFilter?.assetKinds) {
      const allowedKinds = investmentsFilter.assetKinds as readonly string[];
      filtered = nonCash.filter((holding) => {
        return holding.assetKind && allowedKinds.includes(holding.assetKind);
      });
    }

    if (selectedTypes.length > 0) {
      filtered = filtered.filter((holding) => {
        const assetType = holding.instrument?.classifications?.assetType?.name;
        return assetType && selectedTypes.includes(assetType);
      });
    }

    return { nonCashHoldings: nonCash, filteredHoldings: filtered };
  }, [holdings, selectedTypes, investmentsFilter]);

  // Combined loading state
  const isDataLoading = isLoading || isAccountsLoading || isAlternativeHoldingsLoading;

  // Empty state checks
  const hasNoInvestments = !isDataLoading && (!nonCashHoldings || nonCashHoldings.length === 0);
  const hasNoAssets = !isDataLoading && assetsHoldings.length === 0;
  const hasNoLiabilities = !isDataLoading && liabilitiesHoldings.length === 0;

  // Investments content
  const investmentsContent = (
    <>
      {/* Edit Mode for HOLDINGS-mode accounts */}
      {isEditMode && selectedAccount && canEditHoldings ? (
        <HoldingsEditMode
          holdings={holdings ?? []}
          account={selectedAccount}
          isLoading={isDataLoading}
          onClose={() => setIsEditMode(false)}
        />
      ) : hasNoInvestments ? (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.TrendingUp className="text-muted-foreground h-10 w-10" />}
            title="No holdings yet"
            description={
              canEditHoldings
                ? "Get started by updating your holdings or importing from a CSV file."
                : "Get started by adding your first transaction or quickly import your existing holdings from a CSV file."
            }
          >
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              {canEditHoldings ? (
                <>
                  <Button size="default" onClick={() => setIsEditMode(true)}>
                    <Icons.Pencil className="mr-2 h-4 w-4" />
                    Update Holdings
                  </Button>
                  <Button size="default" variant="outline" onClick={() => navigate("/import")}>
                    <Icons.Import className="mr-2 h-4 w-4" />
                    Import from CSV
                  </Button>
                </>
              ) : (
                <>
                  <Button size="default" onClick={() => navigate("/activities/manage")}>
                    <Icons.Plus className="mr-2 h-4 w-4" />
                    Add Transaction
                  </Button>
                  <Button size="default" variant="outline" onClick={() => navigate("/import")}>
                    <Icons.Import className="mr-2 h-4 w-4" />
                    Import from CSV
                  </Button>
                </>
              )}
            </div>
          </EmptyPlaceholder>
        </div>
      ) : (
        <>
          {/* Desktop View */}
          <div className="hidden md:block">
            <HoldingsTable
              holdings={filteredHoldings ?? []}
              isLoading={isDataLoading}
              showTotalReturn={showTotalReturn}
              setShowTotalReturn={setShowTotalReturn}
              onClassify={(holding) =>
                setClassifyAsset({
                  id: holding.instrument?.id ?? holding.id,
                  symbol: holding.instrument?.symbol ?? holding.id,
                  name: holding.instrument?.name ?? undefined,
                })
              }
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
    </>
  );

  // Personal Assets content
  const assetsContent = (
    <>
      {hasNoAssets ? (
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
      ) : (
        <AlternativeHoldingsTable
          holdings={assetsHoldings}
          isLoading={isDataLoading}
          emptyTitle="No assets"
          emptyDescription="Add your first asset using the button above."
          onEdit={handleEditAsset}
          onUpdateValue={setUpdateValueAsset}
          onViewHistory={handleViewHistory}
          onDelete={handleDeleteAsset}
          isDeleting={isDeleting}
        />
      )}
    </>
  );

  // Liabilities content
  const liabilitiesContent = (
    <>
      {hasNoLiabilities ? (
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
      ) : (
        <AlternativeHoldingsTable
          holdings={liabilitiesHoldings}
          isLoading={isDataLoading}
          emptyTitle="No liabilities"
          emptyDescription="Add your first liability using the button above."
          onEdit={handleEditAsset}
          onUpdateValue={setUpdateValueAsset}
          onViewHistory={handleViewHistory}
          onDelete={handleDeleteAsset}
          isDeleting={isDeleting}
        />
      )}
    </>
  );

  // Action palette groups
  const actionPaletteGroups: ActionPaletteGroup[] = useMemo(
    () => [
      {
        items: [
          {
            icon: Icons.Wallet,
            label: "Add Asset",
            onClick: () => {
              setModalDefaultKind(undefined);
              setIsAlternativeAssetModalOpen(true);
            },
          },
          {
            icon: Icons.CreditCard,
            label: "Add Liability",
            onClick: () => {
              setModalDefaultKind(AlternativeAssetKind.LIABILITY);
              setIsAlternativeAssetModalOpen(true);
            },
          },
          {
            icon: Icons.Plus,
            label: "Add Activity",
            onClick: () => navigate("/activities/manage"),
          },
          {
            icon: Icons.Refresh,
            label: "Update Prices",
            onClick: () => updatePortfolioMutation.mutate(),
          },
        ],
      },
    ],
    [navigate, updatePortfolioMutation],
  );

  // Shared actions for header
  const sharedActions = useMemo(
    () => (
      <>
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
        {/* Show Update button for HOLDINGS-mode manual accounts (only on investments tab) */}
        {canEditHoldings && !isEditMode && currentTab === "investments" && (
          <Button size="sm" variant="outline" onClick={() => setIsEditMode(true)}>
            <Icons.Pencil className="mr-2 h-4 w-4" />
            Update
          </Button>
        )}
        <ActionPalette
          open={isActionPaletteOpen}
          onOpenChange={setIsActionPaletteOpen}
          groups={actionPaletteGroups}
        />
      </>
    ),
    [
      selectedAccount,
      handleAccountSelect,
      canEditHoldings,
      isEditMode,
      currentTab,
      isActionPaletteOpen,
      actionPaletteGroups,
    ],
  );

  // Define the swipeable views
  const views: SwipablePageView[] = useMemo(
    () => [
      {
        value: "investments",
        label: "Investments",
        icon: Icons.TrendingUp,
        content: investmentsContent,
        actions: sharedActions,
      },
      {
        value: "assets",
        label: "Personal Assets",
        icon: Icons.Wallet,
        content: assetsContent,
        actions: sharedActions,
      },
      {
        value: "liabilities",
        label: "Liabilities",
        icon: Icons.CreditCard,
        content: liabilitiesContent,
        actions: sharedActions,
      },
    ],
    [investmentsContent, assetsContent, liabilitiesContent, sharedActions],
  );

  // Determine defaultKind for modal - explicit state takes precedence, then fall back to current tab
  const getDefaultKindForModal = (): AlternativeAssetKind | undefined => {
    if (modalDefaultKind !== undefined) return modalDefaultKind;
    if (currentTab === "liabilities") return AlternativeAssetKind.LIABILITY;
    return undefined;
  };

  return (
    <>
      <SwipablePage views={views} defaultView="investments" />

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
      />

      {/* Alternative Asset Quick Add Modal */}
      <AlternativeAssetQuickAddModal
        open={isAlternativeAssetModalOpen}
        onOpenChange={(open) => {
          setIsAlternativeAssetModalOpen(open);
          if (!open) setModalDefaultKind(undefined);
        }}
        defaultKind={getDefaultKindForModal()}
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
    </>
  );
};

export default HoldingsPage;
