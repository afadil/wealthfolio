import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { Icons } from '@/components/icons';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { EmptyPlaceholder } from '@/components/empty-placeholder';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { triggerAllDisableCallbacks } from '@/addon/runtimeContext';
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
      
      toast({
        title: 'Addon installed successfully',
        description: `${metadata.name} has been installed and will load on next app startup.`,
      });
      
    } catch (error) {
      console.error('Error installing ZIP addon:', error);
      throw error;
    }
  };

  const handleToggleAddon = async (addonId: string, currentEnabled: boolean) => {
    try {
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

      // If disabling, trigger cleanup callbacks
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

      // Trigger disable callbacks for cleanup
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

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Unknown';
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
                  <h4 className="font-medium">📦 ZIP Addon Packages</h4>
                  <p className="text-sm text-muted-foreground">
                    Install complete addon packages with manifest.json, assets, and dependencies.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ZIP files should contain a manifest.json file with addon metadata.
                  </p>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    Installed addons are stored in your app data directory and automatically load when you restart Wealthfolio.
                  </p>
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
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium truncate">{addon.metadata.name}</h4>
                    <Badge variant={addon.metadata.enabled ? 'default' : 'secondary'} className="shrink-0">
                      {addon.metadata.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Badge variant="outline" className="shrink-0">v{addon.metadata.version}</Badge>
                    <Badge variant="secondary" className="shrink-0">📦 ZIP</Badge>
                  </div>
                  
                  {addon.metadata.description && (
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                      {addon.metadata.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {addon.metadata.author && <span>By {addon.metadata.author}</span>}
                    <span>ID: {addon.metadata.id}</span>
                    {addon.metadata.sdkVersion && <span>SDK: v{addon.metadata.sdkVersion}</span>}
                    {addon.metadata.main && <span>Entry: {addon.metadata.main}</span>}
                    {addon.metadata.installed_at && (
                      <span>Installed: {formatDate(addon.metadata.installed_at)}</span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleAddon(addon.metadata.id, addon.metadata.enabled)}
                  >
                    {addon.metadata.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUninstallAddon(addon.metadata.id)}
                  >
                    <Icons.Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 