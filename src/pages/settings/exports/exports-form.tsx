import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import { ExportDataType, ExportedFileFormat } from '@/lib/types';
import { useExportData } from './use-export-data';

const dataFormats = [
  {
    name: 'CSV',
    icon: Icons.FileCsv,
    description: 'Simple, widely compatible spreadsheet format',
  },
  {
    name: 'JSON',
    icon: Icons.FileJson,
    description: 'Structured data for easy programmatic access',
  },
  {
    name: 'SQLite',
    icon: Icons.Database,
    description: 'Compact, self-contained database file',
  },
];

const dataTypes = {
  CSV: [
    {
      key: 'accounts',
      name: 'Accounts',
      icon: Icons.Holdings,
      description: 'Your financial accounts',
    },
    {
      key: 'activities',
      name: 'Activities',
      icon: Icons.Activity,
      description: 'Detailed transaction history and logs',
    },
    {
      key: 'goals',
      name: 'Goals',
      icon: Icons.Goals,
      description: 'Financial objectives and progress tracking',
    },
    {
      key: 'portfolio-history',
      name: 'Portfolio History',
      icon: Icons.Files,
      description:
        "Your portfolio's performance over time, including valuations, gains, and cash flow activities.",
    },
  ],
  JSON: [
    {
      key: 'accounts',
      name: 'Accounts',
      icon: Icons.Holdings,
      description: 'Your financial accounts',
    },
    {
      key: 'activities',
      name: 'Activities',
      icon: Icons.Activity,
      description: 'Detailed transaction history and logs',
    },
    {
      key: 'goals',
      name: 'Goals',
      icon: Icons.Goals,
      description: 'Financial objectives and progress tracking',
    },
    {
      key: 'portfolio-history',
      name: 'Portfolio History',
      icon: Icons.Files,
      description:
        "Your portfolio's performance over time, including valuations, gains, and cash flow activities.",
    },
  ],
  SQLite: [
    {
      key: 'full',
      name: 'Full Database Backup',
      icon: Icons.Database,
      description: 'Complete, queryable SQLite database backup of all your information',
    },
  ],
};

export const ExportForm = () => {
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
        <h3 className="pb-3 pt-5 font-semibold">Choose Your Preferred Format</h3>
        <RadioGroup
          onValueChange={setSelectedFormat}
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {dataFormats.map((format) => (
            <div key={format.name}>
              <RadioGroupItem value={format.name} id={format.name} className="peer sr-only" />
              <Label
                htmlFor={format.name}
                className="relative flex cursor-pointer flex-col items-center justify-between rounded-md border bg-card p-4 shadow-sm hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-2 peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
              >
                <format.icon className="mb-3 h-6 w-6" />
                <div className="text-center">
                  <h3 className="font-semibold">{format.name}</h3>
                  <p className="text-sm font-light text-muted-foreground">{format.description}</p>
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {selectedFormat && (
        <div className="px-2 pt-4">
          <h3 className="pb-3 pt-5 font-semibold">Customize Your Export</h3>
          {dataTypes[selectedFormat as keyof typeof dataTypes].map((item) => (
            <Card key={item.key} className="mb-4">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center">
                  <item.icon className="mr-2 h-5 w-5" />
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
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
                    <Icons.Spinner className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icons.Download className="h-4 w-4" />
                  )}
                  <span className="sr-only">Export {item.name}</span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
};
