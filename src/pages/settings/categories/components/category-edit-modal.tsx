import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui";
import type { Category, NewCategory, UpdateCategory } from "@/lib/types";
import { CategoryForm } from "./category-form";
import { SubcategoryForm } from "./subcategory-form";

interface CategoryEditModalProps {
  open: boolean;
  onClose: () => void;
  category?: Category;
  parentCategory?: Category;
  onSave: (data: NewCategory | { id: string; update: UpdateCategory }) => void;
  isLoading?: boolean;
  defaultIsIncome?: boolean;
}

export function CategoryEditModal({
  open,
  onClose,
  category,
  parentCategory,
  onSave,
  isLoading,
  defaultIsIncome,
}: CategoryEditModalProps) {
  const isEditing = !!category;
  const isSubcategory = !!parentCategory;

  const handleSubmit = (values: { name: string; color?: string; isIncome: boolean }) => {
    if (isEditing && category) {
      const updateData = {
        id: category.id,
        update: {
          name: values.name,
          color: values.color,
        },
      };
      onSave(updateData);
    } else {
      const createData = {
        name: values.name,
        color: values.color,
        isIncome: isSubcategory ? !!parentCategory?.isIncome : values.isIncome,
        parentId: parentCategory?.id,
      };
      onSave(createData);
    }
  };

  const getTitle = () => {
    if (isEditing) return "Edit Category";
    if (isSubcategory) return "Add Subcategory";
    return "Add Category";
  };

  const getDescription = () => {
    if (isEditing) return "Update the category name and color.";
    if (isSubcategory) return `Add a new subcategory under "${parentCategory?.name}".`;
    return "Create a new category to organize your transactions.";
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>
        {isSubcategory && parentCategory ? (
          <SubcategoryForm
            subcategory={category}
            parentCategory={parentCategory}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isLoading={isLoading}
          />
        ) : (
          <CategoryForm
            category={category}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            defaultIsIncome={defaultIsIncome}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
