import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";
import { useBackupRestore } from "./use-backup-restore";

export const BackupRestoreForm = () => {
  const { t } = useTranslation("settings");
  const { performBackup, performRestore, isBackingUp, isRestoring } = useBackupRestore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t("backup_title")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("backup_description")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icons.Database className="h-5 w-5" />
              {t("backup_create_title")}
            </CardTitle>
            <CardDescription>
              {t("backup_create_description")}
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
                  {t("backup_creating")}
                </>
              ) : (
                <>
                  <Icons.Download className="mr-2 h-4 w-4" />
                  {t("backup_create_button")}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icons.Activity className="h-5 w-5" />
              {t("backup_restore_title")}
            </CardTitle>
            <CardDescription>
              {t("backup_restore_description")}
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
                  {t("backup_restoring")}
                </>
              ) : (
                <>
                  <Icons.Import className="mr-2 h-4 w-4" />
                  {t("backup_restore_button")}
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
              <p className="font-medium text-orange-800 dark:text-orange-200">{t("backup_important_notes")}</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-orange-700 dark:text-orange-300">
                <li>{t("backup_note_1")}</li>
                <li>{t("backup_note_2")}</li>
                <li>{t("backup_note_3")}</li>
                <li>{t("backup_note_4")}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
