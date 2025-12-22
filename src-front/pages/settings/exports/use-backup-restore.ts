import { getRunEnv, logger, RUN_ENV } from "@/adapters";
import { openDatabaseFileDialog, openFolderDialog } from "@/commands/file";
import { backupDatabase, backupDatabaseToPath, restoreDatabase } from "@/commands/settings";
import { toast } from "@/components/ui/use-toast";
import { useMutation } from "@tanstack/react-query";

export function useBackupRestore() {
  const runEnv = getRunEnv();
  const isDesktop = runEnv === RUN_ENV.DESKTOP;

  const { mutateAsync: backupWithDirectorySelection, isPending: isBackingUp } = useMutation<{
    location: "local" | "server";
    value: string;
  } | null>({
    mutationFn: async () => {
      if (isDesktop) {
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

      const { filename } = await backupDatabase();
      return { location: "server" as const, value: filename };
    },
    onSuccess: (result) => {
      if (result === null) {
        // User cancelled the operation, don't show any message
        return;
      }

      const description =
        result.location === "server"
          ? `Backup created on the server as ${result.value}`
          : `Database backed up to: ${result.value}`;

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
      if (!isDesktop) {
        throw new Error("Restore is only supported in the desktop app");
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
    if (!isDesktop) {
      toast({
        title: "Restore unavailable in web mode",
        description: "Please use the desktop application to restore backups.",
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
    isDesktop,
  };
}
