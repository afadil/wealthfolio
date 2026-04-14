import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@wealthfolio/ui/components/ui/radio-group";
import { ExportDataType, ExportedFileFormat } from "@/lib/types";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useExportData } from "./use-export-data";

function exportItemTitle(key: string, t: TFunction) {
  switch (key) {
    case "portfolio-history":
      return t("settings.exports.type_portfolio_history");
    case "full":
      return t("settings.exports.type_full_sqlite");
    case "accounts":
      return t("settings.exports.type_accounts");
    case "activities":
      return t("settings.exports.type_activities");
    case "goals":
      return t("settings.exports.type_goals");
    default:
      return key;
  }
}

function exportItemDescription(key: string, t: TFunction) {
  switch (key) {
    case "portfolio-history":
      return t("settings.exports.type_portfolio_history_desc");
    case "full":
      return t("settings.exports.type_full_sqlite_desc");
    case "accounts":
      return t("settings.exports.type_accounts_desc");
    case "activities":
      return t("settings.exports.type_activities_desc");
    case "goals":
      return t("settings.exports.type_goals_desc");
    default:
      return "";
  }
}

const dataFormats = [
  {
    name: "CSV",
    icon: Icons.FileCsv,
    description: "Simple, widely compatible spreadsheet format",
  },
  {
    name: "JSON",
    icon: Icons.FileJson,
    description: "Structured data for easy programmatic access",
  },
  {
    name: "SQLite",
    icon: Icons.Database,
    description: "Compact, self-contained database file",
  },
];

const dataTypes = {
  CSV: [
    {
      key: "accounts",
      name: "Accounts",
      icon: Icons.Holdings,
      description: "Your financial accounts",
    },
    {
      key: "activities",
      name: "Activities",
      icon: Icons.Activity,
      description: "Detailed transaction history and logs",
    },
    {
      key: "goals",
      name: "Goals",
      icon: Icons.Goals,
      description: "Financial objectives and progress tracking",
    },
    {
      key: "portfolio-history",
      name: "Portfolio History",
      icon: Icons.Files,
      description:
        "Your portfolio's performance over time, including valuations, gains, and cash flow activities.",
    },
  ],
  JSON: [
    {
      key: "accounts",
      name: "Accounts",
      icon: Icons.Holdings,
      description: "Your financial accounts",
    },
    {
      key: "activities",
      name: "Activities",
      icon: Icons.Activity,
      description: "Detailed transaction history and logs",
    },
    {
      key: "goals",
      name: "Goals",
      icon: Icons.Goals,
      description: "Financial objectives and progress tracking",
    },
    {
      key: "portfolio-history",
      name: "Portfolio History",
      icon: Icons.Files,
      description:
        "Your portfolio's performance over time, including valuations, gains, and cash flow activities.",
    },
  ],
  SQLite: [
    {
      key: "full",
      name: "Export the full SQLite Database",
      icon: Icons.Database,
      description: "Complete database backup with WAL/SHM files - choose your backup location",
    },
  ],
};

export const ExportForm = () => {
  const { t } = useTranslation("common");
  const [selectedFormat, setSelectedFormat] = useState<string | undefined>();

  const { exportData, isExporting, exportingFormat, exportingData } = useExportData();

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
        <h3 className="pb-3 pt-5 font-semibold">{t("settings.exports.choose_format")}</h3>
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
                  <p className="text-muted-foreground text-sm font-light">
                    {format.name === "CSV"
                      ? t("settings.exports.format_csv_desc")
                      : format.name === "JSON"
                        ? t("settings.exports.format_json_desc")
                        : t("settings.exports.format_sqlite_desc")}
                  </p>
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {selectedFormat && (
        <div className="px-2 pt-4">
          <h3 className="pb-3 pt-5 font-semibold">{t("settings.exports.customize_export")}</h3>
          {dataTypes[selectedFormat as keyof typeof dataTypes].map((item) => (
            <Card key={item.key} className="mb-4">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center">
                  <item.icon className="mr-2 h-5 w-5" />
                  <div>
                    <span className="font-medium">{exportItemTitle(item.key, t)}</span>
                    <p className="text-muted-foreground text-sm">
                      {exportItemDescription(item.key, t)}
                    </p>
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
                        {t("settings.exports.exporting_item", {
                          item: exportItemTitle(item.key, t),
                        })}
                      </span>
                    </>
                  ) : (
                    <>
                      <Icons.Download className="h-4 w-4" />
                      <span className="sr-only">
                        {t("settings.exports.export_item", {
                          item: exportItemTitle(item.key, t),
                        })}
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
