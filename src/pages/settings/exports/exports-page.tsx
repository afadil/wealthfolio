import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsHeader } from "../settings-header";
import { BackupRestoreForm } from "./backup-restore-form";
import { ExportForm } from "./exports-form";

const ExportSettingsPage = () => {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="Data Export & Backup"
        text="Export your financial data and manage database backups with advanced options."
      />
      <Separator />

      <Tabs defaultValue="backup" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
          <TabsTrigger value="export">Data Export</TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="mt-6">
          <BackupRestoreForm />
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Data Export</h3>
              <p className="text-muted-foreground text-sm">
                Export specific data types in various formats for analysis or external use.
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
