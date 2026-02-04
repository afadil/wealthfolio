import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/use-accounts";
import { usePortfolios } from "@/hooks/use-portfolios";
import type { Portfolio } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";
import { forwardRef, useMemo, useState } from "react";

interface AccountPortfolioSelectorProps {
  // Selected accounts (controlled)
  selectedAccountIds: string[];
  onAccountsChange: (accountIds: string[]) => void;
  // Currently active portfolio (if selection matches exactly)
  onPortfolioChange?: (portfolioId: string | null) => void;
  // UI props
  className?: string;
}

export const AccountPortfolioSelector = forwardRef<
  HTMLButtonElement,
  AccountPortfolioSelectorProps
>(({ selectedAccountIds, onAccountsChange, onPortfolioChange, className }, ref) => {
  const [open, setOpen] = useState(false);
  const { accounts, isLoading: isLoadingAccounts } = useAccounts(false, false); // Get all active accounts
  const { data: portfolios = [], isLoading: isLoadingPortfolios } = usePortfolios();

  const isLoading = isLoadingAccounts || isLoadingPortfolios;

  // Check if current selection matches any portfolio
  const matchedPortfolio = useMemo(() => {
    if (!portfolios || selectedAccountIds.length === 0) return null;

    return portfolios.find((portfolio) => {
      // Order-independent comparison
      const portfolioSet = new Set(portfolio.accountIds);
      const selectedSet = new Set(selectedAccountIds);

      if (portfolioSet.size !== selectedSet.size) return false;

      for (const id of selectedSet) {
        if (!portfolioSet.has(id)) return false;
      }

      return true;
    });
  }, [portfolios, selectedAccountIds]);

  // Update active portfolio when matched
  useMemo(() => {
    if (onPortfolioChange) {
      onPortfolioChange(matchedPortfolio?.id ?? null);
    }
  }, [matchedPortfolio, onPortfolioChange]);

  // Handle portfolio selection
  const handlePortfolioSelect = (portfolio: Portfolio) => {
    onAccountsChange(portfolio.accountIds);
    setOpen(false);
  };

  // Handle "All Accounts" selection
  const handleAllAccountsSelect = () => {
    onAccountsChange(["TOTAL"]); // PORTFOLIO_ACCOUNT_ID
    setOpen(false);
  };

  // Handle individual account toggle
  const handleAccountToggle = (accountId: string) => {
    // If "All Accounts" is currently selected, clear it and start fresh
    if (selectedAccountIds.includes("TOTAL")) {
      onAccountsChange([accountId]);
      return;
    }

    const isSelected = selectedAccountIds.includes(accountId);

    if (isSelected) {
      onAccountsChange(selectedAccountIds.filter((id) => id !== accountId));
    } else {
      onAccountsChange([...selectedAccountIds, accountId]);
    }
  };

  // Render display text
  const renderDisplayText = () => {
    // Check if PORTFOLIO_ACCOUNT_ID (All Accounts) is selected
    const isAllAccounts = selectedAccountIds.includes("TOTAL");

    if (isAllAccounts) {
      return (
        <div className="flex items-center gap-2">
          <Icons.Wallet className="h-4 w-4 shrink-0 opacity-70" />
          <span>All Accounts</span>
        </div>
      );
    }

    // Check if portfolio is active
    if (matchedPortfolio) {
      return (
        <div className="flex items-center gap-2">
          <Icons.Briefcase className="h-4 w-4 shrink-0 opacity-70" />
          <span>{matchedPortfolio.name}</span>
        </div>
      );
    }

    // Multi-select without portfolio match
    if (selectedAccountIds.length === 0) {
      return <span className="text-muted-foreground">Select accounts or portfolio</span>;
    }

    if (selectedAccountIds.length === 1) {
      const account = accounts?.find((a) => a.id === selectedAccountIds[0]);
      return (
        <div className="flex items-center gap-2">
          <Icons.CreditCard className="h-4 w-4 shrink-0 opacity-70" />
          <span>{account?.name ?? "Account"}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Icons.Wallet className="h-4 w-4 shrink-0 opacity-70" />
        <span>{selectedAccountIds.length} accounts selected</span>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className={cn(
            "bg-secondary/30 hover:bg-muted/80 flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-none px-3 py-1 text-sm font-medium",
            className,
          )}
        >
          {renderDisplayText()}
          <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start" sideOffset={8}>
        <Command className="w-full">
          <CommandInput placeholder="Search..." />
          <CommandList>
            {isLoading ? (
              <div className="px-2 py-6 text-center">
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ) : (
              <>
                <CommandEmpty>No results found.</CommandEmpty>

                {/* All Accounts Option */}
                <CommandGroup>
                  <CommandItem
                    onSelect={handleAllAccountsSelect}
                    className="flex items-center py-2"
                  >
                    <Icons.Wallet className="mr-2 h-4 w-4 opacity-70" />
                    <span className="flex-1 font-medium">All Accounts</span>
                    <Icons.Check
                      className={cn(
                        "h-4 w-4",
                        selectedAccountIds.includes("TOTAL") ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                </CommandGroup>

                {/* Saved Portfolios */}
                {portfolios && portfolios.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Portfolios">
                      {portfolios.map((portfolio) => {
                        const isActive = matchedPortfolio?.id === portfolio.id;
                        return (
                          <CommandItem
                            key={portfolio.id}
                            onSelect={() => handlePortfolioSelect(portfolio)}
                            className="flex items-center py-2"
                          >
                            <Icons.CreditCard className="mr-2 h-4 w-4 opacity-70" />
                            <div className="flex flex-1 flex-col">
                              <span>{portfolio.name}</span>
                              <span className="text-muted-foreground text-xs">
                                {portfolio.accountIds.length}{" "}
                                {portfolio.accountIds.length === 1 ? "account" : "accounts"}
                              </span>
                            </div>
                            <Icons.Check
                              className={cn("h-4 w-4", isActive ? "opacity-100" : "opacity-0")}
                            />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}

                {/* Individual Accounts */}
                {accounts && accounts.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Accounts">
                      {accounts.map((account) => {
                        const isSelected = selectedAccountIds.includes(account.id);
                        return (
                          <CommandItem
                            key={account.id}
                            onSelect={() => handleAccountToggle(account.id)}
                            className="flex items-center py-2"
                          >
                            <Icons.Briefcase className="mr-2 h-4 w-4 opacity-70" />
                            <div className="flex flex-1 flex-col">
                              <span>{account.name}</span>
                              <span className="text-muted-foreground text-xs">
                                {account.currency}
                              </span>
                            </div>
                            <Icons.Check
                              className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
                            />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});

AccountPortfolioSelector.displayName = "AccountPortfolioSelector";
