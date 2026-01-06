import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logger } from "@/adapters";
import { deleteAsset, updateAssetDataSource, updateAssetProfile } from "@/commands/market-data";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import { UpdateAssetProfile } from "@/lib/types";

interface UpdateAssetArgs {
  assetId: string;
  payload: UpdateAssetProfile;
  preferredProvider?: string;
}

export const useAssetManagement = () => {
  const queryClient = useQueryClient();

  const invalidateCaches = (assetId: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, assetId] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
  };

  const updateAssetMutation = useMutation({
    mutationFn: async ({ assetId, payload, preferredProvider }: UpdateAssetArgs) => {
      let updated = await updateAssetProfile(payload);
      if (preferredProvider && preferredProvider !== updated.preferredProvider) {
        updated = await updateAssetDataSource(assetId, preferredProvider);
      }
      return updated;
    },
    onSuccess: (asset) => {
      invalidateCaches(asset.id);
      toast({
        title: "Security updated",
        description: "Changes saved successfully.",
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error updating asset: ${error}`);
      toast({
        title: "Update failed",
        description: "There was a problem saving the security.",
        variant: "destructive",
      });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: (_, assetId) => {
      invalidateCaches(assetId);
      toast({
        title: "Security deleted",
        description: "The security has been removed.",
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error deleting asset: ${error}`);

      // Extract user-friendly error message
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's the "asset has activities" error
      const isActivitiesError = errorMessage.toLowerCase().includes("existing activities");

      toast({
        title: "Unable to delete security",
        description: isActivitiesError
          ? "This security cannot be deleted because it has existing activities. Please delete all associated activities first."
          : errorMessage || "The security could not be removed right now.",
        variant: "destructive",
      });
    },
  });

  return { updateAssetMutation, deleteAssetMutation };
};
