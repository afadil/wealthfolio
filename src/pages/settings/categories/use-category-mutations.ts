import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { createCategory, updateCategory, deleteCategory } from "@/commands/category";
import { QueryKeys } from "@/lib/query-keys";
import type { NewCategory, UpdateCategory } from "@/lib/types";

export function useCategoryMutations() {
  const queryClient = useQueryClient();

  const invalidateCategories = () => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.CATEGORIES] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.EXPENSE_CATEGORIES] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.INCOME_CATEGORIES] });
  };

  const createCategoryMutation = useMutation({
    mutationFn: (category: NewCategory) => createCategory(category),
    onSuccess: () => {
      invalidateCategories();
      toast({
        title: "Category created",
        description: "The category has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create category: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateCategory }) =>
      updateCategory(id, update),
    onSuccess: () => {
      invalidateCategories();
      toast({
        title: "Category updated",
        description: "The category has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update category: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryId: string) => deleteCategory(categoryId),
    onSuccess: () => {
      invalidateCategories();
      toast({
        title: "Category deleted",
        description: "The category has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete category: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    createCategoryMutation,
    updateCategoryMutation,
    deleteCategoryMutation,
  };
}
