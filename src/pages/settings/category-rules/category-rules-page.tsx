import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Icons,
  Separator,
  Skeleton,
  EmptyPlaceholder,
} from "@wealthfolio/ui";
import { getCategoryRulesWithNames } from "@/commands/category-rule";
import { getCategoriesHierarchical } from "@/commands/category";
import { QueryKeys } from "@/lib/query-keys";
import type {
  CategoryRule,
  CategoryRuleWithNames,
  CategoryWithChildren,
  NewCategoryRule,
  UpdateCategoryRule,
} from "@/lib/types";
import { SettingsHeader } from "../settings-header";
import { RuleItem } from "./components/rule-item";
import { RuleEditModal } from "./components/rule-edit-modal";
import { useCategoryRuleMutations } from "./use-category-rule-mutations";

function SettingsCategoryRulesPage() {
  const { data: rules, isLoading: rulesLoading } = useQuery<CategoryRuleWithNames[], Error>({
    queryKey: [QueryKeys.CATEGORY_RULES_WITH_NAMES],
    queryFn: getCategoryRulesWithNames,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<CategoryRule | undefined>();

  const { createRuleMutation, updateRuleMutation, deleteRuleMutation } =
    useCategoryRuleMutations();

  const isLoading = rulesLoading || categoriesLoading;

  const handleAddRule = () => {
    setSelectedRule(undefined);
    setVisibleModal(true);
  };

  const handleEditRule = (rule: CategoryRuleWithNames) => {
    // Extract just the CategoryRule fields
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  // Sort rules by priority (descending)
  const sortedRules = [...(rules ?? [])].sort((a, b) => b.priority - a.priority);

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader
          heading="Category Rules"
          text="Auto-categorize transactions based on name patterns."
        >
          <>
            <Button
              size="icon"
              className="sm:hidden"
              onClick={handleAddRule}
              aria-label="Add rule"
            >
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button className="hidden sm:inline-flex" onClick={handleAddRule}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add rule
            </Button>
          </>
        </SettingsHeader>
        <Separator />

        <div className="text-muted-foreground text-sm">
          Rules are applied in priority order (highest first) when importing transactions.
          The first matching rule will assign the category.
        </div>

        {sortedRules.length === 0 ? (
          <EmptyPlaceholder>
            <EmptyPlaceholder.Icon name="ListFilter" />
            <EmptyPlaceholder.Title>No rules</EmptyPlaceholder.Title>
            <EmptyPlaceholder.Description>
              You don&apos;t have any category rules yet. Create rules to automatically
              categorize transactions during import.
            </EmptyPlaceholder.Description>
            <Button onClick={handleAddRule}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add rule
            </Button>
          </EmptyPlaceholder>
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
      </div>

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
};

export default SettingsCategoryRulesPage;
