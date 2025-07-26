import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from '../header';
import { Icons } from '@/components/icons';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { EmptyPlaceholder } from '@/components/empty-placeholder';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DeleteConfirm } from '@/components/delete-confirm';
import { PermissionDialog } from '@/pages/settings/addons/components/addon-permission-dialog';
import { useAddonActions } from './hooks/use-addon-actions';

export default function AddonSettingsPage() {
  const {
    installedAddons,
    isLoading,
    isLoadingAddons,
    togglingAddonId,
    permissionDialog,
    viewPermissionDialog,
    loadInstalledAddons,
    handleLoadAddon,
    handleToggleAddon,
    handleUninstallAddon,
    handleViewPermissions,
    setPermissionDialog,
    setViewPermissionDialog,
  } = useAddonActions();

  const { toast } = useToast();

  // Load installed addons on component mount
  useEffect(() => {
    loadInstalledAddons();
  }, [loadInstalledAddons]);

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
