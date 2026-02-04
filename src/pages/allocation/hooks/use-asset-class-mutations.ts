import { deleteAssetClassTarget, saveAssetClassTarget } from "@/commands/rebalancing";
import { toast } from "@/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface SaveTargetPayload {
  strategyId: string;
  assetClass: string;
  targetPercent: number;
}

export function useAssetClassMutations() {
  const queryClient = useQueryClient();

  const saveTargetMutation = useMutation({
    mutationFn: async (payload: SaveTargetPayload) => {
      console.log("Sending save payload:", payload);
      const result = await saveAssetClassTarget(payload);
      console.log("Save result:", result);
      return result;
    },
    onSuccess: () => {
      console.log("Save succeeded, invalidating queries");
      toast({
        title: "Success",
        description: "Allocation target saved successfully",
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.ASSET_CLASS_TARGETS],
      });
    },
    onError: (error) => {
      console.error("Save mutation error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save target",
        variant: "destructive",
      });
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: async (targetId: string) => {
      console.log("Deleting target:", targetId);
      const result = await deleteAssetClassTarget(targetId);
      console.log("Delete result:", result);
      return result;
    },
    onSuccess: () => {
      console.log("Delete succeeded, invalidating queries");
      toast({
        title: "Success",
        description: "Allocation target deleted successfully",
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.ASSET_CLASS_TARGETS],
      });
    },
    onError: (error) => {
      console.error("Delete mutation error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete target",
        variant: "destructive",
      });
    },
  });

  return {
    saveTargetMutation,
    deleteTargetMutation,
  };
}
