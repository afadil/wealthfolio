import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { Icons } from '@/components/icons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
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
      <SettingsHeader
        heading="Addon Manager"
        text="Install and manage ZIP addon packages to extend Wealthfolio's functionality. Addons are stored persistently and load automatically on app startup."
      />
      
      <Separator />

      <div className="space-y-6">
        {/* Install New Addon Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icons.Import className="h-5 w-5" />
              Install New Addon
            </CardTitle>
            <CardDescription>
              Install addon packages from ZIP files. Addons will be permanently stored and loaded on startup.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={handleLoadAddon} 
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? (
                <>
                  <Icons.Loader className="mr-2 h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : (
                <>
                  <Icons.FileUp className="mr-2 h-4 w-4" />
                  Install ZIP Addon
                </>
              )}
            </Button>
            
            <div className="rounded-lg bg-muted p-4">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <span>📦</span>
                ZIP Addon Packages
              </h4>
              <p className="text-sm text-muted-foreground mb-2">
                Install complete addon packages with manifest.json, assets, and dependencies.
              </p>
              <p className="text-xs text-muted-foreground">
                ZIP files should contain a manifest.json file with addon metadata.
              </p>
            </div>
            
            <Alert>
              <Icons.Info className="h-4 w-4" />
              <AlertDescription>
                Installed addons are stored in your app data directory and automatically load when you restart Wealthfolio.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Installed Addons Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icons.FileText className="h-5 w-5" />
              Installed Addons ({installedAddons.length})
            </CardTitle>
            <CardDescription>
              Manage your installed addon packages. Changes are saved automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAddons ? (
              <div className="flex items-center justify-center py-8">
                <Icons.Loader className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading addons...</span>
              </div>
            ) : installedAddons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Icons.FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No addons installed</h3>
                <p className="text-sm text-muted-foreground">
                  Install your first ZIP addon package to get started.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {installedAddons.map((addon) => (
                    <div
                      key={addon.metadata.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{addon.metadata.name}</h4>
                          <Badge variant={addon.metadata.enabled ? 'default' : 'secondary'}>
                            {addon.metadata.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <Badge variant="outline">v{addon.metadata.version}</Badge>
                          <Badge variant="secondary">📦 ZIP</Badge>
                        </div>
                        {addon.metadata.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {addon.metadata.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {addon.metadata.author && <span>By {addon.metadata.author}</span>}
                          <span>ID: {addon.metadata.id}</span>
                          {addon.metadata.sdkVersion && <span>SDK: v{addon.metadata.sdkVersion}</span>}
                          {addon.metadata.main && <span>Entry: {addon.metadata.main}</span>}
                        </div>
                        {addon.metadata.installed_at && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Installed: {formatDate(addon.metadata.installed_at)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
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
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 