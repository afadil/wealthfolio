import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ExportDataType, ExportedFileFormat } from "@/lib/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useExportData } from "./use-export-data";

export const ExportForm = () => {
  const { t } = useTranslation("settings");
  const [selectedFormat, setSelectedFormat] = useState<string | undefined>();

  const { exportData, isExporting, exportingFormat, exportingData } = useExportData();

  const dataFormats = [
    {
      name: "CSV",
      icon: Icons.FileCsv,
      description: t("export_format_csv_description"),
    },
    {
      name: "JSON",
      icon: Icons.FileJson,
      description: t("export_format_json_description"),
    },
    {
      name: "SQLite",
      icon: Icons.Database,
      description: t("export_format_sqlite_description"),
    },
  ];

  const dataTypes = {
    CSV: [
      {
        key: "accounts",
        name: t("export_type_accounts"),
        icon: Icons.Holdings,
        description: t("export_type_accounts_description"),
      },
      {
        key: "activities",
        name: t("export_type_activities"),
        icon: Icons.Activity,
        description: t("export_type_activities_description"),
      },
      {
        key: "goals",
        name: t("export_type_goals"),
        icon: Icons.Goals,
        description: t("export_type_goals_description"),
      },
      {
        key: "portfolio-history",
        name: t("export_type_portfolio_history"),
        icon: Icons.Files,
        description: t("export_type_portfolio_history_description"),
      },
    ],
    JSON: [
      {
        key: "accounts",
        name: t("export_type_accounts"),
        icon: Icons.Holdings,
        description: t("export_type_accounts_description"),
      },
      {
        key: "activities",
        name: t("export_type_activities"),
        icon: Icons.Activity,
        description: t("export_type_activities_description"),
      },
      {
        key: "goals",
        name: t("export_type_goals"),
        icon: Icons.Goals,
        description: t("export_type_goals_description"),
      },
      {
        key: "portfolio-history",
        name: t("export_type_portfolio_history"),
        icon: Icons.Files,
        description: t("export_type_portfolio_history_description"),
      },
    ],
    SQLite: [
      {
        key: "full",
        name: t("export_type_full_database"),
        icon: Icons.Database,
        description: t("export_type_full_database_description"),
      },
    ],
  };

  const handleExport = (item: (typeof dataTypes)[ExportedFileFormat][number]) => {
    if (!selectedFormat) return;

    exportData({
      data: item.key as ExportDataType,
      format: selectedFormat as ExportedFileFormat,
    });
  };

  return (
    <>
      <div className="mt-8 px-2">
        <h3 className="pt-5 pb-3 font-semibold">{t("export_format_title")}</h3>
        <RadioGroup
          onValueChange={setSelectedFormat}
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {dataFormats.map((format) => (
            <div key={format.name}>
              <RadioGroupItem value={format.name} id={format.name} className="peer sr-only" />
              <Label
                htmlFor={format.name}
                className="bg-card hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary relative flex cursor-pointer flex-col items-center justify-between rounded-md border p-4 shadow-sm peer-data-[state=checked]:border-2"
              >
                <format.icon className="mb-3 h-6 w-6" />
                <div className="text-center">
                  <h3 className="font-semibold">{format.name}</h3>
                  <p className="text-muted-foreground text-sm font-light">{format.description}</p>
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {selectedFormat && (
        <div className="px-2 pt-4">
          <h3 className="pt-5 pb-3 font-semibold">{t("export_customize_title")}</h3>
          {dataTypes[selectedFormat as keyof typeof dataTypes].map((item) => (
            <Card key={item.key} className="mb-4">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center">
                  <item.icon className="mr-2 h-5 w-5" />
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <p className="text-muted-foreground text-sm">{item.description}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleExport(item)}
                  disabled={isExporting}
                >
                  {isExporting &&
                  exportingFormat === selectedFormat &&
                  exportingData === item.key ? (
                    <>
                      <Icons.Spinner className="h-4 w-4 animate-spin" />
                      <span className="sr-only">{t("export_exporting", { name: item.name })}</span>
                    </>
                  ) : (
                    <>
                      <Icons.Download className="h-4 w-4" />
                      <span className="sr-only">{t("export_button_aria", { name: item.name })}</span>
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
};
