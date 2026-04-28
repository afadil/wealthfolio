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
import { createPortfolioAccount, PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSettingsContext } from "@/lib/settings-provider";
import { ScrollArea } from "@wealthfolio/ui";
import { useAccounts } from "@/hooks/use-accounts";

interface IncomeMobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccount: Account | null;
  onAccountChange: (account: Account) => void;
}

export const IncomeMobileFilterSheet = ({
  open,
  onOpenChange,
  selectedAccount,
  onAccountChange,
}: IncomeMobileFilterSheetProps) => {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const { accounts } = useAccounts();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-[70vh] flex-col rounded-t-xl pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle>Filter Options</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 py-4">
          <div className="space-y-3">
            <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
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
                  onAccountChange(createPortfolioAccount(baseCurrency) as Account);
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
