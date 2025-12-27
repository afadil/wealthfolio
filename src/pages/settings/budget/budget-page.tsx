import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBudgetSummary } from "@/commands/budget";
import { getExpenseCategories, getIncomeCategories } from "@/commands/category";
import { QueryKeys } from "@/lib/query-keys";
import { BudgetSummary, Category, BudgetAllocationWithCategory } from "@/lib/types";
import { useSettings } from "@/hooks/use-settings";
import { useSettingsContext } from "@/lib/settings-provider";
import { SettingsHeader } from "../settings-header";
import { Separator, Skeleton, Button, Icons, Tabs, TabsContent, TabsList, TabsTrigger, Label, RadioGroup, RadioGroupItem } from "@wealthfolio/ui";
import { BudgetTargetForm } from "./components/budget-target-form";
import { AllocationList } from "./components/allocation-list";
import { AllocationFormDialog } from "./components/allocation-form-dialog";
import { useBudgetMutations } from "./use-budget-mutations";

const BudgetPage = () => {
  const { data: settings, isLoading: isLoadingSettings } = useSettings();
  const { updateSettings } = useSettingsContext();
  const currency = settings?.baseCurrency ?? "USD";
  const varianceTolerance = settings?.budgetVarianceTolerance ?? 10;

  const { data: budgetSummary, isLoading: isLoadingSummary } = useQuery<BudgetSummary, Error>({
    queryKey: [QueryKeys.BUDGET_SUMMARY],
    queryFn: getBudgetSummary,
  });

  const { data: expenseCategories = [], isLoading: isLoadingExpenseCategories } = useQuery<
    Category[],
    Error
  >({
    queryKey: [QueryKeys.EXPENSE_CATEGORIES],
    queryFn: getExpenseCategories,
  });

  const { data: incomeCategories = [], isLoading: isLoadingIncomeCategories } = useQuery<
    Category[],
    Error
  >({
    queryKey: [QueryKeys.INCOME_CATEGORIES],
    queryFn: getIncomeCategories,
  });

  const { upsertConfigMutation, setAllocationMutation, deleteAllocationMutation } =
    useBudgetMutations();

  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<
    BudgetAllocationWithCategory | undefined
  >();

  const isLoading =
    isLoadingSettings ||
    isLoadingSummary ||
    isLoadingExpenseCategories ||
    isLoadingIncomeCategories;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const handleAddAllocation = () => {
    setEditingAllocation(undefined);
    setDialogOpen(true);
  };

  const handleEditAllocation = (allocation: BudgetAllocationWithCategory) => {
    setEditingAllocation(allocation);
    setDialogOpen(true);
  };

  const handleSaveAllocation = (categoryId: string, amount: number) => {
    setAllocationMutation.mutate({ categoryId, amount });
  };

  const handleDeleteAllocation = (categoryId: string) => {
    deleteAllocationMutation.mutate(categoryId);
  };

  const currentCategories = activeTab === "expense" ? expenseCategories : incomeCategories;
  const currentAllocations =
    activeTab === "expense"
      ? budgetSummary?.expenseAllocations ?? []
      : budgetSummary?.incomeAllocations ?? [];

  const hasConfig = budgetSummary?.config != null;

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader
          heading="Budget"
          text="Set your monthly spending and income targets, then allocate to categories."
        />
        <Separator />

        <BudgetTargetForm
          config={budgetSummary?.config ?? null}
          currency={currency}
          onSave={(config) => upsertConfigMutation.mutate(config)}
          isPending={upsertConfigMutation.isPending}
        />

        <Separator />

        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold">Budget Tolerance</h3>
            <p className="text-muted-foreground text-sm">
              How close to your budget counts as "on track"? This affects the color coding in budget reports.
            </p>
          </div>
          <RadioGroup
            value={varianceTolerance.toString()}
            onValueChange={(value) => updateSettings({ budgetVarianceTolerance: parseInt(value) })}
            className="flex gap-4"
          >
            {[5, 10, 15].map((pct) => (
              <div key={pct} className="flex items-center space-x-2">
                <RadioGroupItem value={pct.toString()} id={`tolerance-${pct}`} />
                <Label htmlFor={`tolerance-${pct}`} className="cursor-pointer">
                  ±{pct}%
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {hasConfig && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Category Allocations</h3>
                <Button onClick={handleAddAllocation} size="sm">
                  <Icons.Plus className="mr-2 h-4 w-4" />
                  Add Allocation
                </Button>
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "expense" | "income")}
              >
                <TabsList>
                  <TabsTrigger value="expense">Spending</TabsTrigger>
                  <TabsTrigger value="income">Income</TabsTrigger>
                </TabsList>

                <TabsContent value="expense" className="mt-4">
                  <AllocationList
                    allocations={budgetSummary?.expenseAllocations ?? []}
                    unallocated={budgetSummary?.unallocatedSpending ?? 0}
                    currency={currency}
                    onEdit={handleEditAllocation}
                    onDelete={handleDeleteAllocation}
                    isDeleting={deleteAllocationMutation.isPending}
                  />
                </TabsContent>

                <TabsContent value="income" className="mt-4">
                  <AllocationList
                    allocations={budgetSummary?.incomeAllocations ?? []}
                    unallocated={budgetSummary?.unallocatedIncome ?? 0}
                    currency={currency}
                    onEdit={handleEditAllocation}
                    onDelete={handleDeleteAllocation}
                    isDeleting={deleteAllocationMutation.isPending}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>

      <AllocationFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveAllocation}
        categories={currentCategories}
        existingAllocations={currentAllocations}
        editingAllocation={editingAllocation}
        isIncome={activeTab === "income"}
        isPending={setAllocationMutation.isPending}
      />
    </>
  );
};

export default BudgetPage;
