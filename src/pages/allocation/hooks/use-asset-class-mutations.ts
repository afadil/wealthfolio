import { deleteAssetClassTarget, saveAssetClassTarget } from "@/commands/rebalancing";
import { toast } from "@/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import type { AssetClassTarget } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Payload matches what backend expects (NewAssetClassTarget | AssetClassTarget)
type SaveTargetPayload = Omit<AssetClassTarget, "createdAt" | "updatedAt"> & {
  id?: string;
};

export function useAssetClassMutations() {
  const queryClient = useQueryClient();

  const saveTargetMutation = useMutation({
    mutationFn: async (payload: SaveTargetPayload) => {
      console.log("Sending save payload:", payload);
      const result = await saveAssetClassTarget(payload as any);
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
      console.error("Save failed:", error);
      toast({
        title: "Error",
        description: "Failed to save allocation target",
        variant: "destructive",
      });
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: async (targetId: string) => {
      return deleteAssetClassTarget(targetId);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Allocation target deleted successfully",
      });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.ASSET_CLASS_TARGETS],
      });
    },
    onError: (error) => {
      console.error("Delete failed:", error);
      toast({
        title: "Error",
        description: "Failed to delete allocation target",
        variant: "destructive",
      });
    },
  });

  return { saveTargetMutation, deleteTargetMutation };
}
