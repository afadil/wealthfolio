import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { updateAssetProfile, updateQuoteMode, logger } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";

export const useAssetProfileMutations = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation("common");

  const handleSuccess = (messageKey: "asset.profile.toast.update_success" | "asset.profile.toast.quote_mode_success", assetId: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, assetId] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
    toast({
      title: t(messageKey),
      variant: "success",
    });
  };

  const handleError = (
    descriptionKey:
      | "asset.profile.toast.error_profile_update"
      | "asset.profile.toast.error_quote_mode_update",
  ) => {
    toast({
      title: t("asset.profile.toast.error_title"),
      description: t(descriptionKey),
      variant: "destructive",
    });
  };

  const updateAssetProfileMutation = useMutation({
    mutationFn: updateAssetProfile,
    onSuccess: (result) => {
      handleSuccess("asset.profile.toast.update_success", result.id);
    },
    onError: (error) => {
      logger.error(`Error updating asset profile: ${error}`);
      handleError("asset.profile.toast.error_profile_update");
    },
  });

  const updateQuoteModeMutation = useMutation({
    mutationFn: ({ assetId, quoteMode }: { assetId: string; quoteMode: string }) =>
      updateQuoteMode(assetId, quoteMode),
    onSuccess: (result) => {
      handleSuccess("asset.profile.toast.quote_mode_success", result.id);
    },
    onError: (error) => {
      logger.error(`Error updating asset quote mode: ${error}`);
      handleError("asset.profile.toast.error_quote_mode_update");
    },
  });

  return {
    updateAssetProfileMutation,
    updateQuoteModeMutation,
  };
};
