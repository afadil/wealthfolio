import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { useBackupRestore } from "./use-backup-restore";

export const BackupRestoreForm = () => {
  const { t } = useTranslation("common");
  const { performBackup, performRestore, isBackingUp, isRestoring, canRestore, platformMode } =
    useBackupRestore();

  const desktopNotes = [
    t("settings.exports.note_desktop_1"),
    t("settings.exports.note_desktop_2"),
    t("settings.exports.note_desktop_3"),
    t("settings.exports.note_desktop_4"),
  ] as const;

  const webNotes = [
    t("settings.exports.note_web_1"),
    t("settings.exports.note_web_2"),
    t("settings.exports.note_web_3"),
    t("settings.exports.note_web_4"),
  ] as const;

  const mobileNotes = [
    t("settings.exports.note_mobile_1"),
    t("settings.exports.note_mobile_2"),
    t("settings.exports.note_mobile_3"),
    t("settings.exports.note_mobile_4"),
  ] as const;

  return platformMode === "desktop" ? (
    <DesktopBackupPanel
      performBackup={performBackup}
      performRestore={performRestore}
      isBackingUp={isBackingUp}
      isRestoring={isRestoring}
      notes={desktopNotes}
      t={t}
    />
  ) : platformMode === "mobile" ? (
    <MobileBackupPanel
      performBackup={performBackup}
      performRestore={performRestore}
      isBackingUp={isBackingUp}
      isRestoring={isRestoring}
      canRestore={canRestore}
      notes={mobileNotes}
      t={t}
    />
  ) : (
    <WebBackupPanel performBackup={performBackup} isBackingUp={isBackingUp} notes={webNotes} t={t} />
  );
};

interface DesktopPanelProps {
  performBackup: () => Promise<void>;
  performRestore: () => Promise<void>;
  isBackingUp: boolean;
  isRestoring: boolean;
  notes: readonly string[];
  t: (key: string) => string;
}

const DesktopBackupPanel = ({
  performBackup,
  performRestore,
  isBackingUp,
  isRestoring,
  notes,
  t,
}: DesktopPanelProps) => {
  return (
    <div className="space-y-6">
      <PanelIntro t={t} />

      <div className="grid gap-4 md:grid-cols-2">
        <BackupCard
          title={t("settings.exports.create_backup")}
          description={t("settings.exports.create_backup_desc_desktop")}
          isLoading={isBackingUp}
          disabled={isBackingUp || isRestoring}
          actionLabel={t("settings.exports.backup_database")}
          onAction={performBackup}
          t={t}
        />

        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icons.DatabaseBackup className="h-5 w-5" />
              {t("settings.exports.restore_backup")}
            </CardTitle>
            <CardDescription>
              {t("settings.exports.restore_backup_desc_desktop")}
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
                  {t("settings.exports.restoring")}
                </>
              ) : (
                <>
                  <Icons.Import className="mr-2 h-4 w-4" />
                  {t("settings.exports.restore_database")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <ImportantNotes notes={notes} t={t} />
    </div>
  );
};

interface WebPanelProps {
  performBackup: () => Promise<void>;
  isBackingUp: boolean;
  notes: readonly string[];
  t: (key: string) => string;
}

const WebBackupPanel = ({ performBackup, isBackingUp, notes, t }: WebPanelProps) => {
  return (
    <div className="space-y-6">
      <PanelIntro t={t} />

      <BackupCard
        title={t("settings.exports.create_backup")}
        description={t("settings.exports.create_backup_desc_web")}
        isLoading={isBackingUp}
        disabled={isBackingUp}
        actionLabel={t("settings.exports.backup_database")}
        onAction={performBackup}
        t={t}
      />

      <ImportantNotes notes={notes} t={t} />
    </div>
  );
};

interface MobilePanelProps extends WebPanelProps {
  performRestore: () => Promise<void>;
  isRestoring: boolean;
  canRestore: boolean;
}

const MobileBackupPanel = ({
  performBackup,
  performRestore,
  isBackingUp,
  isRestoring,
  canRestore,
  notes,
  t,
}: MobilePanelProps) => {
  return (
    <div className="space-y-6">
      <PanelIntro t={t} />

      <div className="grid gap-4 md:grid-cols-2">
        <BackupCard
          title={t("settings.exports.create_backup")}
          description={t("settings.exports.create_backup_desc_mobile")}
          isLoading={isBackingUp}
          disabled={isBackingUp}
          actionLabel={t("settings.exports.backup_database")}
          onAction={performBackup}
          t={t}
        />

        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icons.DatabaseBackup className="h-5 w-5" />
              {t("settings.exports.restore_backup")}
            </CardTitle>
            <CardDescription>
              {canRestore
                ? t("settings.exports.restore_backup_desc_mobile")
                : t("settings.exports.restore_unavailable_mobile")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              onClick={performRestore}
              disabled={!canRestore || isRestoring || isBackingUp}
              variant="outline"
              className="w-full"
            >
              {isRestoring ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  {t("settings.exports.restoring")}
                </>
              ) : (
                <>
                  <Icons.Import className="mr-2 h-4 w-4" />
                  {t("settings.exports.restore_database")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <ImportantNotes notes={notes} t={t} />
    </div>
  );
};

const PanelIntro = ({ t }: { t: (key: string) => string }) => (
  <div>
    <h3 className="text-lg font-semibold">{t("settings.exports.panel_title")}</h3>
    <p className="text-muted-foreground text-sm">{t("settings.exports.panel_description")}</p>
  </div>
);

interface BackupCardProps {
  title: string;
  description: string;
  onAction: () => Promise<void>;
  isLoading: boolean;
  actionLabel: string;
  disabled?: boolean;
  t: (key: string) => string;
}

const BackupCard = ({
  title,
  description,
  onAction,
  isLoading,
  actionLabel,
  disabled,
  t,
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
            {t("settings.exports.creating_backup")}
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

const ImportantNotes = ({ notes, t }: { notes: readonly string[]; t: (key: string) => string }) => (
  <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
    <CardContent className="pt-6">
      <div className="flex items-start gap-3">
        <Icons.AlertTriangle className="mt-0.5 h-5 w-5 text-orange-600" />
        <div className="text-sm">
          <p className="font-medium text-orange-800 dark:text-orange-200">
            {t("settings.exports.important_notes")}
          </p>
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
