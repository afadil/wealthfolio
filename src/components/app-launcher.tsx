import { useAccounts } from "@/hooks/use-accounts";
import { useHoldings } from "@/hooks/use-holdings";
import { AccountType, HoldingType, PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { Account } from "@/lib/types";
import { useNavigation } from "@/pages/layouts/navigation/app-navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Icons,
  type Icon,
} from "@wealthfolio/ui";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
interface LauncherHoldingItem {
  id: string;
  symbol: string;
  name?: string | null;
}
interface LauncherAccountItem {
  id: string;
  name: string;
  accountType: Account["accountType"];
}

const accountTypeIcons: Record<AccountType | typeof PORTFOLIO_ACCOUNT_ID, Icon> = {
  [AccountType.SECURITIES]: Icons.Briefcase,
  [AccountType.CASH]: Icons.DollarSign,
  [AccountType.CRYPTOCURRENCY]: Icons.Bitcoin,
  [PORTFOLIO_ACCOUNT_ID]: Icons.Wallet,
};

export function AppLauncher() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigation = useNavigation();
  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const { holdings, isLoading: isHoldingsLoading } = useHoldings(PORTFOLIO_ACCOUNT_ID);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd/Ctrl+K
      const isModifierK =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "k";

      if (!isModifierK) {
        return;
      }

      // Allow native behavior in editable fields
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = target?.isContentEditable;
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || isEditable) {
        return;
      }

      // Prevent browser's default Cmd/Ctrl+K behavior
      event.preventDefault();
      event.stopPropagation();
      setOpen((prev) => !prev);
    };

    // Use capture phase to intercept before other handlers
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
    setSearch("");
  }, [location.pathname]);

  // Combine navigation items with additional quick actions
  const actionItems = useMemo(() => {
    // Additional quick actions not in main navigation
    const quickActions = [
      {
        title: "Add Activity",
        href: "/activities",
        icon: <Icons.Plus className="size-6" />,
        keywords: ["add", "new", "create", "transaction", "trade"],
        label: "Add Activity",
      },
      {
        title: "Import Activities",
        href: "/import",
        icon: <Icons.Import className="size-6" />,
        keywords: ["import", "csv", "upload", "file"],
        label: "Import Activities",
      },
    ];

    const navItems = [
      ...(navigation.primary ?? []),
      ...(navigation.secondary ?? []),
      ...(navigation.addons ?? []),
    ];

    return [...quickActions, ...navItems];
  }, [navigation]);

  const holdingOptions = useMemo<LauncherHoldingItem[]>(() => {
    if (!holdings?.length) {
      return [];
    }
    const seenSymbols = new Set<string>();
    return holdings
      .filter((holding) => holding.holdingType !== HoldingType.CASH && holding.instrument?.symbol)
      .map((holding) => ({
        id: holding.instrument?.id ?? holding.id,
        symbol: holding.instrument?.symbol ?? "",
        name: holding.instrument?.name ?? null,
      }))
      .filter((holding) => {
        if (seenSymbols.has(holding.symbol)) {
          return false;
        }
        seenSymbols.add(holding.symbol);
        return true;
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [holdings]);
  const accountOptions = useMemo<LauncherAccountItem[]>(() => {
    if (!accounts?.length) {
      return [];
    }
    return accounts
      .filter((account) => account.id !== PORTFOLIO_ACCOUNT_ID)
      .map((account) => ({
        id: account.id,
        name: account.name,
        accountType: account.accountType,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts]);
  const handleSelectHolding = (symbol: string) => {
    if (!symbol) {
      return;
    }
    setOpen(false);
    navigate(`/holdings/${encodeURIComponent(symbol)}`);
  };
  const handleSelectAccount = (accountId: string) => {
    if (!accountId) {
      return;
    }
    setOpen(false);
    navigate(`/accounts/${accountId}`);
  };

  const handleSelectAction = (path: string) => {
    if (!path) {
      return;
    }
    setOpen(false);
    navigate(path);
  };

  // Filter items based on search
  const searchLower = search.toLowerCase();
  const filteredActions = actionItems.filter((action) => {
    const displayText = (action.label ?? action.title).toLowerCase();
    const keywords = (action.keywords ?? []).map((k) => k.toLowerCase());
    return displayText.includes(searchLower) || keywords.some((k) => k.includes(searchLower));
  });

  const filteredHoldings = holdingOptions.filter((holding) => {
    return (
      holding.symbol.toLowerCase().includes(searchLower) ||
      holding.name?.toLowerCase().includes(searchLower)
    );
  });

  const filteredAccounts = accountOptions.filter((account) => {
    return account.name.toLowerCase().includes(searchLower);
  });

  const hasResults =
    filteredActions.length > 0 || filteredHoldings.length > 0 || filteredAccounts.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search actions, holdings, or accounts..."
        autoFocus={open}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {!hasResults && <CommandEmpty>No matches found.</CommandEmpty>}
        {filteredActions.length > 0 && (
          <CommandGroup heading="Actions">
            {filteredActions.map((action, index) => {
              // Extract icon and resize it for the command item
              const iconElement = action.icon;
              const resizedIcon = iconElement
                ? React.cloneElement(iconElement as React.ReactElement<{ className?: string }>, {
                    className: "text-muted-foreground mr-2 h-4 w-4",
                  })
                : null;

              // Use label if available, otherwise fall back to title
              const displayText = action.label ?? action.title;

              return (
                <CommandItem
                  key={action.href ?? index}
                  value={displayText}
                  onSelect={() => handleSelectAction(action.href)}
                >
                  {resizedIcon}
                  <span className="font-medium">{displayText}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {(isHoldingsLoading || filteredHoldings.length > 0) && (
          <CommandGroup heading="Holdings">
            {isHoldingsLoading ? (
              <CommandItem disabled>Loading holdings...</CommandItem>
            ) : (
              filteredHoldings.map((holding) => (
                <CommandItem
                  key={holding.id}
                  value={holding.symbol}
                  onSelect={() => handleSelectHolding(holding.symbol)}
                >
                  <Icons.TrendingUp className="text-muted-foreground mr-2 h-4 w-4" />
                  <span className="font-medium">{holding.symbol}</span>
                  {holding.name ? (
                    <span className="text-muted-foreground ml-2 truncate">{holding.name}</span>
                  ) : null}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        )}
        {(isAccountsLoading || filteredAccounts.length > 0) && (
          <CommandGroup heading="Accounts">
            {isAccountsLoading ? (
              <CommandItem disabled>Loading accounts...</CommandItem>
            ) : (
              filteredAccounts.map((account) => {
                const IconComponent = accountTypeIcons[account.accountType] ?? Icons.Wallet;
                return (
                  <CommandItem
                    key={account.id}
                    value={account.name}
                    onSelect={() => handleSelectAccount(account.id)}
                  >
                    <IconComponent className="text-muted-foreground mr-2 h-4 w-4" />
                    <span className="font-medium">{account.name}</span>
                  </CommandItem>
                );
              })
            )}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
export default AppLauncher;
