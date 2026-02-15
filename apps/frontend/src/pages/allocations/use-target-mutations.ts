import {
  logger,
  createPortfolioTarget,
  updatePortfolioTarget,
  deletePortfolioTarget,
  upsertTargetAllocation,
  deleteTargetAllocation,
  upsertHoldingTarget,
  deleteHoldingTarget,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { NewTargetAllocation, NewHoldingTarget } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useTargetMutations = () => {
  const queryClient = useQueryClient();

  const invalidateAllocations = () => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.TARGET_ALLOCATIONS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ALLOCATION_DEVIATIONS] });
  };

  const handleError = (action: string) => {
    toast.error("Uh oh! Something went wrong.", {
      description: `There was a problem ${action}.`,
    });
  };

  const createTargetMutation = useMutation({
    mutationFn: createPortfolioTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_TARGETS] });
      toast.success("Target created successfully.");
    },
    onError: (e) => {
      logger.error(`Error creating target: ${e}`);
      handleError("creating this target");
    },
  });

  const updateTargetMutation = useMutation({
    mutationFn: updatePortfolioTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_TARGETS] });
      toast.success("Target updated successfully.");
    },
    onError: (e) => {
      logger.error(`Error updating target: ${e}`);
      handleError("updating this target");
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: deletePortfolioTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO_TARGETS] });
      invalidateAllocations();
      toast.success("Target deleted successfully.");
    },
    onError: (e) => {
      logger.error(`Error deleting target: ${e}`);
      handleError("deleting this target");
    },
  });

  const upsertAllocationMutation = useMutation({
    mutationFn: upsertTargetAllocation,
    onSuccess: () => invalidateAllocations(),
    onError: (e) => {
      logger.error(`Error saving allocation: ${e}`);
      handleError("saving the allocation");
    },
  });

  // Batch save: saves multiple allocations in one go with a single toast
  const batchSaveAllocationsMutation = useMutation({
    mutationFn: async (allocations: NewTargetAllocation[]) => {
      return Promise.all(allocations.map(upsertTargetAllocation));
    },
    onSuccess: () => {
      invalidateAllocations();
      toast.success("Allocations saved.");
    },
    onError: (e) => {
      logger.error(`Error saving allocations: ${e}`);
      handleError("saving allocations");
    },
  });

  const deleteAllocationMutation = useMutation({
    mutationFn: deleteTargetAllocation,
    onSuccess: () => {
      invalidateAllocations();
      toast.success("Allocation removed.");
    },
    onError: (e) => {
      logger.error(`Error deleting allocation: ${e}`);
      handleError("deleting the allocation");
    },
  });

  // Holding targets mutations
  const upsertHoldingTargetMutation = useMutation({
    mutationFn: upsertHoldingTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDING_TARGETS] });
    },
    onError: (e) => {
      logger.error(`Error saving holding target: ${e}`);
      handleError("saving the holding target");
    },
  });

  const batchSaveHoldingTargetsMutation = useMutation({
    mutationFn: async (targets: NewHoldingTarget[]) => {
      return Promise.all(targets.map(upsertHoldingTarget));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDING_TARGETS] });
      toast.success("Holding targets saved.");
    },
    onError: (e) => {
      logger.error(`Error saving holding targets: ${e}`);
      handleError("saving holding targets");
    },
  });

  const deleteHoldingTargetMutation = useMutation({
    mutationFn: deleteHoldingTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDING_TARGETS] });
      toast.success("Holding target removed.");
    },
    onError: (e) => {
      logger.error(`Error deleting holding target: ${e}`);
      handleError("deleting the holding target");
    },
  });

  return {
    createTargetMutation,
    updateTargetMutation,
    deleteTargetMutation,
    upsertAllocationMutation,
    batchSaveAllocationsMutation,
    deleteAllocationMutation,
    upsertHoldingTargetMutation,
    batchSaveHoldingTargetsMutation,
    deleteHoldingTargetMutation,
  };
};
