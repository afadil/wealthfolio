import { getCategoriesHierarchical } from "@/commands/category";
import { getCategoryRulesWithNames } from "@/commands/category-rule";
import { QueryKeys } from "@/lib/query-keys";
import type {
  CategoryRule,
  CategoryRuleWithNames,
  CategoryWithChildren,
  NewCategoryRule,
  UpdateCategoryRule,
} from "@/lib/types";
import { RuleItem } from "@/pages/settings/category-rules/components/rule-item";
import { RuleEditModal } from "@/pages/settings/category-rules/components/rule-edit-modal";
import { useCategoryRuleMutations } from "@/pages/settings/category-rules/use-category-rule-mutations";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icons,
  ScrollArea,
  Skeleton,
} from "@wealthfolio/ui";
import { useState } from "react";

interface ManageRulesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ManageRulesDialog({ open, onClose }: ManageRulesDialogProps) {
  const { data: rules, isLoading: rulesLoading } = useQuery<CategoryRuleWithNames[], Error>({
    queryKey: [QueryKeys.CATEGORY_RULES_WITH_NAMES],
    queryFn: getCategoryRulesWithNames,
    enabled: open,
  });

  const { data: categories } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
    enabled: open,
  });

  const { createRuleMutation, updateRuleMutation, deleteRuleMutation } = useCategoryRuleMutations();

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<CategoryRule | undefined>();

  const handleAddRule = () => {
    setSelectedRule(undefined);
    setVisibleModal(true);
  };

  const handleEditRule = (rule: CategoryRuleWithNames) => {
    setSelectedRule({
      id: rule.id,
      name: rule.name,
      pattern: rule.pattern,
      matchType: rule.matchType,
      categoryId: rule.categoryId,
      subCategoryId: rule.subCategoryId,
      priority: rule.priority,
      isGlobal: rule.isGlobal,
      accountId: rule.accountId,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    });
    setVisibleModal(true);
  };

  const handleDeleteRule = (rule: CategoryRuleWithNames) => {
    deleteRuleMutation.mutate(rule.id);
  };

  const handleSave = (data: NewCategoryRule | { id: string; update: UpdateCategoryRule }) => {
    if ("id" in data) {
      updateRuleMutation.mutate(data, {
        onSuccess: () => setVisibleModal(false),
      });
    } else {
      createRuleMutation.mutate(data, {
        onSuccess: () => setVisibleModal(false),
      });
    }
  };

  const sortedRules = [...(rules ?? [])].sort((a, b) => b.priority - a.priority);

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Rules</DialogTitle>
            <DialogDescription>
              Auto-categorize transactions based on name patterns.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                Rules are applied in priority order (highest first).
              </span>
              <Button size="sm" onClick={handleAddRule}>
                <Icons.Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>
            <ScrollArea className="h-[400px]">
              {rulesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : sortedRules.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No rules yet. Click &quot;Add&quot; to create one.
                </div>
              ) : (
                <div className="divide-border divide-y rounded-md border">
                  {sortedRules.map((rule) => (
                    <RuleItem
                      key={rule.id}
                      rule={rule}
                      onEdit={handleEditRule}
                      onDelete={handleDeleteRule}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RuleEditModal
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
        rule={selectedRule}
        categories={categories ?? []}
        onSave={handleSave}
        isLoading={createRuleMutation.isPending || updateRuleMutation.isPending}
      />
    </>
  );
}
