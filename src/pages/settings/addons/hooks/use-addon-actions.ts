import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';


import { reloadAllAddons } from '@/addons/addons-core';
import {
  installAddon,
  getInstalledAddons,
  toggleAddon,
  uninstallAddon,
  extractAddon,
  clearAddonStaging,
} from '@/commands/addon';
import { type InstalledAddon, type Permission, type ExtractedAddon, logger } from '@/adapters/tauri';
import type { RiskLevel, AddonManifest } from '@wealthfolio/addon-sdk';
import { QueryKeys } from '@/lib/query-keys';

interface PermissionDialogState {
  open: boolean;
  manifest?: AddonManifest;
  permissions?: Permission[];
  riskLevel?: RiskLevel;
  fileData?: Uint8Array;
  onApprove?: () => void;
  onCancel?: () => void;
}

interface ViewPermissionDialogState {
  open: boolean;
  addon?: InstalledAddon;
  permissions?: Permission[];
  riskLevel?: RiskLevel;
}

export function useAddonActions() {
  const [isLoading, setIsLoading] = useState(false);
  const [togglingAddonId, setTogglingAddonId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Permission dialog state
  const [permissionDialog, setPermissionDialog] = useState<PermissionDialogState>({
    open: false,
  });

  // View permissions dialog state
  const [viewPermissionDialog, setViewPermissionDialog] = useState<ViewPermissionDialogState>({
    open: false,
  });

  const { toast } = useToast();

  // Use TanStack Query for installed addons
  const {
    data: installedAddons = [],
    isLoading: isLoadingAddons,
    refetch: loadInstalledAddons,
  } = useQuery({
    queryKey: [QueryKeys.INSTALLED_ADDONS],
    queryFn: getInstalledAddons,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Helper function to calculate risk level from permissions
  const calculateRiskLevel = (permissions: Permission[]): RiskLevel => {
    const hasHighRiskCategories = permissions.some(perm => 
      ['accounts', 'activities', 'settings'].includes(perm.category)
    );
    const hasMediumRiskCategories = permissions.some(perm => 
      ['portfolio', 'files', 'financial-planning'].includes(perm.category)
    );
    
    return hasHighRiskCategories ? 'high' : 
           hasMediumRiskCategories ? 'medium' : 'low';
  };

  const handleLoadAddon = async () => {
    try {
      setIsLoading(true);

      // Open file dialog for ZIP files only
      const filePath = await open({
        filters: [{ name: 'Addon Packages', extensions: ['zip'] }],
        multiple: false,
      });

      if (!filePath || Array.isArray(filePath)) {
        return;
      }

      // Read the ZIP file
      const fileData = await readFile(filePath);
      await handleInstallZipAddon(filePath, fileData);
    } catch (error) {
      logger.error('Error loading addon: ' + (error as Error).message);
      toast({
        title: 'Error loading addon',
        description: error instanceof Error ? error.message : 'Failed to load addon',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstallZipAddon = async (_filePath: string, fileData: Uint8Array) => {
    try {
      // First, extract and analyze the addon to check permissions
      const extractedAddon = await extractAddon(fileData);

      // Calculate risk level based on permissions
      const permissions = extractedAddon.metadata.permissions || [];
      const riskLevel = calculateRiskLevel(permissions);

      // Show permission dialog
      setPermissionDialog({
        open: true,
        manifest: extractedAddon.metadata,
        permissions,
        riskLevel,
        fileData,
        onApprove: async () => {
          setPermissionDialog({ open: false });
          await performAddonInstallation(fileData);
        },
      });
    } catch (error) {
      console.error('Error analyzing addon permissions:', error);
      // If permission analysis fails, show warning and allow user to proceed
      toast({
        title: 'Permission analysis failed',
        description: 'Could not analyze addon permissions. Install at your own risk.',
        variant: 'destructive',
      });

      // Still allow installation but with warning
      await performAddonInstallation(fileData);
    }
  };

  const handleShowPermissionDialog = (extractedAddon: ExtractedAddon, onApprove: () => Promise<void>) => {
    // Calculate risk level based on permissions
    const permissions = extractedAddon.metadata.permissions || [];
    const riskLevel = calculateRiskLevel(permissions);

    // Show permission dialog
    setPermissionDialog({
      open: true,
      manifest: extractedAddon.metadata,
      permissions,
      riskLevel,
      onApprove: async () => {
        setPermissionDialog({ open: false });
        try {
          await onApprove();
          // Invalidate and refetch installed addons query
          queryClient.invalidateQueries({ queryKey: [QueryKeys.INSTALLED_ADDONS] });
          await reloadAllAddons();
          toast({
            title: 'Addon installed successfully',
            description: `${extractedAddon.metadata.name} has been installed and is now active.`,
          });
        } catch (error) {
          // Clear staging for this specific addon on installation failure
          try {
            await clearAddonStaging(extractedAddon.metadata.id);
          } catch (cleanupError) {
            console.error('Failed to clear staging after installation failure:', cleanupError);
          }
          throw error;
        }
      },
      onCancel: async () => {
        setPermissionDialog({ open: false });
        // Clear staging for this specific addon on cancellation
        try {
          await clearAddonStaging(extractedAddon.metadata.id);
        } catch (error) {
          console.error('Failed to clear staging directory:', error);
        }
      },
    });
  };

  const performAddonInstallation = async (fileData: Uint8Array) => {
    try {
      // Install the ZIP addon persistently
      const metadata = await installAddon(fileData, true);

      // Invalidate and refetch installed addons query
      queryClient.invalidateQueries({ queryKey: [QueryKeys.INSTALLED_ADDONS] });

      // Reload all addons to load the newly installed addon immediately
      await reloadAllAddons();

      toast({
        title: 'Addon installed successfully',
        description: `${metadata.name} has been installed and is now active.`,
      });
    } catch (error) {
      console.error('Error installing ZIP addon:', error);
      throw error;
    }
  };

  const handleToggleAddon = async (addonId: string, currentEnabled: boolean) => {
    try {
      setTogglingAddonId(addonId);
      const newEnabled = !currentEnabled;
      await toggleAddon(addonId, newEnabled);

      // Invalidate and refetch installed addons query
      queryClient.invalidateQueries({ queryKey: [QueryKeys.INSTALLED_ADDONS] });

      const addon = installedAddons.find((a) => a.metadata.id === addonId);
      if (addon) {
        toast({
          title: `Addon ${newEnabled ? 'enabled' : 'disabled'}`,
          description: `${addon.metadata.name} has been ${newEnabled ? 'enabled' : 'disabled'}.`,
        });
      }

      // Reload all addons to apply the changes immediately
      await reloadAllAddons();
    } catch (error) {
      console.error('Error toggling addon:', error);
      toast({
        title: 'Error toggling addon',
        description: error instanceof Error ? error.message : 'Failed to toggle addon',
        variant: 'destructive',
      });
    } finally {
      setTogglingAddonId(null);
    }
  };

  const handleUninstallAddon = async (addonId: string) => {
    try {
      const addon = installedAddons.find((a) => a.metadata.id === addonId);
      if (!addon) return;

      await uninstallAddon(addonId);

      // Invalidate and refetch installed addons query
      queryClient.invalidateQueries({ queryKey: [QueryKeys.INSTALLED_ADDONS] });

      toast({
        title: 'Addon uninstalled',
        description: `${addon.metadata.name} has been completely removed.`,
      });

      // Reload all addons to remove the uninstalled addon from runtime
      await reloadAllAddons();
    } catch (error) {
      console.error('Error uninstalling addon:', error);
      toast({
        title: 'Error uninstalling addon',
        description: error instanceof Error ? error.message : 'Failed to uninstall addon',
        variant: 'destructive',
      });
    }
  };

  const handleViewPermissions = async (addon: InstalledAddon) => {
    try {
      // Use the stored permissions from the addon metadata
      const storedPermissions = addon.metadata.permissions || [];
      
      // Calculate risk level based on stored permissions
      const riskLevel = calculateRiskLevel(storedPermissions);

      setViewPermissionDialog({
        open: true,
        addon,
        permissions: storedPermissions,
        riskLevel,
      });
    } catch (error) {
      console.error('Error loading addon permissions:', error);
      toast({
        title: 'Error loading permissions',
        description: 'Could not load addon permissions.',
        variant: 'destructive',
      });
    }
  };

  return {
    // State
    installedAddons,
    isLoading,
    isLoadingAddons,
    togglingAddonId,
    permissionDialog,
    viewPermissionDialog,
    
    // Actions
    loadInstalledAddons,
    handleLoadAddon,
    handleInstallZipAddon,
    handleShowPermissionDialog,
    handleToggleAddon,
    handleUninstallAddon,
    handleViewPermissions,
    
    // Dialog setters
    setPermissionDialog,
    setViewPermissionDialog,
  };
}
