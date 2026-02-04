import { AccountSelector } from "@/components/account-selector";
import { useAccounts } from "@/hooks/use-accounts";
import { useSettings } from "@/hooks/use-settings";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import type { Account } from "@/lib/types";
import {
  Button,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
import { useMemo, useState } from "react";
import { AssetClassTargetCard } from "./components/asset-class-target-card";
import { calculateAssetClassComposition } from "./hooks/use-allocation-calculations";
import { useAssetClassTargets, useHoldingsForAllocation } from "./hooks/use-asset-class-queries";

export default function AllocationPage() {
  const { accounts } = useAccounts(true);
  const { data: settings } = useSettings();

  // Create "All Portfolio" account as default
  const createPortfolioAccount = (): Account => ({
    id: PORTFOLIO_ACCOUNT_ID,
    name: "All Portfolio",
    accountType: "PORTFOLIO" as unknown as Account["accountType"],
    balance: 0,
    currency: settings?.baseCurrency ?? "USD",
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  // Initialize with "All Portfolio" selected by default
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(createPortfolioAccount());

  const selectedAccountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;

  // Get targets for selected account (now uses accountId correctly)
  const { data: targets = [], isLoading: targetsLoading } = useAssetClassTargets(
    selectedAccountId
  );

  // Fetch holdings for selected account
  const { data: holdings = [], isLoading: holdingsLoading } = useHoldingsForAllocation(
    selectedAccountId
  );

  // Calculate composition
  const composition = useMemo(() => {
    if (!targets || !holdings) return [];
    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    return calculateAssetClassComposition(targets, holdings, totalValue);
  }, [targets, holdings]);

  const isLoading = targetsLoading || holdingsLoading;

  if (isLoading && !selectedAccount) {
    return (
      <div className="space-y-6 p-8">
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="space-y-6 p-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portfolio Allocations</h1>
          <p className="text-muted-foreground mt-2">
            Set target allocations and rebalance your portfolio efficiently.
          </p>
        </div>
        <Separator />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold mb-2">No accounts found</p>
          <p className="text-sm">
            Please create an account in the Portfolio section first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Portfolio Allocations</h1>
        <p className="text-muted-foreground mt-2">
          Set target allocations and rebalance your portfolio efficiently.
        </p>
      </div>

      <Separator />

      {/* Account Selector (with "All Portfolio" as default) */}
      <AccountSelector
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        variant="dropdown"
        includePortfolio={true}
        filterActive={true}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
        </div>
      )}

      {!isLoading && selectedAccount && (
        <>
          {/* Tabs */}
          <Tabs defaultValue="targets" className="space-y-4">
            <TabsList>
              <TabsTrigger value="targets">Targets</TabsTrigger>
              <TabsTrigger value="composition">Composition</TabsTrigger>
              <TabsTrigger value="rebalancing">Rebalancing</TabsTrigger>
            </TabsList>

            <TabsContent value="targets" className="space-y-4">
              {composition.length === 0 ? (
                <div className="text-center py-12 rounded-lg border border-dashed">
                  <p className="text-muted-foreground mb-4">No allocation targets set</p>
                  <Button disabled>Create Allocation (Phase 2)</Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {composition.map((comp) => (
                    <AssetClassTargetCard key={comp.assetClass} composition={comp} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="composition" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                View how your current holdings break down by asset class.
              </p>
              {composition.length === 0 ? (
                <div className="text-center py-12 rounded-lg border border-dashed">
                  <p className="text-muted-foreground">No holdings data available</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {composition.map((comp) => (
                    <AssetClassTargetCard key={comp.assetClass} composition={comp} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="rebalancing" className="space-y-4">
              <div className="text-center py-12 rounded-lg border border-dashed">
                <p className="text-muted-foreground">
                  Rebalancing suggestions coming in Phase 2
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
