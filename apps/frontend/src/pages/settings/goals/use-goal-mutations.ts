import { logger, createGoal, deleteGoal, updateGoal, updateGoalsAllocations } from "@/adapters";
import i18n from "@/i18n/i18n";
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
    toast.error(i18n.t("settings.goals.toast_error_title"), {
      description: i18n.t("settings.goals.toast_error_description", { action }),
    });
  };

  const addGoalMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: () =>
      handleSuccess(i18n.t("settings.goals.toast_add_success"), [QueryKeys.GOALS]),
    onError: (e) => {
      logger.error(`Error adding goal: ${e}`);
      handleError(i18n.t("settings.goals.toast_action_adding"));
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: updateGoal,
    onSuccess: () => handleSuccess(i18n.t("settings.goals.toast_update_success"), [QueryKeys.GOALS]),
    onError: (e) => {
      logger.error(`Error updating goal: ${e}`);
      handleError(i18n.t("settings.goals.toast_action_updating"));
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () =>
      handleSuccess(i18n.t("settings.goals.toast_delete_success"), [
        QueryKeys.GOALS,
        QueryKeys.GOALS_ALLOCATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error deleting goal: ${e}`);
      handleError(i18n.t("settings.goals.toast_action_deleting"));
    },
  });

  const saveAllocationsMutation = useMutation({
    mutationFn: updateGoalsAllocations,
    onSuccess: () =>
      handleSuccess(i18n.t("settings.goals.toast_allocations_saved"), [
        QueryKeys.GOALS,
        QueryKeys.GOALS_ALLOCATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error saving allocations: ${e}`);
      handleError(i18n.t("settings.goals.toast_action_saving_allocations"));
    },
  });

  return {
    deleteGoalMutation,
    saveAllocationsMutation,
    addGoalMutation,
    updateGoalMutation,
  };
};
