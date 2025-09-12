import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { useBackupRestore } from "./use-backup-restore";

export const BackupRestoreForm = () => {
  const { performBackup, performRestore, isBackingUp, isRestoring } = useBackupRestore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Database Backup & Restore</h3>
        <p className="text-muted-foreground text-sm">
          Create complete database backups and restore from previous backups.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icons.Database className="h-5 w-5" />
              Create Backup
            </CardTitle>
            <CardDescription>
              Create a complete backup of your database including WAL and SHM files. Choose your
              backup location.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={performBackup}
              disabled={isBackingUp || isRestoring}
              className="w-full"
            >
              {isBackingUp ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Creating Backup...
                </>
              ) : (
                <>
                  <Icons.Download className="mr-2 h-4 w-4" />
                  Backup Database
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icons.Activity className="h-5 w-5" />
              Restore Backup
            </CardTitle>
            <CardDescription>
              Restore your database from a previous backup file. This will replace all current data.
              Then restart the application to apply changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={performRestore}
              disabled={isRestoring || isBackingUp}
              variant="outline"
              className="w-full"
            >
              {isRestoring ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <Icons.Import className="mr-2 h-4 w-4" />
                  Restore Database
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Icons.AlertTriangle className="mt-0.5 h-5 w-5 text-orange-600" />
            <div className="text-sm">
              <p className="font-medium text-orange-800 dark:text-orange-200">Important Notes:</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-orange-700 dark:text-orange-300">
                <li>Backup includes WAL and SHM files for complete data integrity</li>
                <li>Restore will replace ALL current data with backup data</li>
                <li>A pre-restore backup is automatically created before restoration</li>
                <li>You will be prompted to restart the application after restoration</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
