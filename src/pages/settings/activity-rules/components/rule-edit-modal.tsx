import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui";
import type { ActivityRule, CategoryWithChildren, NewActivityRule, UpdateActivityRule } from "@/lib/types";
import { RuleForm } from "./rule-form";

interface RuleEditModalProps {
  open: boolean;
  onClose: () => void;
  rule?: ActivityRule;
  categories: CategoryWithChildren[];
  onSave: (data: NewActivityRule | { id: string; update: UpdateActivityRule }) => void;
  isLoading?: boolean;
}

export function RuleEditModal({
  open,
  onClose,
  rule,
  categories,
  onSave,
  isLoading,
}: RuleEditModalProps) {
  const isEditing = !!rule;

  const handleSubmit = (values: {
    name: string;
    pattern: string;
    matchType: string;
    categoryId?: string;
    subCategoryId?: string;
    activityType?: string;
    recurrence?: string;
    priority: number;
    isGlobal: boolean;
  }) => {
    if (isEditing && rule) {
      onSave({
        id: rule.id,
        update: {
          name: values.name,
          pattern: values.pattern,
          matchType: values.matchType as "contains" | "starts_with" | "exact",
          categoryId: values.categoryId || undefined,
          subCategoryId: values.subCategoryId || undefined,
          activityType: values.activityType || undefined,
          recurrence: values.recurrence || undefined,
          priority: values.priority,
          isGlobal: values.isGlobal,
        },
      });
    } else {
      onSave({
        name: values.name,
        pattern: values.pattern,
        matchType: values.matchType as "contains" | "starts_with" | "exact",
        categoryId: values.categoryId || undefined,
        subCategoryId: values.subCategoryId || undefined,
        activityType: values.activityType || undefined,
        recurrence: values.recurrence || undefined,
        priority: values.priority,
        isGlobal: values.isGlobal,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Rule" : "Add Rule"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the activity rule settings below."
              : "Create a new rule to automatically assign categories and activity types."}
          </DialogDescription>
        </DialogHeader>
        <RuleForm
          rule={rule}
          categories={categories}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
