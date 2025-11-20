import { useAccounts } from "@/hooks/use-accounts";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useRecalculatePortfolioMutation, useUpdatePortfolioMutation } from "@/hooks/use-calculate-portfolio";
import { useHoldings } from "@/hooks/use-holdings";
import { AccountType, HoldingType, PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
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
interface LauncherActionItem {
  title: string;
  href: string;
  icon?: React.ReactNode;
  keywords?: string[];
  label?: string;
  disabled?: boolean;
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
  const { isBalanceHidden, toggleBalanceVisibility } = useBalancePrivacy();
  const { updateSettings } = useSettingsContext();
  const {
    mutate: updatePortfolio,
    isPending: isUpdatingPortfolio,
  } = useUpdatePortfolioMutation();
  const {
    mutate: recalculatePortfolio,
    isPending: isRecalculatingPortfolio,
  } = useRecalculatePortfolioMutation();

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
  const actionItems = useMemo<LauncherActionItem[]>(() => {
    // Build smart URL with context awareness and optional activity type
    const buildTransactionUrl = (activityType?: string) => {
      const path = location.pathname;
      const params = new URLSearchParams();

      // Add activity type if provided
      if (activityType) {
        params.set("type", activityType);
      }

      // Check if on account page: /accounts/:id
      const accountRegex = /^\/accounts\/([^/]+)$/;
      const accountMatch = accountRegex.exec(path);
      if (accountMatch) {
        const accountId = accountMatch[1];
        params.set("account", accountId);
        params.set("redirect-to", path);
      }

      // Check if on asset profile page: /holdings/:symbol (only for trade activities)
      if (!activityType || ["BUY", "SELL"].includes(activityType)) {
        const assetRegex = /^\/holdings\/([^/]+)$/;
        const assetMatch = assetRegex.exec(path);
        if (assetMatch) {
          const symbol = decodeURIComponent(assetMatch[1]);
          params.set("symbol", symbol);
          if (!params.has("redirect-to")) {
            params.set("redirect-to", path);
          }
        }
      }

      return `/activities/manage${params.toString() ? `?${params.toString()}` : ""}`;
    };

    // Additional quick actions not in main navigation
    const quickActions: LauncherActionItem[] = [
      {
        title: isBalanceHidden ? "Show Balance" : "Hide Balance",
        href: "#toggle-privacy",
        icon: isBalanceHidden ? (
          <Icons.Eye className="size-6" />
        ) : (
          <Icons.EyeOff className="size-6" />
        ),
        keywords: ["privacy", "hide", "show", "balance", "toggle", "visibility"],
        label: isBalanceHidden ? "Show Balance" : "Hide Balance",
      },
      {
        title: "Theme → Light",
        href: "#theme-light",
        icon: <Icons.Sun className="size-6" />,
        keywords: ["theme", "light", "appearance", "mode"],
        label: "Theme → Light",
      },
      {
        title: "Theme → Dark",
        href: "#theme-dark",
        icon: <Icons.Moon className="size-6" />,
        keywords: ["theme", "dark", "appearance", "mode"],
        label: "Theme → Dark",
      },
      {
        title: "Theme → System",
        href: "#theme-system",
        icon: <Icons.Monitor className="size-6" />,
        keywords: ["theme", "system", "appearance", "mode", "auto"],
        label: "Theme → System",
      },
      {
        title: "Update Market Data",
        href: "#update-portfolio",
        icon: isUpdatingPortfolio ? (
          <Icons.Spinner className="size-6 animate-spin" />
        ) : (
          <Icons.Refresh className="size-6" />
        ),
        keywords: ["update", "portfolio", "market data", "quotes", "refresh"],
        label: isUpdatingPortfolio ? "Updating market data..." : "Update market data",
        disabled: isUpdatingPortfolio,
      },
      {
        title: "Recalculate Portfolio",
        href: "#recalculate-portfolio",
        icon: isRecalculatingPortfolio ? (
          <Icons.Spinner className="size-6 animate-spin" />
        ) : (
          <Icons.Clock className="size-6" />
        ),
        keywords: ["recalculate", "portfolio", "reprice", "history", "refresh"],
        label: isRecalculatingPortfolio ? "Recalculating portfolio..." : "Recalculate portfolio",
        disabled: isRecalculatingPortfolio,
      },
      {
        title: "Record Buy",
        href: buildTransactionUrl("BUY"),
        icon: <Icons.Plus className="size-6" />,
        keywords: ["buy", "purchase", "trade", "stock", "shares", "record"],
        label: "Record Buy",
      },
      {
        title: "Record Sell",
        href: buildTransactionUrl("SELL"),
        icon: <Icons.TrendingDown className="size-6" />,
        keywords: ["sell", "sale", "trade", "stock", "shares", "record"],
        label: "Record Sell",
      },
      {
        title: "Record Dividend",
        href: buildTransactionUrl("DIVIDEND"),
        icon: <Icons.Income className="size-6" />,
        keywords: ["dividend", "income", "payout", "distribution", "record"],
        label: "Record Dividend",
      },
      {
        title: "Record Deposit",
        href: buildTransactionUrl("DEPOSIT"),
        icon: <Icons.DollarSign className="size-6" />,
        keywords: ["deposit", "add", "money", "cash", "fund", "record"],
        label: "Record Deposit",
      },
      {
        title: "Record Withdrawal",
        href: buildTransactionUrl("WITHDRAWAL"),
        icon: <Icons.ArrowDown className="size-6" />,
        keywords: ["withdrawal", "withdraw", "money", "cash", "take out", "record"],
        label: "Record Withdrawal",
      },
      {
        title: "Add Holding",
        href: buildTransactionUrl("ADD_HOLDING"),
        icon: <Icons.Wallet className="size-6" />,
        keywords: ["holding", "add", "position", "import", "record"],
        label: "Add Holding",
      },
      {
        title: "Record Interest",
        href: buildTransactionUrl("INTEREST"),
        icon: <Icons.Percent className="size-6" />,
        keywords: ["interest", "income", "earned", "bank", "record"],
        label: "Record Interest",
      },
      {
        title: "Add Transaction",
        href: buildTransactionUrl(),
        icon: <Icons.Activity className="size-6" />,
        keywords: ["add", "new", "create", "transaction", "activity", "any"],
        label: "Add Transaction",
      },
      {
        title: "Import Activities",
        href: "/import",
        icon: <Icons.Import className="size-6" />,
        keywords: ["import", "csv", "upload", "file", "bulk"],
        label: "Import Activities",
      },
    ];

    const navItems = [
      ...(navigation.primary ?? []),
      ...(navigation.secondary ?? []),
      ...(navigation.addons ?? []),
    ] as LauncherActionItem[];

    return [...quickActions, ...navItems];
  }, [
    isBalanceHidden,
    isRecalculatingPortfolio,
    isUpdatingPortfolio,
    location.pathname,
    navigation,
  ]);

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
    setSearch("");
    setOpen(false);
    navigate(`/holdings/${encodeURIComponent(symbol)}`);
  };
  const handleSelectAccount = (accountId: string) => {
    if (!accountId) {
      return;
    }
    setSearch("");
    setOpen(false);
    navigate(`/accounts/${accountId}`);
  };

  const handleSelectAction = (path: string) => {
    if (!path) {
      return;
    }

    // Handle special toggle actions
    if (path === "#toggle-privacy") {
      toggleBalanceVisibility();
      setSearch("");
      setOpen(false);
      return;
    }

    if (path === "#theme-light") {
      updateSettings({ theme: "light" });
      setSearch("");
      setOpen(false);
      return;
    }

    if (path === "#theme-dark") {
      updateSettings({ theme: "dark" });
      setSearch("");
      setOpen(false);
      return;
    }

    if (path === "#theme-system") {
      updateSettings({ theme: "system" });
      setSearch("");
      setOpen(false);
      return;
    }

    if (path === "#update-portfolio") {
      if (isUpdatingPortfolio) {
        return;
      }
      updatePortfolio();
      setSearch("");
      setOpen(false);
      return;
    }

    if (path === "#recalculate-portfolio") {
      if (isRecalculatingPortfolio) {
        return;
      }
      recalculatePortfolio();
      setSearch("");
      setOpen(false);
      return;
    }

    setSearch("");
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
                    className: [
                      "text-muted-foreground mr-2 h-4 w-4",
                      (iconElement as React.ReactElement<{ className?: string }>).props.className,
                    ]
                      .filter(Boolean)
                      .join(" "),
                  })
                : null;

              // Use label if available, otherwise fall back to title
              const displayText = action.label ?? action.title;

              return (
                <CommandItem
                  key={action.href ?? index}
                  value={displayText}
                  keywords={action.keywords ?? []}
                  disabled={action.disabled}
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
                  keywords={[
                    holding.symbol,
                    holding.name ?? "",
                    "holding",
                    "asset",
                    "stock",
                  ].filter((keyword): keyword is string => Boolean(keyword))}
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
                    keywords={[
                      account.name,
                      account.accountType,
                      "account",
                    ].filter((keyword): keyword is string => Boolean(keyword))}
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
