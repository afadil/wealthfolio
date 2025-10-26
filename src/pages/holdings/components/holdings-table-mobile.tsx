import { TickerAvatar } from "@/components/ticker-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { Account, Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AmountDisplay, GainPercent, Separator } from "@wealthfolio/ui";
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
}: HoldingsTableMobileProps) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const hasActiveFilters = useMemo(() => {
    const hasAccountFilter = showAccountFilter && selectedAccount?.id !== PORTFOLIO_ACCOUNT_ID;
    const hasTypeFilter = selectedTypes.length > 0;
    return hasAccountFilter || hasTypeFilter;
  }, [selectedAccount, selectedTypes, showAccountFilter]);

  const filteredHoldings = useMemo(() => {
    let result = holdings;

    if (selectedTypes.length > 0) {
      result = result.filter(
        (holding) =>
          holding.instrument?.assetSubclass &&
          selectedTypes.includes(holding.instrument.assetSubclass),
      );
    }

    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      result = result.filter((holding) => {
        const nameMatch = holding.instrument?.name?.toLowerCase().includes(lowercasedQuery);
        const symbolMatch = holding.instrument?.symbol?.toLowerCase().includes(lowercasedQuery);
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return nameMatch || symbolMatch;
      });
    }

    return result;
  }, [holdings, selectedTypes, searchQuery]);

  const handleNavigate = (holding: Holding) => {
    const symbol = holding.instrument?.symbol;
    if (symbol && !symbol.startsWith("$CASH")) {
      navigate(`/holdings/${encodeURIComponent(symbol)}`, { state: { holding } });
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
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-secondary/30 mobile:h-10 flex-1 rounded-full border-none"
        />
        <Button
          variant="outline"
          size="icon"
          className="mobile:size-9 flex-shrink-0"
          onClick={() => setIsFilterSheetOpen(true)}
        >
          <div className="relative">
            <Icons.ListFilter className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="bg-primary absolute -top-1 -left-[1.5px] h-2 w-2 rounded-full" />
            )}
          </div>
        </Button>
      </div>
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
                      <p className="text-muted-foreground truncate text-sm">
                        {holding.instrument?.name ?? "N/A"}
                      </p>
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
                        value={holding.totalGain?.local ?? 0}
                        currency={holding.localCurrency}
                        isHidden={isBalanceHidden}
                        colorFormat
                        className="text-xs"
                      />
                      <Separator orientation="vertical" className="mx-1 h-4" />
                      <GainPercent value={holding.totalGainPct ?? 0} className="text-xs" />
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
      />
    </div>
  );
};

export default HoldingsTableMobile;
