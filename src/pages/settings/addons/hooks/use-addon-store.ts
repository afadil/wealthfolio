import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@wealthfolio/ui';
import { downloadAndExtractAddon, installAddonFromStore } from '@/commands/addon';
import type { AddonStoreListing } from '@/lib/types';
import type { ExtractedAddon } from '@/adapters/tauri';
import { QueryKeys } from '@/lib/query-keys';

export function useAddonStore() {
  const [isInstalling, setIsInstalling] = useState<string | null>(null);
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
    queryFn: () => invoke<AddonStoreListing[]>('fetch_addon_store_listings'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Handle errors separately
  if (storeError) {
    console.error('Failed to fetch store listings:', storeError);
    toast({
      title: 'Failed to load addon store',
      description: storeError instanceof Error ? storeError.message : 'Unknown error occurred',
      variant: 'destructive',
    });
  }

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
      // More efficient: Download and extract in backend (no binary data transfer to frontend)
      const extractedAddon = await downloadAndExtractAddon(listing.downloadUrl);
      
      // Show permission dialog with pre-analyzed addon
      onShowPermissionDialog(extractedAddon, async () => {
        // Install directly from store after permission approval
        await installAddonFromStore(listing.downloadUrl, enableAfterInstall);
        // Invalidate installed addons cache to refresh the list
        queryClient.invalidateQueries({ queryKey: [QueryKeys.INSTALLED_ADDONS] });
      });
      
    } catch (error) {
      console.error('Failed to install addon from store:', error);
      toast({
        title: 'Installation failed',
        description: error instanceof Error ? error.message : 'Failed to install addon',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsInstalling(null);
    }
  }, [toast]);

  const isAddonInstalling = useCallback((addonId: string) => {
    return isInstalling === addonId;
  }, [isInstalling]);

  return {
    storeListings,
    isLoadingStore,
    isInstalling,
    fetchStoreListings,
    installFromStore,
    isAddonInstalling,
  };
}
