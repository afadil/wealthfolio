import {
  logger,
  clearAddonStaging,
  downloadAddonForReview,
  fetchAddonStoreListings,
  getAddonRatings,
  installFromStaging,
  submitAddonRating,
} from "@/adapters";
import type { ExtractedAddon } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { AddonStoreListing } from "@/lib/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@wealthfolio/ui/components/ui/use-toast";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function useAddonStore() {
  const { t } = useTranslation();
  const [isInstalling, setIsInstalling] = useState<string | null>(null);
  const [isSubmittingRating, setIsSubmittingRating] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Use TanStack Query for store listings
  const {
    data: storeListings = [],
    isLoading: isLoadingStore,
    refetch: fetchStoreListings,
    error: storeError,
  } = useQuery({
    queryKey: [QueryKeys.ADDON_STORE_LISTINGS],
    queryFn: () => fetchAddonStoreListings(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Handle errors separately
  useEffect(() => {
    if (storeError) {
      logger.error(`Failed to fetch store listings: ${String(storeError)}`);
      toast({
        title: t("settings.addons.hooks.store_load_failed_title"),
        description:
          storeError instanceof Error
            ? storeError.message
            : t("settings.addons.hooks.unknown_error"),
        variant: "destructive",
      });
    }
  }, [storeError, toast]);

  const installFromStore = useCallback(
    async (
      listing: AddonStoreListing,
      enableAfterInstall = true,
      onShowPermissionDialog?: (
        extractedAddon: ExtractedAddon,
        onApprove: () => Promise<void>,
      ) => void,
    ) => {
      if (!onShowPermissionDialog) {
        toast({
          title: t("settings.addons.hooks.permission_handler_missing_title"),
          description: t("settings.addons.hooks.permission_handler_missing_description"),
          variant: "destructive",
        });
        return;
      }

      setIsInstalling(listing.id);
      try {
        // Download addon to staging directory and analyze permissions
        const extractedAddon = await downloadAddonForReview(listing.id);

        // Show permission dialog with pre-analyzed addon
        onShowPermissionDialog(extractedAddon, async () => {
          // Install from staging after permission approval
          await installFromStaging(listing.id, enableAfterInstall);
          // Invalidate installed addons cache to refresh the list
          queryClient.invalidateQueries({ queryKey: [QueryKeys.INSTALLED_ADDONS] });
        });
      } catch (error) {
        logger.error(`Failed to prepare addon from store: ${String(error)}`);

        // Clean up staging on error
        try {
          await clearAddonStaging(listing.id);
        } catch (cleanupError) {
          logger.error(`Failed to clean up staging after error: ${String(cleanupError)}`);
        }
        toast({
          title: t("settings.addons.hooks.installation_failed_title"),
          description:
            error instanceof Error
              ? error.message
              : t("settings.addons.hooks.installation_failed_description"),
          variant: "destructive",
        });
        throw error;
      } finally {
        setIsInstalling(null);
      }
    },
    [toast, queryClient],
  );

  const isAddonInstalling = useCallback(
    (addonId: string) => {
      return isInstalling === addonId;
    },
    [isInstalling],
  );

  const clearStaging = useCallback(async () => {
    try {
      await clearAddonStaging();
    } catch (error) {
      logger.error(`Failed to clear staging directory: ${String(error)}`);
      toast({
        title: t("settings.addons.hooks.clear_staging_failed_title"),
        description:
          error instanceof Error
            ? error.message
            : t("settings.addons.hooks.clear_staging_failed_description"),
        variant: "destructive",
      });
    }
  }, [toast]);

  const submitRating = useCallback(
    async (addonId: string, rating: number, review?: string) => {
      setIsSubmittingRating(addonId);
      try {
        await submitAddonRating(addonId, rating, review);

        toast({
          title: t("settings.addons.hooks.rating_submitted_title"),
          description: t("settings.addons.hooks.rating_submitted_description"),
        });

        // Invalidate store listings to refresh ratings data
        queryClient.invalidateQueries({ queryKey: [QueryKeys.ADDON_STORE_LISTINGS] });
      } catch (error) {
        logger.error(`Failed to submit rating: ${String(error)}`);
        toast({
          title: t("settings.addons.hooks.rating_submit_failed_title"),
          description:
            error instanceof Error
              ? error.message
              : t("settings.addons.hooks.rating_submit_failed_description"),
          variant: "destructive",
        });
        throw error;
      } finally {
        setIsSubmittingRating(null);
      }
    },
    [toast, queryClient],
  );

  const getRatings = useCallback(
    async (addonId: string) => {
      try {
        return await getAddonRatings(addonId);
      } catch (error) {
        logger.error(`Failed to fetch ratings: ${String(error)}`);
        toast({
          title: t("settings.addons.hooks.ratings_load_failed_title"),
          description:
            error instanceof Error
              ? error.message
              : t("settings.addons.hooks.ratings_load_failed_description"),
          variant: "destructive",
        });
        throw error;
      }
    },
    [toast],
  );

  const isRatingSubmitting = useCallback(
    (addonId: string) => {
      return isSubmittingRating === addonId;
    },
    [isSubmittingRating],
  );

  return {
    storeListings,
    isLoadingStore,
    isInstalling,
    fetchStoreListings,
    installFromStore,
    isAddonInstalling,
    clearStaging,
    submitRating,
    getRatings,
    isRatingSubmitting,
  };
}
