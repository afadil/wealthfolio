import { TickerAvatar } from "@/components/ticker-avatar";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { Account, Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AmountDisplay, FacetedSearchInput, GainPercent, Separator } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HoldingsMobileFilterSheet } from "./holdings-mobile-filter-sheet";

interface HoldingsTableMobileProps {
  holdings: Holding[];
  isLoading: boolean;
  selectedTypes: string[];
  setSelectedTypes: (types: string[]) => void;
  selectedAccount: Account | null;
  accounts: Account[];
  onAccountChange: (account: Account) => void;
  showAccountFilter?: boolean;
  showSearch?: boolean;
  showFilterButton?: boolean;
  sortBy?: "symbol" | "marketValue";
  setSortBy?: (value: "symbol" | "marketValue") => void;
  showTotalReturn?: boolean;
  setShowTotalReturn?: (value: boolean) => void;
}

export const HoldingsTableMobile = ({
  holdings,
  isLoading,
  selectedTypes,
  setSelectedTypes,
  selectedAccount,
  accounts,
  onAccountChange,
  showAccountFilter = true,
  showSearch = true,
  showFilterButton = true,
  sortBy: controlledSortBy,
  setSortBy: controlledSetSortBy,
  showTotalReturn: controlledShowTotalReturn,
  setShowTotalReturn: controlledSetShowTotalReturn,
}: HoldingsTableMobileProps) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Internal state for uncontrolled mode
  const [internalSortBy, setInternalSortBy] = useState<"symbol" | "marketValue">("marketValue");
  const [internalShowTotalReturn, setInternalShowTotalReturn] = useState(true);

  const sortBy = controlledSortBy ?? internalSortBy;
  const setSortBy = controlledSetSortBy ?? setInternalSortBy;
  const showTotalReturn = controlledShowTotalReturn ?? internalShowTotalReturn;
  const setShowTotalReturn = controlledSetShowTotalReturn ?? setInternalShowTotalReturn;

  const hasActiveFilters = useMemo(() => {
    const hasAccountFilter = showAccountFilter && selectedAccount?.id !== PORTFOLIO_ACCOUNT_ID;
    const hasTypeFilter = selectedTypes.length > 0;
    return hasAccountFilter || hasTypeFilter;
  }, [selectedAccount, selectedTypes, showAccountFilter]);

  const filteredHoldings = useMemo(() => {
    let result = [...holdings];

    if (selectedTypes.length > 0) {
      result = result.filter((holding) => {
        const assetType = holding.instrument?.classifications?.assetType?.name;
        return assetType && selectedTypes.includes(assetType);
      });
    }

    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      result = result.filter((holding) => {
        const nameMatch = holding.instrument?.name?.toLowerCase().includes(lowercasedQuery);
        const symbolMatch = holding.instrument?.symbol?.toLowerCase().includes(lowercasedQuery);

        return nameMatch || symbolMatch;
      });
    }

    return result.sort((a, b) => {
      if (sortBy === "marketValue") {
        const valA = a.marketValue?.base ?? 0;
        const valB = b.marketValue?.base ?? 0;
        return valB - valA; // Descending
      }

      const symbolA = a.instrument?.symbol?.toLowerCase() ?? "";
      const symbolB = b.instrument?.symbol?.toLowerCase() ?? "";
      if (symbolA && symbolB) {
        return symbolA.localeCompare(symbolB);
      }
      if (symbolA) {
        return -1;
      }
      if (symbolB) {
        return 1;
      }
      return 0;
    });
  }, [holdings, selectedTypes, searchQuery, sortBy]);

  const handleNavigate = (holding: Holding) => {
    // Use instrument.id (asset ID) for navigation, not symbol (which may be stripped)
    const assetId = holding.instrument?.id;
    if (assetId && !assetId.startsWith("$CASH")) {
      navigate(`/holdings/${encodeURIComponent(assetId)}`, { state: { holding } });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(showSearch || showFilterButton) && (
        <div className="flex items-center gap-2">
          {showSearch && (
            <FacetedSearchInput value={searchQuery} onChange={setSearchQuery} className="flex-1" />
          )}
          {showFilterButton && (
            <Button
              variant="outline"
              size="icon"
              className="relative size-9 shrink-0"
              onClick={() => setIsFilterSheetOpen(true)}
            >
              <Icons.ListFilter className="h-4 w-4" />
              {hasActiveFilters && (
                <span className="bg-destructive absolute right-0 top-0.5 h-2 w-2 rounded-full" />
              )}
            </Button>
          )}
        </div>
      )}
      <div className="space-y-2">
        {filteredHoldings.length > 0 ? (
          filteredHoldings.map((holding) => {
            const symbol = holding.instrument?.symbol ?? holding.id;
            const isCash = symbol.startsWith("$CASH");
            const avatarSymbol = isCash ? "$CASH" : symbol;
            const displaySymbol = isCash ? symbol.split("-")[0] : symbol;
            const isNavigable = !isCash && holding.instrument?.symbol;

            return (
              <Card
                key={holding.id}
                className={cn(
                  "p-3",
                  isNavigable && "hover:bg-muted/50 cursor-pointer transition-colors",
                )}
                onClick={() => isNavigable && handleNavigate(holding)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-1 items-center gap-3 overflow-hidden">
                    <TickerAvatar symbol={avatarSymbol} className="h-10 w-10" />
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate font-semibold">{displaySymbol}</p>
                      {holding.instrument?.name && (
                        <p className="text-muted-foreground truncate text-sm">
                          {holding.instrument.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ml-2 text-right">
                    <AmountDisplay
                      value={holding.marketValue?.local ?? 0}
                      currency={holding.localCurrency}
                      isHidden={isBalanceHidden}
                      className="font-medium"
                    />
                    <div className="flex items-center justify-end gap-1">
                      <AmountDisplay
                        value={
                          showTotalReturn
                            ? (holding.totalGain?.local ?? 0)
                            : (holding.dayChange?.local ?? 0)
                        }
                        currency={holding.localCurrency}
                        isHidden={isBalanceHidden}
                        colorFormat
                        className="text-xs"
                      />
                      <Separator orientation="vertical" className="mx-1 h-4" />
                      <GainPercent
                        value={
                          showTotalReturn
                            ? (holding.totalGainPct ?? 0)
                            : (holding.dayChangePct ?? 0)
                        }
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <h3 className="text-lg font-medium">No positions found</h3>
            <p className="text-muted-foreground text-sm">
              {holdings.length === 0
                ? "Add activities to see your positions here."
                : "Try adjusting your search or filter criteria."}
            </p>
          </div>
        )}
      </div>

      {/* Filter Sheet */}
      <HoldingsMobileFilterSheet
        open={isFilterSheetOpen}
        onOpenChange={setIsFilterSheetOpen}
        selectedAccount={selectedAccount}
        accounts={accounts}
        onAccountChange={onAccountChange}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        showAccountFilter={showAccountFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        showTotalReturn={showTotalReturn}
        setShowTotalReturn={setShowTotalReturn}
      />
    </div>
  );
};

export default HoldingsTableMobile;
