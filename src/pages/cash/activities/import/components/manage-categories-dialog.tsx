import { getCategoriesHierarchical } from "@/commands/category";
import { QueryKeys } from "@/lib/query-keys";
import type { Category, CategoryWithChildren, NewCategory, UpdateCategory } from "@/lib/types";
import { CategoryItem } from "@/pages/settings/categories/components/category-item";
import { CategoryEditModal } from "@/pages/settings/categories/components/category-edit-modal";
import { useCategoryMutations } from "@/pages/settings/categories/use-category-mutations";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
import { useState } from "react";

interface ManageCategoriesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ManageCategoriesDialog({ open, onClose }: ManageCategoriesDialogProps) {
  const { data: categories, isLoading } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
    enabled: open,
  });

  const { createCategoryMutation, updateCategoryMutation, deleteCategoryMutation } =
    useCategoryMutations();

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>();
  const [parentCategory, setParentCategory] = useState<Category | undefined>();
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");

  const expenseCategories = categories?.filter((cat) => !cat.isIncome) ?? [];
  const incomeCategories = categories?.filter((cat) => cat.isIncome) ?? [];

  const handleAddCategory = () => {
    setSelectedCategory(undefined);
    setParentCategory(undefined);
    setVisibleModal(true);
  };

  const handleAddSubcategory = (parent: Category) => {
    setSelectedCategory(undefined);
    setParentCategory(parent);
    setVisibleModal(true);
  };

  const handleEditCategory = (category: Category) => {
    setSelectedCategory(category);
    setParentCategory(undefined);
    setVisibleModal(true);
  };

  const handleDeleteCategory = (category: Category) => {
    deleteCategoryMutation.mutate(category.id);
  };

  const handleSave = (data: NewCategory | { id: string; update: UpdateCategory }) => {
    if ("id" in data) {
      updateCategoryMutation.mutate(data, {
        onSuccess: () => setVisibleModal(false),
      });
    } else {
      createCategoryMutation.mutate(data, {
        onSuccess: () => setVisibleModal(false),
      });
    }
  };

  const renderCategoryList = (categoryList: CategoryWithChildren[]) => {
    if (categoryList.length === 0) {
      return (
        <div className="text-muted-foreground py-8 text-center text-sm">
          No categories yet. Click &quot;Add&quot; to create one.
        </div>
      );
    }

    return (
      <div className="divide-border divide-y rounded-md border">
        {categoryList.map((category) => (
          <CategoryItem
            key={category.id}
            category={category}
            children={category.children}
            onEdit={handleEditCategory}
            onDelete={handleDeleteCategory}
            onAddSubcategory={handleAddSubcategory}
          />
        ))}
      </div>
    );
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              View, edit, and delete your expense and income categories.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as "expense" | "income")}
                className="w-full"
              >
                <div className="mb-4 flex items-center justify-between">
                  <TabsList className="grid w-full max-w-xs grid-cols-2">
                    <TabsTrigger value="expense">Expense ({expenseCategories.length})</TabsTrigger>
                    <TabsTrigger value="income">Income ({incomeCategories.length})</TabsTrigger>
                  </TabsList>
                  <Button size="sm" onClick={handleAddCategory}>
                    <Icons.Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
                <ScrollArea className="h-[400px]">
                  <TabsContent value="expense" className="mt-0">
                    {renderCategoryList(expenseCategories)}
                  </TabsContent>
                  <TabsContent value="income" className="mt-0">
                    {renderCategoryList(incomeCategories)}
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoryEditModal
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
        category={selectedCategory}
        parentCategory={parentCategory}
        onSave={handleSave}
        isLoading={createCategoryMutation.isPending || updateCategoryMutation.isPending}
        defaultIsIncome={activeTab === "income"}
      />
    </>
  );
}
