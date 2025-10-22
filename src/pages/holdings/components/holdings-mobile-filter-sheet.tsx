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
import { ScrollArea } from "@wealthfolio/ui";

interface HoldingsMobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccount: Account | null;
  accounts: Account[];
  onAccountChange: (account: Account) => void;
  selectedTypes: string[];
  setSelectedTypes: (types: string[]) => void;
}

export const HoldingsMobileFilterSheet = ({
  open,
  onOpenChange,
  selectedAccount,
  accounts,
  onAccountChange,
  selectedTypes,
  setSelectedTypes,
}: HoldingsMobileFilterSheetProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[80vh] flex-col rounded-t-xl">
        <SheetHeader className="text-left">
          <SheetTitle>Filter Holdings</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 py-4">
          <div className="space-y-6 pr-4">
            {/* Account Filter Section */}
            <div>
              <h4 className="mb-3 font-medium">Account</h4>
              <ul className="space-y-1">
                <li
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm",
                    selectedAccount?.id === PORTFOLIO_ACCOUNT_ID
                      ? "bg-accent"
                      : "hover:bg-accent/50",
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
                  <span>All Portfolio</span>
                  {selectedAccount?.id === PORTFOLIO_ACCOUNT_ID && (
                    <Icons.Check className="h-4 w-4" />
                  )}
                </li>
                {accounts.map((account) => (
                  <li
                    key={account.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm",
                      selectedAccount?.id === account.id ? "bg-accent" : "hover:bg-accent/50",
                    )}
                    onClick={() => {
                      onAccountChange(account);
                      onOpenChange(false);
                    }}
                  >
                    <span>{account.name}</span>
                    {selectedAccount?.id === account.id && <Icons.Check className="h-4 w-4" />}
                  </li>
                ))}
              </ul>
            </div>

            {/* Asset Type Filter Section */}
            <div>
              <h4 className="mb-3 font-medium">Asset Type</h4>
              <ul className="space-y-1">
                <li
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm",
                    selectedTypes.length === 0 ? "bg-accent" : "hover:bg-accent/50",
                  )}
                  onClick={() => {
                    setSelectedTypes([]);
                    onOpenChange(false);
                  }}
                >
                  <span>All Types</span>
                  {selectedTypes.length === 0 && <Icons.Check className="h-4 w-4" />}
                </li>
                {ASSET_SUBCLASS_TYPES.map((type) => (
                  <li
                    key={type.value}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm",
                      selectedTypes.includes(type.value) ? "bg-accent" : "hover:bg-accent/50",
                    )}
                    onClick={() => {
                      const newTypes = selectedTypes.includes(type.value)
                        ? selectedTypes.filter((t) => t !== type.value)
                        : [...selectedTypes, type.value];
                      setSelectedTypes(newTypes);
                    }}
                  >
                    <span>{type.label}</span>
                    {selectedTypes.includes(type.value) && <Icons.Check className="h-4 w-4" />}
                  </li>
                ))}
              </ul>
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
