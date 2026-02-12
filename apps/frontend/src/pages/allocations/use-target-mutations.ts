import {
  logger,
  createPortfolioTarget,
  updatePortfolioTarget,
  deletePortfolioTarget,
  upsertTargetAllocation,
  deleteTargetAllocation,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useTargetMutations = () => {
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

  const createTargetMutation = useMutation({
    mutationFn: createPortfolioTarget,
    onSuccess: () => handleSuccess("Target created successfully.", [QueryKeys.PORTFOLIO_TARGETS]),
    onError: (e) => {
      logger.error(`Error creating target: ${e}`);
      handleError("creating this target");
    },
  });

  const updateTargetMutation = useMutation({
    mutationFn: updatePortfolioTarget,
    onSuccess: () => handleSuccess("Target updated successfully.", [QueryKeys.PORTFOLIO_TARGETS]),
    onError: (e) => {
      logger.error(`Error updating target: ${e}`);
      handleError("updating this target");
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: deletePortfolioTarget,
    onSuccess: () =>
      handleSuccess("Target deleted successfully.", [
        QueryKeys.PORTFOLIO_TARGETS,
        QueryKeys.TARGET_ALLOCATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error deleting target: ${e}`);
      handleError("deleting this target");
    },
  });

  const upsertAllocationMutation = useMutation({
    mutationFn: upsertTargetAllocation,
    onSuccess: () =>
      handleSuccess("Allocation saved.", [
        QueryKeys.TARGET_ALLOCATIONS,
        QueryKeys.ALLOCATION_DEVIATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error saving allocation: ${e}`);
      handleError("saving the allocation");
    },
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: deleteTargetAllocation,
    onSuccess: () =>
      handleSuccess("Allocation removed.", [
        QueryKeys.TARGET_ALLOCATIONS,
        QueryKeys.ALLOCATION_DEVIATIONS,
      ]),
    onError: (e) => {
      logger.error(`Error deleting allocation: ${e}`);
      handleError("deleting the allocation");
    },
  });

  return {
    createTargetMutation,
    updateTargetMutation,
    deleteTargetMutation,
    upsertAllocationMutation,
    deleteAllocationMutation,
  };
};
