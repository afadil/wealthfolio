import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateAssetProfile, updatePricingMode } from "@/commands/market-data";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import { logger } from "@/adapters";

export const useAssetProfileMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, assetId: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, assetId] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
    toast({
      title: message,
      variant: "success",
    });
  };

  const handleError = (action: string) => {
    toast({
      title: "Uh oh! Something went wrong.",
      description: `There was a problem ${action}.`,
      variant: "destructive",
    });
  };

  const updateAssetProfileMutation = useMutation({
    mutationFn: updateAssetProfile,
    onSuccess: (result) => {
      handleSuccess("Asset profile updated successfully.", result.id);
    },
    onError: (error) => {
      logger.error(`Error updating asset profile: ${error}`);
      handleError("updating the asset profile");
    },
  });

  const updatePricingModeMutation = useMutation({
    mutationFn: ({ assetId, pricingMode }: { assetId: string; pricingMode: string }) =>
      updatePricingMode(assetId, pricingMode),
    onSuccess: (result) => {
      handleSuccess("Asset pricing mode updated successfully.", result.id);
    },
    onError: (error) => {
      logger.error(`Error updating asset pricing mode: ${error}`);
      handleError("updating the asset pricing mode");
    },
  });

  return {
    updateAssetProfileMutation,
    updatePricingModeMutation,
  };
};
