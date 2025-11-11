import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";
import { BackupRestoreForm } from "./backup-restore-form";
import { ExportForm } from "./exports-form";

const ExportSettingsPage = () => {
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-6">
      <SettingsHeader heading={t("exports.page.title")} text={t("exports.page.description")} />
      <Separator />

      <Tabs defaultValue="backup" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="backup">{t("exports.page.tabs.backup")}</TabsTrigger>
          <TabsTrigger value="export">{t("exports.page.tabs.export")}</TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="mt-6">
          <BackupRestoreForm />
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t("exports.page.dataExportTitle")}</h3>
              <p className="text-muted-foreground text-sm">
                {t("exports.page.dataExportDescription")}
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
