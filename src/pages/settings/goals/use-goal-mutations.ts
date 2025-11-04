import { logger } from "@/adapters";
import { createGoal, deleteGoal, updateGoal, updateGoalsAllocations } from "@/commands/goal";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useGoalMutations = () => {
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

  const addGoalMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: () =>
      handleSuccess("Goal added successfully. Start adding or importing this goal activities.", [
        QueryKeys.GOALS,
      ]),
    onError: (e) => {
      logger.error(`Error adding goal: ${e}`);
      handleError("adding this goal");
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: updateGoal,
    onSuccess: () => handleSuccess("Goal updated successfully.", [QueryKeys.GOALS]),
    onError: (e) => {
      logger.error(`Error updating goal: ${e}`);
      handleError("updating this goal");
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () =>
      handleSuccess("Goal deleted successfully.", [QueryKeys.GOALS, QueryKeys.GOALS_ALLOCATIONS]),
    onError: (e) => {
      logger.error(`Error deleting goal: ${e}`);
      handleError("deleting this goal");
    },
  });

  const saveAllocationsMutation = useMutation({
    mutationFn: updateGoalsAllocations,
    onSuccess: () =>
      handleSuccess("Allocation saved successfully.", [
        QueryKeys.GOALS,
        QueryKeys.GOALS_ALLOCATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error saving allocations: ${e}`);
      handleError("saving the allocations");
    },
  });

  return {
    deleteGoalMutation,
    saveAllocationsMutation,
    addGoalMutation,
    updateGoalMutation,
  };
};
