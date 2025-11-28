import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import {
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
} from "@/commands/category-rule";
import { QueryKeys } from "@/lib/query-keys";
import type { NewCategoryRule, UpdateCategoryRule } from "@/lib/types";

export function useCategoryRuleMutations() {
  const queryClient = useQueryClient();

  const invalidateRules = () => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.CATEGORY_RULES] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.CATEGORY_RULES_WITH_NAMES] });
  };

  const createRuleMutation = useMutation({
    mutationFn: (rule: NewCategoryRule) => createCategoryRule(rule),
    onSuccess: () => {
      invalidateRules();
      toast({
        title: "Rule created",
        description: "The category rule has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create rule: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateCategoryRule }) =>
      updateCategoryRule(id, update),
    onSuccess: () => {
      invalidateRules();
      toast({
        title: "Rule updated",
        description: "The category rule has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update rule: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => deleteCategoryRule(ruleId),
    onSuccess: () => {
      invalidateRules();
      toast({
        title: "Rule deleted",
        description: "The category rule has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete rule: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  return {
    createRuleMutation,
    updateRuleMutation,
    deleteRuleMutation,
  };
}
