import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/ui/icons';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { updateAddon } from '@/commands/addon';
import { reloadAllAddons } from '@/addons/addons-core';
import type { AddonUpdateInfo } from '@wealthfolio/addon-sdk';

interface AddonUpdateCardProps {
  addonId: string;
  addonName: string;
  updateInfo: AddonUpdateInfo;
  onUpdateComplete?: () => void;
  disabled?: boolean;
}

export function AddonUpdateCard({
  addonId,
  addonName,
  updateInfo,
  onUpdateComplete,
  disabled = false,
}: AddonUpdateCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const { toast } = useToast();

  const handleUpdate = async () => {
    if (!updateInfo.downloadUrl) {
      toast({
        title: 'Update not available',
        description: 'No download URL available for this update.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUpdating(true);
      
      await updateAddon(addonId);
      
      // Reload addons to apply the update
      await reloadAllAddons();
      
      toast({
        title: 'Update successful',
        description: `${addonName} has been updated to version ${updateInfo.latestVersion}.`,
      });
      
      onUpdateComplete?.();
    } catch (error) {
      console.error('Error updating addon:', error);
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update addon',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getUpdateBadgeVariant = () => {
    if (updateInfo.isCritical) return 'destructive';
    if (updateInfo.hasBreakingChanges) return 'secondary';
    return 'default';
  };

  const getUpdateBadgeText = () => {
    if (updateInfo.isCritical) return 'Critical Update';
    if (updateInfo.hasBreakingChanges) return 'Breaking Changes';
    return null; // Don't show badge for regular updates
  };

  if (!updateInfo.updateAvailable) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Icons.ArrowUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="font-medium text-amber-900 dark:text-amber-100">Update Available</h4>
            {getUpdateBadgeText() && (
              <Badge variant={getUpdateBadgeVariant()} className="text-xs">
                {getUpdateBadgeText()}
              </Badge>
            )}
          </div>
          
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p>
              {updateInfo.currentVersion} → <span className="font-medium">{updateInfo.latestVersion}</span>
            </p>
            {updateInfo.releaseDate && (
              <p className="text-xs opacity-80">Released: {new Date(updateInfo.releaseDate).toLocaleDateString()}</p>
            )}
          </div>

          {updateInfo.releaseNotes && (
            <p className="line-clamp-2 text-sm text-amber-700 dark:text-amber-300">
              {updateInfo.releaseNotes}
            </p>
          )}
        </div>

        <div className="ml-4 flex items-center gap-2">
          {(updateInfo.releaseNotes || updateInfo.changelogUrl) && (
            <Dialog open={showReleaseNotes} onOpenChange={setShowReleaseNotes}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Icons.FileText className="mr-1 h-3 w-3" />
                  Release Notes
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Release Notes - {addonName} v{updateInfo.latestVersion}</DialogTitle>
                  <DialogDescription>
                    What's new in this version
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-96">
                  <div className="space-y-4">
                    {updateInfo.releaseNotes && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Release Notes</h4>
                        <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {updateInfo.releaseNotes}
                        </div>
                      </div>
                    )}
                    
                    {updateInfo.changelogUrl && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h4 className="font-medium">Full Changelog</h4>
                          <a
                            href={updateInfo.changelogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            View detailed changelog
                            <Icons.Globe className="ml-1 h-3 w-3" />
                          </a>
                        </div>
                      </>
                    )}

                    {updateInfo.hasBreakingChanges && (
                      <>
                        <Separator />
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                          <div className="flex items-start gap-2">
                            <Icons.AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            <div>
                              <h5 className="font-medium text-destructive">Breaking Changes</h5>
                              <p className="text-sm text-destructive/80">
                                This update includes breaking changes that may affect addon functionality.
                                Please review the release notes carefully before updating.
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {updateInfo.isCritical && (
                      <>
                        <Separator />
                        <div className="rounded-lg border border-red-500/50 bg-red-50 p-3 dark:bg-red-950/20">
                          <div className="flex items-start gap-2">
                            <Icons.AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                            <div>
                              <h5 className="font-medium text-red-800 dark:text-red-200">Critical Security Update</h5>
                              <p className="text-sm text-red-700 dark:text-red-300">
                                This is a critical security update. We strongly recommend updating as soon as possible.
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}

          <Button
            onClick={handleUpdate}
            disabled={isUpdating || disabled}
            size="sm"
          >
            {isUpdating ? (
              <>
                <Icons.Loader className="mr-1 h-3 w-3 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Icons.Download className="mr-1 h-3 w-3" />
                Update
              </>
            )}
          </Button>
        </div>
      </div>

      {updateInfo.minWealthfolioVersion && (
        <div className="mt-3 rounded-md bg-amber-100 p-2 dark:bg-amber-900/20">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <Icons.Info className="mr-1 inline h-3 w-3" />
            Requires Wealthfolio {updateInfo.minWealthfolioVersion} or later
          </p>
        </div>
      )}
    </div>
  );
}
