import { useState } from "react";
import { Button, EmptyPlaceholder } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Dialog, DialogContent } from "@wealthfolio/ui/components/ui/dialog";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { AccountSelector } from "@/components/account-selector";
import { usePortfolioTargets } from "@/hooks/use-portfolio-targets";
import { useSettingsContext } from "@/lib/settings-provider";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import type { Account, PortfolioTarget } from "@/lib/types";

import { TargetForm } from "./components/target-form";
import { AllocationEditor } from "./components/allocation-editor";
import { DeviationTable } from "./components/deviation-table";
import { useTargetMutations } from "./use-target-mutations";

const AllocationsPage = () => {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const [selectedAccount, setSelectedAccount] = useState<Account | null>({
    id: PORTFOLIO_ACCOUNT_ID,
    name: "All Portfolio",
    accountType: "PORTFOLIO" as unknown as Account["accountType"],
    balance: 0,
    currency: baseCurrency,
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account);

  const accountId = selectedAccount?.id ?? PORTFOLIO_ACCOUNT_ID;
  const { targets, isLoading } = usePortfolioTargets(accountId);
  const { deleteTargetMutation } = useTargetMutations();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTarget, setEditingTarget] = useState<PortfolioTarget | null>(null);

  const activeTarget = targets.find((t) => t.isActive) ?? targets[0] ?? null;

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account);
  };

  const handleCreateSuccess = () => {
    setShowCreateDialog(false);
  };

  const handleEditSuccess = () => {
    setEditingTarget(null);
  };

  const handleDelete = (target: PortfolioTarget) => {
    deleteTargetMutation.mutate(target.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      {/* Account selector */}
      <div className="pointer-events-auto fixed right-2 top-4 z-20 hidden md:block lg:right-4">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

      <div className="mb-4 flex justify-end md:hidden">
        <AccountSelector
          selectedAccount={selectedAccount}
          setSelectedAccount={handleAccountSelect}
          variant="dropdown"
          includePortfolio={true}
          className="h-9"
        />
      </div>

      {!activeTarget ? (
        <div className="flex items-center justify-center py-16">
          <EmptyPlaceholder
            icon={<Icons.Target className="text-muted-foreground h-10 w-10" />}
            title="No allocation target"
            description="Create a target allocation to define your ideal portfolio mix and track deviations."
          >
            <Button onClick={() => setShowCreateDialog(true)}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Create Target
            </Button>
          </EmptyPlaceholder>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header with target name + actions */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{activeTarget.name}</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditingTarget(activeTarget)
                }
              >
                <Icons.Pencil className="mr-1 h-3 w-3" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(activeTarget)}
              >
                <Icons.Trash className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Target Editor */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Target Allocations</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationEditor
                  targetId={activeTarget.id}
                  taxonomyId={activeTarget.taxonomyId}
                />
              </CardContent>
            </Card>

            {/* Deviation View */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current vs Target</CardTitle>
              </CardHeader>
              <CardContent>
                <DeviationTable targetId={activeTarget.id} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <TargetForm accountId={accountId} onSuccess={handleCreateSuccess} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingTarget} onOpenChange={(open) => !open && setEditingTarget(null)}>
        <DialogContent>
          {editingTarget && (
            <TargetForm
              accountId={accountId}
              defaultValues={{
                id: editingTarget.id,
                name: editingTarget.name,
                accountId: editingTarget.accountId,
                taxonomyId: editingTarget.taxonomyId,
                isActive: editingTarget.isActive,
              }}
              onSuccess={handleEditSuccess}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AllocationsPage;
