import { getCategoriesHierarchical } from "@/commands/category";
import { QueryKeys } from "@/lib/query-keys";
import type { Category, CategoryWithChildren, NewCategory, UpdateCategory } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  EmptyPlaceholder,
  Icons,
  Separator,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
import { useState } from "react";
import { SettingsHeader } from "../settings-header";
import { CategoryEditModal } from "./components/category-edit-modal";
import { CategoryItem } from "./components/category-item";
import { useCategoryMutations } from "./use-category-mutations";

const SettingsCategoriesPage = () => {
  const { data: categories, isLoading } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>();
  const [parentCategory, setParentCategory] = useState<Category | undefined>();
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");

  const { createCategoryMutation, updateCategoryMutation, deleteCategoryMutation } =
    useCategoryMutations();

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
        onSuccess: () => {
          setVisibleModal(false);
        },
      });
    } else {
      createCategoryMutation.mutate(data, {
        onSuccess: () => {
          setVisibleModal(false);
        },
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

  const renderCategoryList = (categoryList: CategoryWithChildren[]) => {
    if (categoryList.length === 0) {
      return (
        <div className="text-muted-foreground py-8 text-center text-sm">
          No categories yet. Click &quot;Add category&quot; to create one.
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

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader
          heading="Categories"
          text="Manage expense and income categories for your transactions."
        >
          <>
            <Button
              size="icon"
              className="sm:hidden"
              onClick={handleAddCategory}
              aria-label="Add category"
            >
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button className="hidden sm:inline-flex" onClick={handleAddCategory}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add category
            </Button>
          </>
        </SettingsHeader>
        <Separator />

        {categories?.length === 0 ? (
          <EmptyPlaceholder>
            <EmptyPlaceholder.Icon name="Tag" />
            <EmptyPlaceholder.Title>No categories</EmptyPlaceholder.Title>
            <EmptyPlaceholder.Description>
              You don&apos;t have any categories yet. Create categories to organize your
              transactions.
            </EmptyPlaceholder.Description>
            <Button onClick={handleAddCategory}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add category
            </Button>
          </EmptyPlaceholder>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "expense" | "income")}
            className="w-full"
          >
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="expense">Expense ({expenseCategories.length})</TabsTrigger>
              <TabsTrigger value="income">Income ({incomeCategories.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="expense" className="mt-6">
              {renderCategoryList(expenseCategories)}
            </TabsContent>
            <TabsContent value="income" className="mt-6">
              {renderCategoryList(incomeCategories)}
            </TabsContent>
          </Tabs>
        )}
      </div>

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
};

export default SettingsCategoriesPage;
