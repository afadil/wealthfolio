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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DeleteConfirm } from '@/components/delete-confirm';
import { triggerAllDisableCallbacks } from '@/addon/runtimeContext';
import { reloadAllAddons } from '@/addon/pluginLoader';
import {
  installAddonZip,
  listInstalledAddons,
  toggleAddon,
  uninstallAddon,
  type InstalledAddon,
} from '@/adapters/tauri';

export default function AddonSettingsPage() {
  const [installedAddons, setInstalledAddons] = useState<InstalledAddon[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAddons, setIsLoadingAddons] = useState(true);
  const [togglingAddonId, setTogglingAddonId] = useState<string | null>(null);
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
        filters: [
          { name: 'Addon Packages', extensions: ['zip'] },
        ],
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
      
      const addon = installedAddons.find(a => a.metadata.id === addonId);
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
      const addon = installedAddons.find(a => a.metadata.id === addonId);
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
                    Addons let you extend Wealthfolio with new features, custom analytics, and additional functionality to enhance your financial management experience.
                  </p>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex items-start gap-2">
                    <Icons.AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-amber-600">Security Notice:</span> Only install addons from trusted sources. Addons have access to your application data.
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
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
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
              Get started by installing your first addon package to extend Wealthfolio's functionality.
            </EmptyPlaceholder.Description>
            <div className="flex items-center gap-3">
              <Button onClick={handleLoadAddon} disabled={isLoading}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Install Your First Addon
              </Button>
              <a
                href="https://wealthfolio.app/addons"
                target="_blank"
                rel="noopener noreferrer"
              >
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
                className="group rounded-lg border bg-card p-6 hover:bg-accent/30 transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Header section with name and version */}
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold text-lg truncate">{addon.metadata.name}</h4>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        v{addon.metadata.version}
                      </Badge>
                    </div>
                    
                    {/* Description */}
                    {addon.metadata.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
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
                  <div className="flex items-center gap-4 ml-6">
                    {/* Enable/Disable Switch */}
                    <div className="flex items-center gap-3">
                      <Label 
                        htmlFor={`addon-${addon.metadata.id}`} 
                        className="text-sm font-medium cursor-pointer"
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
                    
                    {/* Delete button with confirmation */}
                    <DeleteConfirm
                      deleteConfirmTitle="Remove Addon"
                      deleteConfirmMessage={
                        <div className="space-y-2">
                          <p>Are you sure you want to remove <strong>{addon.metadata.name}</strong>?</p>
                          <p className="text-sm text-muted-foreground">
                            This action cannot be undone. The addon will be completely removed from your system.
                          </p>
                        </div>
                      }
                      handleDeleteConfirm={() => handleUninstallAddon(addon.metadata.id)}
                      isPending={false}
                      button={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Icons.Trash className="h-4 w-4" />
                          <span className="sr-only">Remove addon</span>
                        </Button>
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 