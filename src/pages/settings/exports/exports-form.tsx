import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Download, FileJson, FileSpreadsheet, Database } from 'lucide-react';
import { Icons } from '@/components/icons';
import { ExportDataType, ExportedFileFormat } from '@/lib/types';
import { useExportData } from '@/lib/export-utils';
import { toast } from '@/components/ui/use-toast';

const dataFormats = [
  {
    name: 'CSV',
    icon: FileSpreadsheet,
    description: 'Simple, widely compatible spreadsheet format',
  },
  {
    name: 'JSON',
    icon: FileJson,
    description: 'Structured data for easy programmatic access',
  },
  // {
  //   name: 'SQLite',
  //   icon: Database,
  //   description: 'Compact, self-contained database file',
  // },
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
      icon: Icons.Goal,
      description: 'Financial objectives and progress tracking',
    },
    {
      key: 'portfolio-history',
      name: 'Portfolio History',
      icon: Icons.ScrollText,
      description: 'Financial objectives and progress tracking',
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
      icon: Icons.Goal,
      description: 'Financial objectives and progress tracking',
    },
    {
      key: 'portfolio-history',
      name: 'Portfolio History',
      icon: Icons.ScrollText,
      description: 'Financial objectives and progress tracking',
    },
  ],
  SQLite: [
    {
      key: 'full',
      name: 'Full Database',
      icon: Database,
      description: 'Complete, queryable SQLite database of all your information',
    },
  ],
};

export const ExportForm = () => {
  const [selectedFormat, setSelectedFormat] = useState<string | undefined>();

  const { exportData } = useExportData();

  const handleOnSuccess = () => {
    toast({
      title: 'File saved successfully.',
      className: 'bg-green-500 text-white border-none',
    });
  };

  const handleOnError = () => {
    toast({
      title: 'Something went wrong.',
      className: 'bg-red-500 text-white border-none',
    });
  };

  const handleExport = (item: (typeof dataTypes)[ExportedFileFormat][number]) => {
    if (!selectedFormat) return;

    exportData({
      params: {
        data: item.key as ExportDataType,
        format: selectedFormat as ExportedFileFormat,
      },
      onSuccess: handleOnSuccess,
      onError: handleOnError,
    });
  };

  return (
    <>
      <div className="mt-8 px-2">
        <h3 className="pb-3 pt-5 text-lg font-semibold">Choose Your Preferred Format</h3>
        <RadioGroup
          onValueChange={setSelectedFormat}
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {dataFormats.map((format) => (
            <div key={format.name}>
              <RadioGroupItem value={format.name} id={format.name} className="peer sr-only" />
              <Label
                htmlFor={format.name}
                className="flex cursor-pointer flex-col items-center justify-between rounded-md border bg-card p-4 shadow-sm hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-2 peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
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
        <div className="pt-6">
          <h3 className="pb-3 pt-5 text-xl font-semibold">Customize Your Export</h3>
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
                <Button variant="outline" size="icon" onClick={() => handleExport(item)}>
                  <Download className="h-4 w-4" />
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
