import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { createPortfolioAccount, HOLDING_CATEGORY_FILTERS, PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { Account, HoldingCategoryFilterId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSettingsContext } from "@/lib/settings-provider";
import { AnimatedToggleGroup, ScrollArea, Separator } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";

interface HoldingsMobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccount: Account | null;
  accounts: Account[];
  onAccountChange: (account: Account) => void;
  selectedTypes: string[];
  setSelectedTypes: (types: string[]) => void;
  showAccountFilter?: boolean;
  sortBy: "symbol" | "marketValue";
  setSortBy: (value: "symbol" | "marketValue") => void;
  showTotalReturn: boolean;
  setShowTotalReturn: (value: boolean) => void;
  categoryFilter?: HoldingCategoryFilterId;
  setCategoryFilter?: (value: HoldingCategoryFilterId) => void;
  typeOptions?: { value: string; label: string }[];
}

export const HoldingsMobileFilterSheet = ({
  open,
  onOpenChange,
  selectedAccount,
  accounts,
  onAccountChange,
  selectedTypes,
  setSelectedTypes,
  showAccountFilter = true,
  sortBy,
  setSortBy,
  showTotalReturn,
  setShowTotalReturn,
  categoryFilter = "investments",
  setCategoryFilter,
  typeOptions,
}: HoldingsMobileFilterSheetProps) => {
  const { t } = useTranslation("common");
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[85vh] flex-col rounded-t-xl pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{t("holdings.mobile.display_options")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 py-4">
          <div className="space-y-6">
            {/* View Settings */}
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  {t("holdings.mobile.sort_by")}
                </h4>
                <AnimatedToggleGroup<"symbol" | "marketValue">
                  value={sortBy}
                  onValueChange={setSortBy}
                  items={[
                    { value: "marketValue", label: t("holdings.mobile.market_value") },
                    { value: "symbol", label: t("holdings.mobile.symbol") },
                  ]}
                  size="sm"
                  className="inline-flex w-auto"
                />
              </div>

              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  {t("holdings.mobile.return_view")}
                </h4>
                <AnimatedToggleGroup
                  value={showTotalReturn ? "total" : "daily"}
                  onValueChange={(value) => setShowTotalReturn(value === "total")}
                  items={[
                    { value: "total", label: t("holdings.mobile.total_return") },
                    { value: "daily", label: t("holdings.mobile.daily_return") },
                  ]}
                  size="sm"
                  className="inline-flex w-auto"
                />
              </div>
            </div>

            <Separator />

            {/* Category Filter Section */}
            {setCategoryFilter && (
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  {t("holdings.mobile.category")}
                </h4>
                <div className="overflow-hidden rounded-lg border">
                  {HOLDING_CATEGORY_FILTERS.map((filter, index) => (
                    <div
                      key={filter.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between p-3 text-sm transition-colors",
                        index > 0 && "border-t",
                        categoryFilter === filter.id
                          ? "bg-accent/50 font-medium"
                          : "hover:bg-muted/50",
                      )}
                      onClick={() => {
                        setCategoryFilter(filter.id);
                      }}
                    >
                      <span>{t(`holdings.filter.category.${filter.id}`)}</span>
                      {categoryFilter === filter.id && (
                        <Icons.Check className="text-primary h-4 w-4" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {setCategoryFilter && <Separator />}

            {/* Account Filter Section */}
            {showAccountFilter && (
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  {t("holdings.mobile.account")}
                </h4>
                <div className="overflow-hidden rounded-lg border">
                  <div
                    className={cn(
                      "flex cursor-pointer items-center justify-between p-3 text-sm transition-colors",
                      selectedAccount?.id === PORTFOLIO_ACCOUNT_ID
                        ? "bg-accent/50 font-medium"
                        : "hover:bg-muted/50",
                    )}
                    onClick={() => {
                      onAccountChange({
                        ...(createPortfolioAccount(baseCurrency) as Account),
                        name: t("account.selector.all_portfolio"),
                      });
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
                      {t("account.selector.all_portfolio")}
                    </span>
                    {selectedAccount?.id === PORTFOLIO_ACCOUNT_ID && (
                      <Icons.Check className="text-primary h-4 w-4" />
                    )}
                  </div>
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between border-t p-3 text-sm transition-colors",
                        selectedAccount?.id === account.id
                          ? "bg-accent/50 font-medium"
                          : "hover:bg-muted/50",
                      )}
                      onClick={() => {
                        onAccountChange(account);
                        onOpenChange(false);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <Icons.Wallet className="text-muted-foreground h-4 w-4" />
                        {account.name}
                      </span>
                      {selectedAccount?.id === account.id && (
                        <Icons.Check className="text-primary h-4 w-4" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Asset Type Filter Section */}
            {typeOptions && typeOptions.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  {t("holdings.mobile.asset_type")}
                </h4>
                <div className="overflow-hidden rounded-lg border">
                  <div
                    className={cn(
                      "flex cursor-pointer items-center justify-between p-3 text-sm transition-colors",
                      selectedTypes.length === 0 ? "bg-accent/50 font-medium" : "hover:bg-muted/50",
                    )}
                    onClick={() => {
                      setSelectedTypes([]);
                      onOpenChange(false);
                    }}
                  >
                    <span>{t("holdings.mobile.all_types")}</span>
                    {selectedTypes.length === 0 && <Icons.Check className="text-primary h-4 w-4" />}
                  </div>
                  {typeOptions.map((type) => (
                    <div
                      key={type.value}
                      className={cn(
                        "flex cursor-pointer items-center justify-between border-t p-3 text-sm transition-colors",
                        selectedTypes.includes(type.value)
                          ? "bg-accent/50 font-medium"
                          : "hover:bg-muted/50",
                      )}
                      onClick={() => {
                        const newTypes = selectedTypes.includes(type.value)
                          ? selectedTypes.filter((t) => t !== type.value)
                          : [...selectedTypes, type.value];
                        setSelectedTypes(newTypes);
                      }}
                    >
                      <span>{type.label}</span>
                      {selectedTypes.includes(type.value) && (
                        <Icons.Check className="text-primary h-4 w-4" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <SheetFooter className="mt-auto">
          <SheetClose asChild>
            <Button className="w-full">{t("holdings.mobile.done")}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
