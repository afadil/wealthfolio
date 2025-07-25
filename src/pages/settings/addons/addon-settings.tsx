import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { Icons } from '@/components/icons';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { EmptyPlaceholder } from '@/components/empty-placeholder';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DeleteConfirm } from '@/components/delete-confirm';
import { PermissionDialog } from '@/pages/settings/addons/components/addon-permission-dialog';
import { triggerAllDisableCallbacks } from '@/addon/runtimeContext';
import { reloadAllAddons } from '@/addon/pluginLoader';
import {
  installAddonZip,
  listInstalledAddons,
  toggleAddon,
  uninstallAddon,
  extractAddonZip,
} from '@/commands/addon';
import type { InstalledAddon } from '@/adapters/tauri';
import type { Permission, RiskLevel } from '@wealthfolio/addon-sdk';

export default function AddonSettingsPage() {
  const [installedAddons, setInstalledAddons] = useState<InstalledAddon[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAddons, setIsLoadingAddons] = useState(true);
  const [togglingAddonId, setTogglingAddonId] = useState<string | null>(null);

  // Permission dialog state
  const [permissionDialog, setPermissionDialog] = useState<{
    open: boolean;
    manifest?: any;
    permissions?: Permission[];
    riskLevel?: RiskLevel;
    fileData?: Uint8Array;
    onApprove?: () => void;
  }>({
    open: false,
  });

  // View permissions dialog state
  const [viewPermissionDialog, setViewPermissionDialog] = useState<{
    open: boolean;
    addon?: InstalledAddon;
    permissions?: Permission[];
    riskLevel?: RiskLevel;
  }>({
    open: false,
  });

  const { toast } = useToast();

  // Load installed addons on component mount
  useEffect(() => {
    loadInstalledAddons();
  }, []);

  const loadInstalledAddons = async () => {
    try {
      setIsLoadingAddons(true);
      const addons = await listInstalledAddons();
      setInstalledAddons(addons);
    } catch (error) {
      console.error('Error loading installed addons:', error);
      toast({
        title: 'Error loading addons',
        description: error instanceof Error ? error.message : 'Failed to load installed addons',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAddons(false);
    }
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
      console.error('Error loading addon:', error);
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
      const extractedAddon = await extractAddonZip(fileData);

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

  const performAddonInstallation = async (fileData: Uint8Array) => {
    try {
      // Install the ZIP addon persistently
      const metadata = await installAddonZip(fileData, true);

      // Refresh the addon list
      await loadInstalledAddons();

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

      // Refresh the addon list
      await loadInstalledAddons();

      const addon = installedAddons.find((a) => a.metadata.id === addonId);
      if (addon) {
        toast({
          title: `Addon ${newEnabled ? 'enabled' : 'disabled'}`,
          description: `${addon.metadata.name} has been ${newEnabled ? 'enabled' : 'disabled'}.`,
        });
      }

      // Reload all addons to apply the changes immediately
      await reloadAllAddons();

      // If disabling, trigger cleanup callbacks (this is now redundant since reloadAllAddons handles it)
      if (!newEnabled) {
        triggerAllDisableCallbacks();
      }
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

      // Refresh the addon list
      await loadInstalledAddons();

      toast({
        title: 'Addon uninstalled',
        description: `${addon.metadata.name} has been completely removed.`,
      });

      // Reload all addons to remove the uninstalled addon from runtime
      await reloadAllAddons();

      // Trigger disable callbacks for cleanup (this is now redundant since reloadAllAddons handles it)
      triggerAllDisableCallbacks();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SettingsHeader
          heading="Addon Manager"
          text="Install and manage ZIP addon packages to extend Wealthfolio's functionality."
        />

        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Icons.Info className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-3">
                <div className="space-y-2">
                  <h4 className="font-medium">🔌 Addons & Extensions</h4>
                  <p className="text-sm text-muted-foreground">
                    Addons let you extend Wealthfolio with new features, custom analytics, and
                    additional functionality to enhance your financial management experience.
                  </p>
                </div>
                <div className="border-t pt-2">
                  <div className="flex items-start gap-2">
                    <Icons.AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-amber-600">Security Notice:</span> Only
                      install addons from trusted sources. Addons have access to your application
                      data.
                    </p>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button onClick={handleLoadAddon} disabled={isLoading}>
            {isLoading ? (
              <>
                <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Install Addon
              </>
            )}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Installed Addons</h3>
            <p className="text-sm text-muted-foreground">
              {installedAddons.length} addon{installedAddons.length !== 1 ? 's' : ''} installed
            </p>
          </div>

          <a
            href="https://wealthfolio.app/addons"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Browse Plugin Store
            <Icons.Globe className="h-3 w-3" />
          </a>
        </div>

        {isLoadingAddons ? (
          <div className="flex items-center justify-center py-12">
            <Icons.Loader className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading addons...</span>
          </div>
        ) : installedAddons.length === 0 ? (
          <EmptyPlaceholder>
            <EmptyPlaceholder.Icon name="FileText" />
            <EmptyPlaceholder.Title>No addons installed</EmptyPlaceholder.Title>
            <EmptyPlaceholder.Description>
              Get started by installing your first addon package to extend Wealthfolio's
              functionality.
            </EmptyPlaceholder.Description>
            <div className="flex items-center gap-3">
              <Button onClick={handleLoadAddon} disabled={isLoading}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Install Your First Addon
              </Button>
              <a href="https://wealthfolio.app/addons" target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  Browse Store
                  <Icons.Globe className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </EmptyPlaceholder>
        ) : (
          <div className="space-y-3">
            {installedAddons.map((addon) => (
              <div
                key={addon.metadata.id}
                className="group rounded-lg border bg-card p-6 transition-all duration-200 hover:bg-accent/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    {/* Header section with name and version */}
                    <div className="flex items-center gap-3">
                      <h4 className="truncate text-lg font-semibold">{addon.metadata.name}</h4>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        v{addon.metadata.version}
                      </Badge>
                    </div>

                    {/* Description */}
                    {addon.metadata.description && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {addon.metadata.description}
                      </p>
                    )}

                    {/* Author info */}
                    {addon.metadata.author && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Icons.Users className="h-4 w-4" />
                        <span>By {addon.metadata.author}</span>
                      </div>
                    )}
                  </div>

                  {/* Controls section */}
                  <div className="ml-6 flex items-center gap-2">
                    {/* Permissions button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewPermissions(addon)}
                      className="h-9 w-9 p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                    >
                      <Icons.Settings className="h-4 w-4" />
                      <span className="sr-only">View permissions</span>
                    </Button>

                    {/* Delete button with confirmation */}
                    <DeleteConfirm
                      deleteConfirmTitle="Remove Addon"
                      deleteConfirmMessage={
                        <div className="space-y-2">
                          <p>
                            Are you sure you want to remove <strong>{addon.metadata.name}</strong>?
                          </p>
                          <p className="text-sm text-muted-foreground">
                            This action cannot be undone. The addon will be completely removed from
                            your system.
                          </p>
                        </div>
                      }
                      handleDeleteConfirm={() => handleUninstallAddon(addon.metadata.id)}
                      isPending={false}
                      button={
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        >
                          <Icons.Trash className="h-4 w-4" />
                          <span className="sr-only">Remove addon</span>
                        </Button>
                      }
                    />

                    {/* Enable/Disable Switch */}
                    <div className="mr-2 flex items-center gap-3">
                      <Label
                        htmlFor={`addon-${addon.metadata.id}`}
                        className="cursor-pointer text-sm font-medium"
                      >
                        {togglingAddonId === addon.metadata.id
                          ? 'Loading...'
                          : addon.metadata.enabled
                            ? 'Enabled'
                            : 'Disabled'}
                      </Label>
                      <Switch
                        id={`addon-${addon.metadata.id}`}
                        checked={addon.metadata.enabled}
                        onCheckedChange={(checked) =>
                          handleToggleAddon(addon.metadata.id, !checked)
                        }
                        className="data-[state=checked]:bg-green-600"
                        disabled={togglingAddonId === addon.metadata.id}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Permission Dialog */}
      <PermissionDialog
        open={permissionDialog.open}
        onOpenChange={(open) => setPermissionDialog({ ...permissionDialog, open })}
        manifest={permissionDialog.manifest}
        declaredPermissions={permissionDialog.permissions || []}
        riskLevel={permissionDialog.riskLevel || 'low'}
        onApprove={() => {
          if (permissionDialog.onApprove) {
            permissionDialog.onApprove();
          }
        }}
        onDeny={() => {
          setPermissionDialog({ open: false });
          toast({
            title: 'Installation cancelled',
            description: 'Addon installation was cancelled by user.',
          });
        }}
      />

      {/* View Permissions Dialog */}
      {viewPermissionDialog.addon && (
        <PermissionDialog
          open={viewPermissionDialog.open}
          onOpenChange={(open) => setViewPermissionDialog({ ...viewPermissionDialog, open })}
          manifest={viewPermissionDialog.addon.metadata}
          declaredPermissions={viewPermissionDialog.permissions || []}
          riskLevel={viewPermissionDialog.riskLevel || 'low'}
          onApprove={() => {
            setViewPermissionDialog({ open: false });
          }}
          onDeny={() => {
            setViewPermissionDialog({ open: false });
          }}
          isViewOnly={true}
        />
      )}
    </div>
  );
}
