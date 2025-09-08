import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@wealthfolio/ui';
import { downloadAddonForReview, installFromStaging, clearAddonStaging, submitAddonRating, getAddonRatings, fetchAddonStoreListings } from '@/commands/addon';
import type { AddonStoreListing } from '@/lib/types';
import type { ExtractedAddon } from '@/adapters/tauri';
import { QueryKeys } from '@/lib/query-keys';

export function useAddonStore() {
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
      console.error('Failed to fetch store listings:', storeError);
      toast({
        title: 'Failed to load addon store',
        description: storeError instanceof Error ? storeError.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  }, [storeError, toast]);

  const installFromStore = useCallback(async (
    listing: AddonStoreListing,
    enableAfterInstall: boolean = true,
    onShowPermissionDialog?: (extractedAddon: ExtractedAddon, onApprove: () => Promise<void>) => void
  ) => {
    if (!onShowPermissionDialog) {
      toast({
        title: 'Permission handler not provided',
        description: 'Please use the addon actions hook for installation.',
        variant: 'destructive',
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
      console.error('Failed to prepare addon from store:', error);
      // Clean up staging on error
      try {
        await clearAddonStaging(listing.id);
      } catch (cleanupError) {
        console.error('Failed to clean up staging after error:', cleanupError);
      }
      toast({
        title: 'Installation failed',
        description: error instanceof Error ? error.message : 'Failed to prepare addon',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsInstalling(null);
    }
  }, [toast, queryClient]);

  const isAddonInstalling = useCallback((addonId: string) => {
    return isInstalling === addonId;
  }, [isInstalling]);

  const clearStaging = useCallback(async () => {
    try {
      await clearAddonStaging();
    } catch (error) {
      console.error('Failed to clear staging directory:', error);
      toast({
        title: 'Failed to clear staging',
        description: error instanceof Error ? error.message : 'Failed to clear staging directory',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const submitRating = useCallback(async (
    addonId: string,
    rating: number,
    review?: string
  ) => {
    setIsSubmittingRating(addonId);
    try {
      await submitAddonRating(addonId, rating, review);
      
      toast({
        title: 'Rating submitted',
        description: 'Thank you for your feedback!',
      });
      
      // Invalidate store listings to refresh ratings data
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ADDON_STORE_LISTINGS] });
      
    } catch (error) {
      console.error('Failed to submit rating:', error);
      toast({
        title: 'Rating submission failed',
        description: error instanceof Error ? error.message : 'Failed to submit rating',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsSubmittingRating(null);
    }
  }, [toast, queryClient]);

  const getRatings = useCallback(async (addonId: string) => {
    try {
      return await getAddonRatings(addonId);
    } catch (error) {
      console.error('Failed to fetch ratings:', error);
      toast({
        title: 'Failed to load ratings',
        description: error instanceof Error ? error.message : 'Failed to fetch addon ratings',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const isRatingSubmitting = useCallback((addonId: string) => {
    return isSubmittingRating === addonId;
  }, [isSubmittingRating]);

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
