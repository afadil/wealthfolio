import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";
import { BackupRestoreForm } from "./backup-restore-form";
import { ExportForm } from "./exports-form";

const ExportSettingsPage = () => {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading={t("settings.exports.heading")}
        text={t("settings.exports.description")}
      />
      <Separator />

      <Tabs defaultValue="backup" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="backup">{t("settings.exports.tab_backup_restore")}</TabsTrigger>
          <TabsTrigger value="export">{t("settings.exports.tab_data_export")}</TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="mt-6">
          <BackupRestoreForm />
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t("settings.exports.tab_data_export")}</h3>
              <p className="text-muted-foreground text-sm">
                {t("settings.exports.export_intro")}
              </p>
            </div>
            <ExportForm />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ExportSettingsPage;
