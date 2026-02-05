import {
  deleteHoldingTarget,
  saveHoldingTarget,
  toggleHoldingTargetLock,
} from "@/commands/rebalancing";
import { toast } from "@/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import type { HoldingTarget, NewHoldingTarget } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Payload for saving holding target (create or update)
type SaveHoldingTargetPayload = Omit<HoldingTarget, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export function useHoldingTargetMutations() {
  const queryClient = useQueryClient();

  const saveTargetMutation = useMutation({
    mutationFn: async (payload: SaveHoldingTargetPayload) => {
      console.log("Sending holding target save payload:", payload);
      try {
        const result = await saveHoldingTarget(payload as NewHoldingTarget);
        console.log("Holding target save result:", result);
        return result;
      } catch (error) {
        console.error("saveHoldingTarget command failed:", error);
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      console.log("Holding target save succeeded, invalidating queries");
      toast({
        title: "Success",
        description: "Holding target saved successfully",
      });
      // Invalidate queries for this asset class
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.HOLDING_TARGETS, variables.assetClassId],
      });
      // Also invalidate holdings queries as current allocation may have changed
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.HOLDINGS],
      });
    },
    onError: (error: Error | string) => {
      console.error("Holding target save failed:", error);

      // Convert error to string for checking
      const errorMessage = typeof error === "string" ? error : error.message || String(error);
      const isValidationError = errorMessage.includes("must sum to 100%");

      toast({
        title: "Error",
        description: isValidationError
          ? "All holding targets in this asset class must sum to 100%. Set targets for all holdings to equal 100% total."
          : `Failed to save holding target: ${errorMessage}`,
        variant: "destructive",
      });
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: async ({ id }: { id: string; assetClassId: string }) => {
      return deleteHoldingTarget(id);
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Success",
        description: "Holding target deleted successfully",
      });
      // Invalidate queries for this asset class
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.HOLDING_TARGETS, variables.assetClassId],
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.HOLDINGS],
      });
    },
    onError: (error) => {
      console.error("Holding target delete failed:", error);
      toast({
        title: "Error",
        description: "Failed to delete holding target",
        variant: "destructive",
      });
    },
  });

  const toggleLockMutation = useMutation({
    mutationFn: async ({
      id,
      holdingName,
    }: {
      id: string;
      assetClassId: string;
      holdingName?: string;
    }) => {
      return { result: await toggleHoldingTargetLock(id), holdingName };
    },
    onSuccess: (data, variables) => {
      const name = data.holdingName || "Holding";
      toast({
        title: "Success",
        description: data.result.isLocked ? `${name} is now locked` : `${name} is now unlocked`,
      });
      // Invalidate queries for this asset class
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.HOLDING_TARGETS, variables.assetClassId],
      });
    },
    onError: (error) => {
      console.error("Toggle lock failed:", error);
      toast({
        title: "Error",
        description: "Failed to toggle lock status",
        variant: "destructive",
      });
    },
  });

  return {
    saveTargetMutation,
    deleteTargetMutation,
    toggleLockMutation,
  };
}
