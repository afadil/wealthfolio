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
      description: t("exports.dataExport.formats.csv.description"),
    },
    {
      name: "JSON",
      icon: Icons.FileJson,
      description: t("exports.dataExport.formats.json.description"),
    },
    {
      name: "SQLite",
      icon: Icons.Database,
      description: t("exports.dataExport.formats.sqlite.description"),
    },
  ];

  const dataTypes = {
    CSV: [
      {
        key: "accounts",
        name: t("exports.dataExport.dataTypes.accounts.name"),
        icon: Icons.Holdings,
        description: t("exports.dataExport.dataTypes.accounts.description"),
      },
      {
        key: "activities",
        name: t("exports.dataExport.dataTypes.activities.name"),
        icon: Icons.Activity,
        description: t("exports.dataExport.dataTypes.activities.description"),
      },
      {
        key: "goals",
        name: t("exports.dataExport.dataTypes.goals.name"),
        icon: Icons.Goals,
        description: t("exports.dataExport.dataTypes.goals.description"),
      },
      {
        key: "portfolio-history",
        name: t("exports.dataExport.dataTypes.portfolioHistory.name"),
        icon: Icons.Files,
        description: t("exports.dataExport.dataTypes.portfolioHistory.description"),
      },
    ],
    JSON: [
      {
        key: "accounts",
        name: t("exports.dataExport.dataTypes.accounts.name"),
        icon: Icons.Holdings,
        description: t("exports.dataExport.dataTypes.accounts.description"),
      },
      {
        key: "activities",
        name: t("exports.dataExport.dataTypes.activities.name"),
        icon: Icons.Activity,
        description: t("exports.dataExport.dataTypes.activities.description"),
      },
      {
        key: "goals",
        name: t("exports.dataExport.dataTypes.goals.name"),
        icon: Icons.Goals,
        description: t("exports.dataExport.dataTypes.goals.description"),
      },
      {
        key: "portfolio-history",
        name: t("exports.dataExport.dataTypes.portfolioHistory.name"),
        icon: Icons.Files,
        description: t("exports.dataExport.dataTypes.portfolioHistory.description"),
      },
    ],
    SQLite: [
      {
        key: "full",
        name: t("exports.dataExport.dataTypes.full.name"),
        icon: Icons.Database,
        description: t("exports.dataExport.dataTypes.full.description"),
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
        <h3 className="pt-5 pb-3 font-semibold">{t("exports.dataExport.formatTitle")}</h3>
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
          <h3 className="pt-5 pb-3 font-semibold">{t("exports.dataExport.customizeTitle")}</h3>
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
                      <span className="sr-only">
                        {t("exports.dataExport.exportingButton", { name: item.name })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Icons.Download className="h-4 w-4" />
                      <span className="sr-only">
                        {t("exports.dataExport.exportButton", { name: item.name })}
                      </span>
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
