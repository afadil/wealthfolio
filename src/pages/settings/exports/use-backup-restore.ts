import { listenDatabaseRestoredTauri, logger } from "@/adapters";
import { openDatabaseFileDialog, openFolderDialog } from "@/commands/file";
import { backupDatabaseToPath, restoreDatabase } from "@/commands/settings";
import { toast } from "@/components/ui/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useBackupRestore() {
  const queryClient = useQueryClient();

  // Listen for database restore completion
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const setupListener = async () => {
      unlistenFn = await listenDatabaseRestoredTauri(() => {
        // Invalidate all queries to force a complete refresh
        queryClient.invalidateQueries();

        // Note: The restart dialog is now handled by the backend
        toast({
          title: "Database restored successfully",
          description: "Application data has been restored.",
          variant: "success",
        });
      });
    };

    void setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [queryClient]);

  const { mutateAsync: backupWithDirectorySelection, isPending: isBackingUp } = useMutation({
    mutationFn: async () => {
      // Open folder dialog to let user choose backup location
      const selectedDir = await openFolderDialog();

      if (!selectedDir) {
        // User cancelled the dialog, return null to indicate cancellation
        return null;
      }

      // Create backup in selected directory
      const backupPath = await backupDatabaseToPath(selectedDir);
      return backupPath;
    },
    onSuccess: (backupPath) => {
      if (backupPath === null) {
        // User cancelled the operation, don't show any message
        return;
      }

      toast({
        title: "Backup completed successfully",
        description: `Database backed up to: ${backupPath}`,
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error during backup: ${error}`);
      toast({
        title: "Backup failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const { mutateAsync: restoreFromBackup, isPending: isRestoring } = useMutation({
    mutationFn: async () => {
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

      toast({
        title: "Database restore initiated",
        description: `Restoring from: ${filePath}`,
        variant: "success",
      });
    },
    onError: (error) => {
      logger.error(`Error during restore: ${error}`);
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
      logger.error(`Backup error: ${error}`);
    }
  };

  const performRestore = async () => {
    try {
      await restoreFromBackup();
    } catch (error) {
      logger.error(`Restore error: ${error}`);
    }
  };

  return {
    performBackup,
    performRestore,
    isBackingUp,
    isRestoring,
  };
}
