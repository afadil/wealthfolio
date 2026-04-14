import { useMutation, useQueryClient } from "@tanstack/react-query";

import { logger, createAsset, deleteAsset, updateAssetProfile } from "@/adapters";
import i18n from "@/i18n/i18n";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import { NewAsset, UpdateAssetProfile } from "@/lib/types";

interface UpdateAssetArgs {
  payload: UpdateAssetProfile;
}

export const useAssetManagement = () => {
  const queryClient = useQueryClient();

  const invalidateCaches = (assetId: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSETS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, assetId] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
  };

  const createAssetMutation = useMutation({
    mutationFn: (payload: NewAsset) => createAsset(payload),
    onSuccess: (asset) => {
      invalidateCaches(asset.id);
      const name =
        asset.displayCode ?? asset.name ?? i18n.t("asset.management.default_security_name");
      toast({
        title: i18n.t("asset.management.toast.create_success_title"),
        description: i18n.t("asset.management.toast.create_success_desc", { name }),
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error creating asset: ${error}`);
      toast({
        title: i18n.t("asset.management.toast.create_failed_title"),
        description:
          error instanceof Error ? error.message : i18n.t("asset.management.toast.create_failed_desc"),
        variant: "destructive",
      });
    },
  });

  const updateAssetMutation = useMutation({
    mutationFn: async ({ payload }: UpdateAssetArgs) => {
      return await updateAssetProfile(payload);
    },
    onSuccess: (_asset) => {
      invalidateCaches(_asset.id);
      toast({
        title: i18n.t("asset.management.toast.update_success_title"),
        description: i18n.t("asset.management.toast.update_success_desc"),
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error updating asset: ${error}`);
      toast({
        title: i18n.t("asset.management.toast.update_failed_title"),
        description: i18n.t("asset.management.toast.update_failed_desc"),
        variant: "destructive",
      });
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: (_, assetId) => {
      invalidateCaches(assetId);
      toast({
        title: i18n.t("asset.management.toast.delete_success_title"),
        description: i18n.t("asset.management.toast.delete_success_desc"),
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
        title: i18n.t("asset.management.toast.delete_failed_title"),
        description: isActivitiesError
          ? i18n.t("asset.management.toast.delete_failed_activities")
          : errorMessage || i18n.t("asset.management.toast.delete_failed_generic"),
        variant: "destructive",
      });
    },
  });

  return { createAssetMutation, updateAssetMutation, deleteAssetMutation };
};
