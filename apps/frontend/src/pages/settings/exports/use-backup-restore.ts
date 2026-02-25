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
          ? `Backup created on the server as ${result.value}`
          : `Backup saved as ${result.value}`;

      toast({
        title: "Backup completed successfully",
        description,
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error during backup: ${String(error)}`);
      toast({
        title: "Backup failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
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
        title: "Restore failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
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
        title: "Restore unavailable",
        description: "Please use the desktop app or iOS app to restore backups.",
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
