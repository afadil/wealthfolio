import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { EmptyPlaceholder, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import { useMemo, useState } from "react";

import { AccountSelector } from "@/components/account-selector";
import { useAccounts } from "@/hooks/use-accounts";
import { useHoldings } from "@/hooks/use-holdings";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { Account, HoldingType } from "@/lib/types";
import { useNavigate } from "react-router-dom";
import { HoldingsMobileFilterSheet } from "./components/holdings-mobile-filter-sheet";
import { HoldingsTable } from "./components/holdings-table";
import { HoldingsTableMobile } from "./components/holdings-table-mobile";

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
  const { accounts } = useAccounts();

  // Mobile filter state
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [sortBy, setSortBy] = usePersistentState<"symbol" | "marketValue">(
    "holdings-sort-by",
    "marketValue",
  );
  const [showTotalReturn, setShowTotalReturn] = usePersistentState<boolean>(
    "holdings-show-total-return",
    true,
  );

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

  const { nonCashHoldings, filteredNonCashHoldings } = useMemo(() => {
    const nonCash =
      holdings?.filter((holding) => holding.holdingType?.toLowerCase() !== HoldingType.CASH) ?? [];

    // Apply asset type filter
    const filtered =
      selectedTypes.length > 0
        ? nonCash.filter(
            (holding) =>
              holding.instrument?.assetSubclass &&
              selectedTypes.includes(holding.instrument.assetSubclass),
          )
        : nonCash;

    return { nonCashHoldings: nonCash, filteredNonCashHoldings: filtered };
  }, [holdings, selectedTypes]);

  const hasActiveFilters = useMemo(() => {
    const hasAccountFilter = selectedAccount?.id !== PORTFOLIO_ACCOUNT_ID;
    const hasTypeFilter = selectedTypes.length > 0;
    return hasAccountFilter || hasTypeFilter;
  }, [selectedAccount, selectedTypes]);

  // Check if there are no holdings at all (excluding cash holdings)
  const hasNoHoldings = !isLoading && (!nonCashHoldings || nonCashHoldings.length === 0);

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

  const renderHoldingsView = () => {
    if (hasNoHoldings) {
      return renderEmptyState();
    }

    return (
      <div className="space-y-4">
        <div className="hidden md:block">
          <HoldingsTable
            holdings={filteredNonCashHoldings ?? []}
            isLoading={isLoading}
            showTotalReturn={showTotalReturn}
            setShowTotalReturn={setShowTotalReturn}
          />
        </div>
        <div className="block md:hidden">
          <HoldingsTableMobile
            holdings={nonCashHoldings ?? []}
            isLoading={isLoading}
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

      {/* Desktop: Show account selector */}
      <div className="hidden md:flex md:items-center md:gap-2">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>
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
      />
    </Page>
  );
};

export default HoldingsPage;
