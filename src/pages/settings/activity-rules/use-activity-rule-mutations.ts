import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import {
  createActivityRule,
  updateActivityRule,
  deleteActivityRule,
} from "@/commands/activity-rule";
import { QueryKeys } from "@/lib/query-keys";
import type { NewActivityRule, UpdateActivityRule } from "@/lib/types";

export function useActivityRuleMutations() {
  const queryClient = useQueryClient();

  const invalidateRules = () => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_RULES] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_RULES_WITH_NAMES] });
  };

  const createRuleMutation = useMutation({
    mutationFn: (rule: NewActivityRule) => createActivityRule(rule),
    onSuccess: () => {
      invalidateRules();
      toast({
        title: "Rule created",
        description: "The activity rule has been created successfully.",
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
    mutationFn: ({ id, update }: { id: string; update: UpdateActivityRule }) =>
      updateActivityRule(id, update),
    onSuccess: () => {
      invalidateRules();
      toast({
        title: "Rule updated",
        description: "The activity rule has been updated successfully.",
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
    mutationFn: (ruleId: string) => deleteActivityRule(ruleId),
    onSuccess: () => {
      invalidateRules();
      toast({
        title: "Rule deleted",
        description: "The activity rule has been deleted successfully.",
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
