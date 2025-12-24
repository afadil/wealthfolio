import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useBackupRestore } from "./use-backup-restore";

const desktopNotes = [
  "Backup includes WAL and SHM files for complete data integrity.",
  "Restore will replace ALL current data with backup data.",
  "A pre-restore backup is automatically created before restoration.",
  "You will be prompted to restart the application after restoration.",
] as const;

const webNotes = [
  "Backups include WAL and SHM files and are stored in the server data directory.",
  "Download or copy backup files directly from the host environment when needed.",
  "Restores are only available in the desktop application.",
  "Create backups regularly, especially before bulk imports or migrations.",
] as const;

export const BackupRestoreForm = () => {
  const { performBackup, performRestore, isBackingUp, isRestoring, isDesktop } = useBackupRestore();

  return isDesktop ? (
    <DesktopBackupPanel
      performBackup={performBackup}
      performRestore={performRestore}
      isBackingUp={isBackingUp}
      isRestoring={isRestoring}
    />
  ) : (
    <WebBackupPanel performBackup={performBackup} isBackingUp={isBackingUp} />
  );
};

interface DesktopPanelProps {
  performBackup: () => Promise<void>;
  performRestore: () => Promise<void>;
  isBackingUp: boolean;
  isRestoring: boolean;
}

const DesktopBackupPanel = ({
  performBackup,
  performRestore,
  isBackingUp,
  isRestoring,
}: DesktopPanelProps) => {
  return (
    <div className="space-y-6">
      <PanelIntro />

      <div className="grid gap-4 md:grid-cols-2">
        <BackupCard
          title="Create Backup"
          description="Create a complete backup of your database, including WAL and SHM files, and save it to any folder you choose."
          isLoading={isBackingUp}
          disabled={isBackingUp || isRestoring}
          actionLabel="Backup Database"
          onAction={performBackup}
        />

        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icons.DatabaseBackup className="h-5 w-5" />
              Restore Backup
            </CardTitle>
            <CardDescription>
              Restore your database from a previous backup file. This will replace all current data.
              Then restart the application to apply changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
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

      <ImportantNotes notes={desktopNotes} />
    </div>
  );
};

interface WebPanelProps {
  performBackup: () => Promise<void>;
  isBackingUp: boolean;
}

const WebBackupPanel = ({ performBackup, isBackingUp }: WebPanelProps) => {
  return (
    <div className="space-y-6">
      <PanelIntro />

      <BackupCard
        title="Create Backup"
        description="Create a complete backup with WAL and SHM files stored automatically in the server data directory for safekeeping."
        isLoading={isBackingUp}
        disabled={isBackingUp}
        actionLabel="Backup Database"
        onAction={performBackup}
      />

      <ImportantNotes notes={webNotes} />
    </div>
  );
};

const PanelIntro = () => (
  <div>
    <h3 className="text-lg font-semibold">Database Backup & Restore</h3>
    <p className="text-muted-foreground text-sm">
      Create complete database backups and restore from previous backups.
    </p>
  </div>
);

interface BackupCardProps {
  title: string;
  description: string;
  onAction: () => Promise<void>;
  isLoading: boolean;
  actionLabel: string;
  disabled?: boolean;
}

const BackupCard = ({
  title,
  description,
  onAction,
  isLoading,
  actionLabel,
  disabled,
}: BackupCardProps) => (
  <Card className="flex h-full flex-col">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Icons.DatabaseZap className="h-5 w-5" />
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="mt-auto">
      <Button onClick={onAction} disabled={disabled ?? isLoading} className="w-full">
        {isLoading ? (
          <>
            <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            Creating Backup...
          </>
        ) : (
          <>
            <Icons.Download className="mr-2 h-4 w-4" />
            {actionLabel}
          </>
        )}
      </Button>
    </CardContent>
  </Card>
);

const ImportantNotes = ({ notes }: { notes: readonly string[] }) => (
  <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
    <CardContent className="pt-6">
      <div className="flex items-start gap-3">
        <Icons.AlertTriangle className="mt-0.5 h-5 w-5 text-orange-600" />
        <div className="text-sm">
          <p className="font-medium text-orange-800 dark:text-orange-200">Important Notes:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-orange-700 dark:text-orange-300">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
    </CardContent>
  </Card>
);
