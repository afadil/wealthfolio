import { getRebalancingStrategies, saveRebalancingStrategy } from "@/commands/rebalancing";
import { AccountSelector } from "@/components/account-selector";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, AccountType } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@wealthfolio/ui";
import { useEffect, useMemo, useState } from "react";
import { AssetClassForm } from "./components/asset-class-form";
import { AssetClassTargetCard } from "./components/asset-class-target-card";
import {
  useAssetClassMutations,
  useAssetClassTargets,
  useHoldingsForAllocation,
  useRebalancingStrategy,
} from "./hooks";
import { calculateAssetClassComposition } from "./hooks/use-current-allocation";

const createPortfolioAccount = (): Account => ({
  id: PORTFOLIO_ACCOUNT_ID,
  name: "All Portfolio",
  accountType: "portfolio" as AccountType,
  balance: 0,
  currency: "USD",
  isDefault: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export default function AllocationPage() {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(
    createPortfolioAccount()
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const selectedAccountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;

  // Auto-create strategy for account if it doesn't exist
  useEffect(() => {
    const ensureStrategy = async () => {
      if (!selectedAccount || selectedAccount.id === PORTFOLIO_ACCOUNT_ID) {
        return; // Skip for portfolio view
      }

      try {
        const strategies = await getRebalancingStrategies();
        const exists = strategies.some((s) => s.accountId === selectedAccountId);

        if (!exists) {
          console.log("Creating strategy for account:", selectedAccountId, selectedAccount.name);
          await saveRebalancingStrategy({
            name: `${selectedAccount.name} Allocation Strategy`,
            accountId: selectedAccountId,
            isActive: true,
          } as any);

          // Invalidate strategy queries to force refetch
          queryClient.invalidateQueries({
            queryKey: [QueryKeys.REBALANCING_STRATEGIES],
          });
        }
      } catch (err) {
        console.error("Failed to ensure strategy:", err);
      }
    };

    ensureStrategy();
  }, [selectedAccountId, selectedAccount, queryClient]);

  const { data: targets = [], isLoading: targetsLoading } =
    useAssetClassTargets(selectedAccountId);
  const { data: holdings = [], isLoading: holdingsLoading } =
    useHoldingsForAllocation(selectedAccountId);
  const { saveTargetMutation, deleteTargetMutation } =
    useAssetClassMutations();
  const { data: strategy } = useRebalancingStrategy(selectedAccountId);

  const composition = useMemo(() => {
    if (!targets || !holdings) return [];
    const totalValue = holdings.reduce(
      (sum, h) => sum + (h.marketValue?.base || 0),
      0
    );
    return calculateAssetClassComposition(targets, holdings, totalValue);
  }, [targets, holdings]);

  const isLoading = targetsLoading || holdingsLoading;
  const isMutating = saveTargetMutation.isPending || deleteTargetMutation.isPending;

  const handleOpenForm = (assetClass?: string) => {
    if (assetClass) {
      setEditingTarget(assetClass);
    } else {
      setEditingTarget(null);
    }
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingTarget(null);
  };

  const handleFormSubmit = async (formData: any) => {
    if (!strategy?.id) {
      console.error("No strategy ID available");
      return;
    }
    await saveTargetMutation.mutateAsync({
      strategyId: strategy.id,
      assetClass: formData.assetClass,
      targetPercent: formData.targetPercent,
    });
  };

  const handleDelete = async (assetClass: string) => {
    if (confirm(`Delete ${assetClass} allocation target?`)) {
      const targetToDelete = targets.find((t) => t.assetClass === assetClass);
      if (targetToDelete) {
        await deleteTargetMutation.mutateAsync(targetToDelete.id);
      }
    }
  };

  const editingTargetData = editingTarget
    ? targets.find((t) => t.assetClass === editingTarget)
    : null;

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Allocations</h1>
        <p className="text-muted-foreground">
          Manage your strategic asset allocation targets and track actual
          holdings.
        </p>
      </div>

      {/* Account Selector - Standalone */}
      <AccountSelector
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        includePortfolio={true}
        variant="button"
        buttonText={selectedAccount?.name || "Select Account"}
      />

      {/* Tabs */}
      <Tabs defaultValue="targets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="composition">Composition</TabsTrigger>
          <TabsTrigger value="rebalancing">Rebalancing</TabsTrigger>
        </TabsList>

        {/* Targets Tab */}
        <TabsContent value="targets" className="space-y-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>
          )}

          {!isLoading && composition.length === 0 && (
            <div className="text-center py-12 rounded-lg border border-dashed">
              <p className="text-muted-foreground mb-4">
                No allocation targets set
              </p>
              <Button
                onClick={() => handleOpenForm()}
                disabled={isMutating}
              >
                Create Allocation Target
              </Button>
            </div>
          )}

          {!isLoading && composition.length > 0 && (
            <div className="space-y-4">
              <Button
                onClick={() => handleOpenForm()}
                disabled={isMutating}
              >
                Create Allocation Target
              </Button>
              <div className="grid gap-4">
                {composition.map((comp) => (
                  <AssetClassTargetCard
                    key={comp.assetClass}
                    composition={comp}
                    onEdit={() => handleOpenForm(comp.assetClass)}
                    onDelete={() => handleDelete(comp.assetClass)}
                    isLoading={isMutating}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Composition Tab */}
        <TabsContent value="composition" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            View how your current holdings break down by asset class.
          </p>
          <div className="text-center py-12 rounded-lg border border-dashed">
            <p className="text-muted-foreground">
              Holdings breakdown coming in Phase 2
            </p>
          </div>
        </TabsContent>

        {/* Rebalancing Tab */}
        <TabsContent value="rebalancing" className="space-y-4">
          <div className="text-center py-12 rounded-lg border border-dashed">
            <p className="text-muted-foreground">
              Rebalancing suggestions coming in Phase 2
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Asset Class Form Modal */}
      <AssetClassForm
        open={formOpen}
        onOpenChange={handleCloseForm}
        onSubmit={handleFormSubmit}
        existingTargets={targets}
        editingTarget={editingTargetData || null}
        isLoading={isMutating}
        strategyId={strategy?.id}
      />
    </div>
  );
}
