import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@wealthfolio/ui";
import { useEffect, useState } from "react";

interface ActivityMobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccounts: string[];
  accounts: Account[];
  setSelectedAccounts: (accountIds: string[]) => void;
  selectedActivityTypes: ActivityType[];
  setSelectedActivityTypes: (types: ActivityType[]) => void;
}

export const ActivityMobileFilterSheet = ({
  open,
  onOpenChange,
  selectedAccounts,
  accounts,
  setSelectedAccounts,
  selectedActivityTypes,
  setSelectedActivityTypes,
}: ActivityMobileFilterSheetProps) => {
  // Local state for temporary selections
  const [localAccounts, setLocalAccounts] = useState<string[]>(selectedAccounts);
  const [localActivityTypes, setLocalActivityTypes] =
    useState<ActivityType[]>(selectedActivityTypes);

  // Sync local state when sheet opens
  useEffect(() => {
    if (open) {
      setLocalAccounts(selectedAccounts);
      setLocalActivityTypes(selectedActivityTypes);
    }
  }, [open, selectedAccounts, selectedActivityTypes]);

  const handleApply = () => {
    setSelectedAccounts(localAccounts);
    setSelectedActivityTypes(localActivityTypes);
    onOpenChange(false);
  };

  const activityTypeOptions = Object.entries(ActivityTypeNames).map(([value, label]) => ({
    label,
    value: value as ActivityType,
  }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-1 flex h-[80vh] flex-col rounded-t-4xl">
        <SheetHeader className="text-left">
          <SheetTitle>Filter Activities</SheetTitle>
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
                    localAccounts.length === 0 ? "bg-accent" : "hover:bg-accent/50",
                  )}
                  onClick={() => {
                    setLocalAccounts([]);
                  }}
                >
                  <span>All Accounts</span>
                  {localAccounts.length === 0 && <Icons.Check className="h-4 w-4" />}
                </li>
                {accounts
                  .filter((account) => account.isActive)
                  .map((account) => (
                    <li
                      key={account.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm",
                        localAccounts.includes(account.id) ? "bg-accent" : "hover:bg-accent/50",
                      )}
                      onClick={() => {
                        const newAccounts = localAccounts.includes(account.id)
                          ? localAccounts.filter((id) => id !== account.id)
                          : [...localAccounts, account.id];
                        setLocalAccounts(newAccounts);
                      }}
                    >
                      <span>
                        {account.name} ({account.currency})
                      </span>
                      {localAccounts.includes(account.id) && <Icons.Check className="h-4 w-4" />}
                    </li>
                  ))}
              </ul>
            </div>

            {/* Activity Type Filter Section */}
            <div>
              <h4 className="mb-3 font-medium">Activity Type</h4>
              <ul className="space-y-1">
                <li
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm",
                    localActivityTypes.length === 0 ? "bg-accent" : "hover:bg-accent/50",
                  )}
                  onClick={() => {
                    setLocalActivityTypes([]);
                  }}
                >
                  <span>All Types</span>
                  {localActivityTypes.length === 0 && <Icons.Check className="h-4 w-4" />}
                </li>
                {activityTypeOptions.map((type) => (
                  <li
                    key={type.value}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm",
                      localActivityTypes.includes(type.value) ? "bg-accent" : "hover:bg-accent/50",
                    )}
                    onClick={() => {
                      const newTypes = localActivityTypes.includes(type.value)
                        ? localActivityTypes.filter((t) => t !== type.value)
                        : [...localActivityTypes, type.value];
                      setLocalActivityTypes(newTypes);
                    }}
                  >
                    <span>{type.label}</span>
                    {localActivityTypes.includes(type.value) && <Icons.Check className="h-4 w-4" />}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
        <SheetFooter className="mt-auto">
          <Button className="w-full" onClick={handleApply}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
