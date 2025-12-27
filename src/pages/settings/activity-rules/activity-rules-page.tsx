import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Icons, Separator, Skeleton, EmptyPlaceholder } from "@wealthfolio/ui";
import { getActivityRulesWithNames } from "@/commands/activity-rule";
import { getCategoriesHierarchical } from "@/commands/category";
import { QueryKeys } from "@/lib/query-keys";
import type {
  ActivityRule,
  ActivityRuleWithNames,
  CategoryWithChildren,
  NewActivityRule,
  UpdateActivityRule,
} from "@/lib/types";
import { SettingsHeader } from "../settings-header";
import { RuleItem } from "./components/rule-item";
import { RuleEditModal } from "./components/rule-edit-modal";
import { useActivityRuleMutations } from "./use-activity-rule-mutations";

function SettingsActivityRulesPage() {
  const { data: rules, isLoading: rulesLoading } = useQuery<ActivityRuleWithNames[], Error>({
    queryKey: [QueryKeys.ACTIVITY_RULES_WITH_NAMES],
    queryFn: getActivityRulesWithNames,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery<
    CategoryWithChildren[],
    Error
  >({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ActivityRule | undefined>();

  const { createRuleMutation, updateRuleMutation, deleteRuleMutation } = useActivityRuleMutations();

  const isLoading = rulesLoading || categoriesLoading;

  const handleAddRule = () => {
    setSelectedRule(undefined);
    setVisibleModal(true);
  };

  const handleEditRule = (rule: ActivityRuleWithNames) => {
    // Extract just the ActivityRule fields
    setSelectedRule({
      id: rule.id,
      name: rule.name,
      pattern: rule.pattern,
      matchType: rule.matchType,
      categoryId: rule.categoryId,
      subCategoryId: rule.subCategoryId,
      activityType: rule.activityType,
      recurrence: rule.recurrence,
      priority: rule.priority,
      isGlobal: rule.isGlobal,
      accountId: rule.accountId,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    });
    setVisibleModal(true);
  };

  const handleDeleteRule = (rule: ActivityRuleWithNames) => {
    deleteRuleMutation.mutate(rule.id);
  };

  const handleSave = (data: NewActivityRule | { id: string; update: UpdateActivityRule }) => {
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
          heading="Activity Rules"
          text="Auto-assign categories and activity types based on transaction name patterns and priority."
        >
          <>
            <Button size="icon" className="sm:hidden" onClick={handleAddRule} aria-label="Add rule">
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button className="hidden sm:inline-flex" onClick={handleAddRule}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add rule
            </Button>
          </>
        </SettingsHeader>
        <Separator />

        {sortedRules.length === 0 ? (
          <EmptyPlaceholder>
            <EmptyPlaceholder.Icon name="ListFilter" />
            <EmptyPlaceholder.Title>No rules</EmptyPlaceholder.Title>
            <EmptyPlaceholder.Description>
              You don&apos;t have any activity rules yet. Create rules to automatically assign
              categories and activity types during import.
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
}

export default SettingsActivityRulesPage;
