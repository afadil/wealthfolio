import { useCallback, useState } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icons,
  worldCurrencies,
} from "@wealthfolio/ui";
import { useAccounts } from "@/hooks/use-accounts";
import { useTranslation } from "react-i18next";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportToolbarProps {
  selectedCount: number;
  onSkip: () => void;
  onUnskip: () => void;
  onForceImport?: () => void;
  onSetCurrency: (currency: string) => void;
  onSetAccount: (accountId: string) => void;
  onClearSelection: () => void;
}

// Common currencies for quick access
const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY"];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function ImportToolbar({
  selectedCount,
  onSkip,
  onUnskip,
  onForceImport,
  onSetCurrency,
  onSetAccount,
  onClearSelection,
}: ImportToolbarProps) {
  const { t } = useTranslation("common");
  const { accounts } = useAccounts({ filterActive: true, includeArchived: false });
  const [currencySearch, setCurrencySearch] = useState("");

  // Prevent mousedown from bubbling to document, which would clear DataGrid selection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Filter currencies based on search
  const filteredCurrencies = currencySearch
    ? worldCurrencies.filter(
        (c) =>
          c.value.toLowerCase().includes(currencySearch.toLowerCase()) ||
          c.label.toLowerCase().includes(currencySearch.toLowerCase()),
      )
    : worldCurrencies;

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
      onMouseDown={handleMouseDown}
    >
      {/* Selection info */}
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icons.CheckSquare className="h-4 w-4" />
        <span className="font-medium">
          {t("import.toolbar.selection_count", { count: selectedCount })}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        {/* Skip button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          title={t("import.toolbar.title_skip")}
          className="h-8"
        >
          <Icons.MinusCircle className="mr-1.5 h-3.5 w-3.5" />
          {t("import.toolbar.skip")}
        </Button>

        {/* Unskip button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onUnskip}
          title={t("import.toolbar.title_unskip")}
          className="h-8"
        >
          <Icons.PlusCircle className="mr-1.5 h-3.5 w-3.5" />
          {t("import.toolbar.unskip")}
        </Button>

        {/* Import anyway button — only shown when the handler is provided (duplicate filter active) */}
        {onForceImport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onForceImport}
            title={t("import.toolbar.title_force_import")}
            className="h-8 border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
          >
            <Icons.ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
            {t("import.toolbar.import_anyway")}
          </Button>
        )}

        <div className="bg-border mx-1 h-5 w-px" />

        {/* Currency dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              title={t("import.toolbar.title_set_currency")}
              className="h-8"
            >
              <Icons.DollarSign className="mr-1.5 h-3.5 w-3.5" />
              {t("import.toolbar.currency")}
              <Icons.ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Search input */}
            <div className="px-2 py-1.5">
              <input
                type="text"
                placeholder={t("import.toolbar.search_currencies")}
                value={currencySearch}
                onChange={(e) => setCurrencySearch(e.target.value)}
                className="bg-muted/50 focus:ring-ring w-full rounded-md border px-2 py-1 text-sm outline-none focus:ring-1"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <DropdownMenuSeparator />
            {/* Common currencies */}
            {!currencySearch && (
              <>
                <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
                  {t("import.toolbar.common")}
                </div>
                {COMMON_CURRENCIES.map((code) => (
                  <DropdownMenuItem
                    key={code}
                    onSelect={() => {
                      onSetCurrency(code);
                      setCurrencySearch("");
                    }}
                  >
                    <span className="font-mono">{code}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
                  {t("import.toolbar.all_currencies")}
                </div>
              </>
            )}
            {/* Filtered/All currencies */}
            <div className="max-h-48 overflow-y-auto">
              {filteredCurrencies.slice(0, 20).map((currency) => (
                <DropdownMenuItem
                  key={currency.value}
                  onSelect={() => {
                    onSetCurrency(currency.value);
                    setCurrencySearch("");
                  }}
                >
                  <span className="font-mono">{currency.value}</span>
                  <span className="text-muted-foreground ml-2 truncate text-xs">
                    {currency.label.replace(` (${currency.value})`, "")}
                  </span>
                </DropdownMenuItem>
              ))}
              {filteredCurrencies.length > 20 && (
                <div className="text-muted-foreground px-2 py-1 text-xs">
                  {t("import.toolbar.search_more_hint")}
                </div>
              )}
              {filteredCurrencies.length === 0 && (
                <div className="text-muted-foreground px-2 py-1 text-xs">
                  {t("import.toolbar.no_currencies_found")}
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Account dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              title={t("import.toolbar.title_set_account")}
              className="h-8"
            >
              <Icons.Briefcase className="mr-1.5 h-3.5 w-3.5" />
              {t("import.toolbar.account")}
              <Icons.ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {accounts.length === 0 ? (
              <div className="text-muted-foreground px-2 py-3 text-center text-sm">
                {t("import.toolbar.no_accounts")}
              </div>
            ) : (
              accounts.map((account) => (
                <DropdownMenuItem key={account.id} onSelect={() => onSetAccount(account.id)}>
                  <Icons.Briefcase className="mr-2 h-3.5 w-3.5" />
                  <span className="truncate">{account.name}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{account.currency}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="bg-border mx-1 h-5 w-px" />

        {/* Clear selection button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          title={t("import.toolbar.title_clear_selection")}
          className="h-8 px-2"
        >
          <Icons.X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Menu Component
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onSkip: () => void;
  onUnskip: () => void;
  onForceImport?: () => void;
  onSetCurrency: (currency: string) => void;
  onSetAccount: (accountId: string) => void;
}

export function ImportContextMenu({
  open,
  position,
  onOpenChange,
  selectedCount,
  onSkip,
  onUnskip,
  onForceImport,
  onSetCurrency,
  onSetAccount,
}: ImportContextMenuProps) {
  const { t } = useTranslation("common");
  const { accounts } = useAccounts({ filterActive: true, includeArchived: false });

  if (!open || selectedCount === 0) return null;

  const triggerStyle: React.CSSProperties = {
    position: "fixed",
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: "1px",
    height: "1px",
    padding: 0,
    margin: 0,
    border: "none",
    background: "transparent",
    pointerEvents: "none",
    opacity: 0,
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger style={triggerStyle} />
      <DropdownMenuContent align="start" className="w-52">
        <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
          {t("import.toolbar.selection_count", { count: selectedCount })}
        </div>
        <DropdownMenuSeparator />

        {/* Skip/Unskip actions */}
        <DropdownMenuItem onSelect={onSkip}>
          <Icons.MinusCircle className="mr-2 h-4 w-4" />
          {t("import.context_menu.skip_selected")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onUnskip}>
          <Icons.PlusCircle className="mr-2 h-4 w-4" />
          {t("import.context_menu.unskip_selected")}
        </DropdownMenuItem>
        {onForceImport && (
          <DropdownMenuItem onSelect={onForceImport} className="text-amber-700 dark:text-amber-400">
            <Icons.ShieldAlert className="mr-2 h-4 w-4" />
            {t("import.context_menu.import_anyway")}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* Currency submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icons.DollarSign className="mr-2 h-4 w-4" />
            {t("import.context_menu.set_currency")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {COMMON_CURRENCIES.map((code) => (
              <DropdownMenuItem key={code} onSelect={() => onSetCurrency(code)}>
                <span className="font-mono">{code}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Account submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icons.Briefcase className="mr-2 h-4 w-4" />
            {t("import.context_menu.set_account")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {accounts.length === 0 ? (
              <div className="text-muted-foreground px-2 py-2 text-xs">
                {t("import.toolbar.no_accounts")}
              </div>
            ) : (
              accounts.map((account) => (
                <DropdownMenuItem key={account.id} onSelect={() => onSetAccount(account.id)}>
                  <span className="truncate">{account.name}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{account.currency}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ImportToolbar;
