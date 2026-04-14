import { reloadAllAddons } from "@/addons/addons-core";
import { updateAddon } from "@/adapters";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wealthfolio/ui/components/ui/dialog";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { useToast } from "@wealthfolio/ui/components/ui/use-toast";
import type { AddonUpdateInfo } from "@wealthfolio/addon-sdk";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("common");
  const [isUpdating, setIsUpdating] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const { toast } = useToast();

  const handleUpdate = async () => {
    if (!updateInfo.downloadUrl) {
      toast({
        title: t("settings.addons.update.unavailable_title"),
        description: t("settings.addons.update.unavailable_description"),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsUpdating(true);

      await updateAddon(addonId);

      // Reload addons to apply the update
      await reloadAllAddons();

      toast({
        title: t("settings.addons.update.success_title"),
        description: t("settings.addons.update.success_description", {
          name: addonName,
          version: updateInfo.latestVersion,
        }),
      });

      onUpdateComplete?.();
    } catch (error) {
      console.error("Error updating addon:", error);
      toast({
        title: t("settings.addons.update.failed_title"),
        description:
          error instanceof Error ? error.message : t("settings.addons.update.failed_description"),
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getUpdateBadgeVariant = () => {
    if (updateInfo.isCritical) return "destructive";
    if (updateInfo.hasBreakingChanges) return "secondary";
    return "default";
  };

  const getUpdateBadgeText = () => {
    if (updateInfo.isCritical) return t("settings.addons.update.badge_critical");
    if (updateInfo.hasBreakingChanges) return t("settings.addons.update.badge_breaking");
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
            <h4 className="font-medium text-amber-900 dark:text-amber-100">
              {t("settings.addons.update.available")}
            </h4>
            {getUpdateBadgeText() && (
              <Badge variant={getUpdateBadgeVariant()} className="text-xs">
                {getUpdateBadgeText()}
              </Badge>
            )}
          </div>

          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p>
              {updateInfo.currentVersion} →{" "}
              <span className="font-medium">{updateInfo.latestVersion}</span>
            </p>
            {updateInfo.releaseDate && (
              <p className="text-xs opacity-80">
                {t("settings.addons.update.released")}:{" "}
                {new Date(updateInfo.releaseDate).toLocaleDateString()}
              </p>
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
                  {t("settings.addons.update.release_notes")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {t("settings.addons.update.release_notes_title", {
                      name: addonName,
                      version: updateInfo.latestVersion,
                    })}
                  </DialogTitle>
                  <DialogDescription>{t("settings.addons.update.whats_new")}</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-96">
                  <div className="space-y-4">
                    {updateInfo.releaseNotes && (
                      <div className="space-y-2">
                        <h4 className="font-medium">{t("settings.addons.update.release_notes")}</h4>
                        <div className="text-muted-foreground whitespace-pre-wrap text-sm">
                          {updateInfo.releaseNotes}
                        </div>
                      </div>
                    )}

                    {updateInfo.changelogUrl && (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <h4 className="font-medium">{t("settings.addons.update.full_changelog")}</h4>
                          <a
                            href={updateInfo.changelogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {t("settings.addons.update.view_changelog")}
                            <Icons.Globe className="ml-1 h-3 w-3" />
                          </a>
                        </div>
                      </>
                    )}

                    {updateInfo.hasBreakingChanges && (
                      <>
                        <Separator />
                        <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-3">
                          <div className="flex items-start gap-2">
                            <Icons.AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                              <h5 className="text-destructive font-medium">
                                {t("settings.addons.update.badge_breaking")}
                              </h5>
                              <p className="text-destructive/80 text-sm">
                                {t("settings.addons.update.breaking_description")}
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
                              <h5 className="font-medium text-red-800 dark:text-red-200">
                                {t("settings.addons.update.critical_security")}
                              </h5>
                              <p className="text-sm text-red-700 dark:text-red-300">
                                {t("settings.addons.update.critical_description")}
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

          <Button onClick={handleUpdate} disabled={isUpdating || disabled} size="sm">
            {isUpdating ? (
              <>
                <Icons.Loader className="mr-1 h-3 w-3 animate-spin" />
                {t("settings.addons.update.updating")}
              </>
            ) : (
              <>
                <Icons.Download className="mr-1 h-3 w-3" />
                {t("settings.addons.update.update")}
              </>
            )}
          </Button>
        </div>
      </div>

      {updateInfo.minWealthfolioVersion && (
        <div className="mt-3 rounded-md bg-amber-100 p-2 dark:bg-amber-900/20">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <Icons.Info className="mr-1 inline h-3 w-3" />
            {t("settings.addons.update.requires_version", {
              version: updateInfo.minWealthfolioVersion,
            })}
          </p>
        </div>
      )}
    </div>
  );
}
