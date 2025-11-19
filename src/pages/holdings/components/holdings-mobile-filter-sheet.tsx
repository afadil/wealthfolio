import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ASSET_SUBCLASS_TYPES, PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatedToggleGroup, ScrollArea, Separator } from "@wealthfolio/ui";

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
}: HoldingsMobileFilterSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[85vh] flex-col rounded-t-xl">
        <SheetHeader className="text-left">
          <SheetTitle>Display Options</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 py-4">
          <div className="space-y-6">
            {/* View Settings */}
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Sort By
                </h4>
                <AnimatedToggleGroup
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as "symbol" | "marketValue")}
                  items={[
                    { value: "marketValue", label: "Market Value" },
                    { value: "symbol", label: "Symbol" },
                  ]}
                  size="sm"
                  className="inline-flex w-auto"
                />
              </div>

              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Return View
                </h4>
                <AnimatedToggleGroup
                  value={showTotalReturn ? "total" : "daily"}
                  onValueChange={(value) => setShowTotalReturn(value === "total")}
                  items={[
                    { value: "total", label: "Total Return" },
                    { value: "daily", label: "Daily Return" },
                  ]}
                  size="sm"
                  className="inline-flex w-auto"
                />
              </div>
            </div>

            <Separator />

            {/* Account Filter Section */}
            {showAccountFilter && (
              <div className="space-y-3">
                <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Account
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
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Icons.LayoutDashboard className="text-muted-foreground h-4 w-4" />
                      All Portfolio
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
            <div className="space-y-3">
              <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                Asset Type
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
                  <span>All Types</span>
                  {selectedTypes.length === 0 && <Icons.Check className="text-primary h-4 w-4" />}
                </div>
                {ASSET_SUBCLASS_TYPES.map((type) => (
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
          </div>
        </ScrollArea>
        <SheetFooter className="mt-auto">
          <SheetClose asChild>
            <Button className="w-full">Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
