import { logger } from "@/adapters";
import {
  createGoal,
  deleteGoal,
  updateGoal,
  addGoalContribution,
  removeGoalContribution,
} from "@/commands/goal";
import { QueryKeys } from "@/lib/query-keys";
import { NewGoalContribution } from "@/lib/types";
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
      handleSuccess("Goal added successfully.", [
        QueryKeys.GOALS,
        QueryKeys.GOALS_WITH_CONTRIBUTIONS,
      ]),
    onError: (e) => {
      logger.error(`Error adding goal: ${e}`);
      handleError("adding this goal");
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: updateGoal,
    onSuccess: () =>
      handleSuccess("Goal updated successfully.", [
        QueryKeys.GOALS,
        QueryKeys.GOALS_WITH_CONTRIBUTIONS,
      ]),
    onError: (e) => {
      logger.error(`Error updating goal: ${e}`);
      handleError("updating this goal");
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () =>
      handleSuccess("Goal deleted successfully.", [
        QueryKeys.GOALS,
        QueryKeys.GOALS_WITH_CONTRIBUTIONS,
      ]),
    onError: (e) => {
      logger.error(`Error deleting goal: ${e}`);
      handleError("deleting this goal");
    },
  });

  const addContributionMutation = useMutation({
    mutationFn: (contribution: NewGoalContribution) => addGoalContribution(contribution),
    onSuccess: () =>
      handleSuccess("Contribution added successfully.", [
        QueryKeys.GOALS_WITH_CONTRIBUTIONS,
        QueryKeys.ACCOUNT_FREE_CASH,
      ]),
    onError: (e) => {
      logger.error(`Error adding contribution: ${e}`);
      handleError("adding the contribution");
    },
  });

  const removeContributionMutation = useMutation({
    mutationFn: (contributionId: string) => removeGoalContribution(contributionId),
    onSuccess: () =>
      handleSuccess("Contribution removed successfully.", [
        QueryKeys.GOALS_WITH_CONTRIBUTIONS,
        QueryKeys.ACCOUNT_FREE_CASH,
      ]),
    onError: (e) => {
      logger.error(`Error removing contribution: ${e}`);
      handleError("removing the contribution");
    },
  });

  return {
    addGoalMutation,
    updateGoalMutation,
    deleteGoalMutation,
    addContributionMutation,
    removeContributionMutation,
  };
};
