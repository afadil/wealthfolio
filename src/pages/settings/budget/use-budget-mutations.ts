import { logger } from "@/adapters";
import {
  upsertBudgetConfig,
  setBudgetAllocation,
  deleteBudgetAllocation,
} from "@/commands/budget";
import { QueryKeys } from "@/lib/query-keys";
import { NewBudgetConfig } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useBudgetMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, invalidateKeys: string[]) => {
    invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    toast.success(message);
  };

  const handleError = (action: string) => {
    toast.error("Uh oh! Something went wrong.", {
      description: `There was a problem ${action}.`,
    });
  };

  const upsertConfigMutation = useMutation({
    mutationFn: (config: NewBudgetConfig) => upsertBudgetConfig(config),
    onSuccess: () =>
      handleSuccess("Budget targets updated successfully.", [
        QueryKeys.BUDGET_CONFIG,
        QueryKeys.BUDGET_SUMMARY,
      ]),
    onError: (e) => {
      logger.error(`Error updating budget config: ${e}`);
      handleError("updating budget targets");
    },
  });

  const setAllocationMutation = useMutation({
    mutationFn: ({ categoryId, amount }: { categoryId: string; amount: number }) =>
      setBudgetAllocation(categoryId, amount),
    onSuccess: () =>
      handleSuccess("Budget allocation saved.", [
        QueryKeys.BUDGET_SUMMARY,
        QueryKeys.BUDGET_ALLOCATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error setting budget allocation: ${e}`);
      handleError("setting budget allocation");
    },
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: (categoryId: string) => deleteBudgetAllocation(categoryId),
    onSuccess: () =>
      handleSuccess("Budget allocation removed.", [
        QueryKeys.BUDGET_SUMMARY,
        QueryKeys.BUDGET_ALLOCATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error removing budget allocation: ${e}`);
      handleError("removing budget allocation");
    },
  });

  return {
    upsertConfigMutation,
    setAllocationMutation,
    deleteAllocationMutation,
  };
};
