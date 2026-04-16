import {
  backupDatabase,
  backupDatabaseToPath,
  isWeb,
  logger,
  openDatabaseFileDialog,
  openFileSaveDialog,
  openFolderDialog,
  restoreDatabase,
} from "@/adapters";
import i18n from "@/i18n/i18n";
import { getPlatform as getRuntimePlatform, usePlatform } from "@/hooks/use-platform";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

export function useBackupRestore() {
  const { platform } = usePlatform();
  const platformMode: "desktop" | "mobile" | "web" = isWeb
    ? "web"
    : platform?.is_mobile
      ? "mobile"
      : "desktop";

  const { mutateAsync: backupWithDirectorySelection, isPending: isBackingUp } = useMutation<{
    location: "local" | "server";
    value: string;
  } | null>({
    mutationFn: async () => {
      if (isWeb) {
        const { filename } = await backupDatabase();
        return { location: "server" as const, value: filename };
      }

      const runtimePlatform = await getRuntimePlatform();
      if (runtimePlatform.is_desktop) {
        // Open folder dialog to let user choose backup location
        const selectedDir = await openFolderDialog();

        if (!selectedDir) {
          // User cancelled the dialog, return null to indicate cancellation
          return null;
        }

        // Create backup in selected directory
        const backupPath = await backupDatabaseToPath(selectedDir);
        return { location: "local" as const, value: backupPath };
      }

      // Mobile: create backup and let user choose file destination.
      const { filename, data } = await backupDatabase();
      const saved = await openFileSaveDialog(data, filename);
      if (!saved) {
        return null;
      }
      return { location: "local" as const, value: filename };
    },
    onSuccess: (result) => {
      if (result === null) {
        // User cancelled the operation, don't show any message
        return;
      }

      const description =
        result.location === "server"
          ? i18n.t("settings.exports.toast.backup_path_server", { path: result.value })
          : i18n.t("settings.exports.toast.backup_path_local", { path: result.value });

      toast({
        title: i18n.t("settings.exports.toast.backup_panel_success_title"),
        description,
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error during backup: ${String(error)}`);
      toast({
        title: i18n.t("settings.exports.toast.backup_failed_title"),
        description:
          error instanceof Error ? error.message : i18n.t("settings.exports.toast.unknown_error"),
        variant: "destructive",
      });
    },
  });

  const { mutateAsync: restoreFromBackup, isPending: isRestoring } = useMutation({
    mutationFn: async () => {
      if (isWeb) {
        throw new Error("Restore is only supported in the desktop app");
      }

      const runtimePlatform = await getRuntimePlatform();
      if (!runtimePlatform.is_desktop && runtimePlatform.os !== "ios") {
        throw new Error("Restore is currently supported on desktop and iOS only");
      }

      // Open file dialog to let user choose backup file
      const selectedFile = await openDatabaseFileDialog();

      if (!selectedFile) {
        // User cancelled the dialog, return null to indicate cancellation
        return null;
      }

      // Restore database from selected file
      await restoreDatabase(selectedFile);
      return selectedFile;
    },
    onSuccess: (filePath) => {
      if (filePath === null) {
        // User cancelled the operation, don't show any message
        return;
      }
    },
    onError: (error) => {
      logger.error(`Error during restore: ${String(error)}`);
      toast({
        title: i18n.t("settings.exports.toast.restore_failed_title"),
        description:
          error instanceof Error ? error.message : i18n.t("settings.exports.toast.unknown_error"),
        variant: "destructive",
      });
    },
  });

  const performBackup = async () => {
    try {
      await backupWithDirectorySelection();
    } catch (error) {
      logger.error(`Backup error: ${String(error)}`);
    }
  };

  const performRestore = async () => {
    const runtimePlatform = await getRuntimePlatform();
    if (!runtimePlatform.is_desktop && runtimePlatform.os !== "ios") {
      toast({
        title: i18n.t("settings.exports.toast.restore_unavailable_title"),
        description: i18n.t("settings.exports.toast.restore_unavailable_description"),
      });
      return;
    }

    try {
      await restoreFromBackup();
    } catch (error) {
      logger.error(`Restore error: ${String(error)}`);
    }
  };

  return {
    performBackup,
    performRestore,
    isBackingUp,
    isRestoring,
    canRestore: platformMode === "desktop" || platform?.os === "ios",
    isDesktop: platformMode === "desktop",
    isMobile: platformMode === "mobile",
    isWeb,
    platformMode,
  };
}
