import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle } from 'lucide-react';
import { ImportFormat, ActivityType, ImportMapping } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ErrorsPreviewProps {
  errors: Record<string, string[]>;
  csvData: string[][];
  mapping: ImportMapping;
}

export function ErrorViewer({ errors, csvData, mapping }: ErrorsPreviewProps) {
  const [activeTab, setActiveTab] = useState<'errors' | 'raw'>('errors');
  const totalErrors = Object.values(errors).flat().length;

  const mappedHeaders = useMemo(() => {
    return csvData[0].filter((header) => Object.values(mapping.columns).includes(header));
  }, [csvData, mapping.columns]);

  const rowsWithErrors = useMemo(() => {
    return Object.keys(errors).map(Number);
  }, [errors]);

  const getMappedHeader = (header: string) => {
    const mappedFormat = Object.entries(mapping.columns).find(([_, value]) => value === header);
    return mappedFormat ? mappedFormat[0] : header;
  };

  const getMappedActivityType = (activityType: string) => {
    for (const [key, values] of Object.entries(mapping.activityTypes)) {
      if (values.includes(activityType)) {
        return key as ActivityType;
      }
    }
    return activityType;
  };

  return (
    <Card className="mx-auto w-full">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'errors' | 'raw')}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg font-bold">
            <div className="flex items-center gap-2">
              CSV Errors preview{' '}
              <Badge variant="destructive">
                {totalErrors} {totalErrors === 1 ? 'Error' : 'Errors'}
              </Badge>
            </div>
            <TabsList>
              <TabsTrigger value="errors">Errors</TabsTrigger>
              <TabsTrigger value="raw">Raw CSV</TabsTrigger>
            </TabsList>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TabsContent value="errors">
            <ScrollArea className="h-[400px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Row</TableHead>
                    {mappedHeaders.map((header, index) => (
                      <TableHead key={index}>{getMappedHeader(header)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvData
                    .slice(1)
                    .filter((_, index) => rowsWithErrors.includes(index + 2))
                    .map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        <TableCell className="font-medium">{rowsWithErrors[rowIndex]}</TableCell>
                        {mappedHeaders.map((header, cellIndex) => {
                          const originalIndex = csvData[0].indexOf(header);
                          const cell = row[originalIndex];
                          const mappedHeader = getMappedHeader(header);
                          const rowErrors = errors[`${rowsWithErrors[rowIndex]}`] || [];
                          const cellErrors = rowErrors.filter((error) =>
                            error.startsWith(mappedHeader),
                          );
                          return (
                            <TableCell
                              key={cellIndex}
                              className={cellErrors.length > 0 ? 'bg-destructive/10' : ''}
                            >
                              {cellErrors.length > 0 ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex cursor-help items-center space-x-1">
                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                        <span className="underline decoration-dotted underline-offset-2">
                                          {mappedHeader === ImportFormat.ActivityType
                                            ? getMappedActivityType(cell)
                                            : cell}
                                        </span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="border-destructive/50 bg-destructive text-destructive-foreground dark:border-destructive [&>svg]:text-destructive">
                                      {cellErrors.map((error, index) => (
                                        <p key={index}>{error.split(': ')[1]}</p>
                                      ))}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : mappedHeader === ImportFormat.ActivityType ? (
                                getMappedActivityType(cell)
                              ) : (
                                cell
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="raw">
            <ScrollArea className="h-[400px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Row</TableHead>
                    <TableHead>CSV Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvData
                    .filter((_, index) => rowsWithErrors.includes(index + 1))
                    .map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{rowsWithErrors[index]}</TableCell>
                        <TableCell>
                          <code className="whitespace-pre-wrap font-mono text-sm">
                            {row.join(',')}
                          </code>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
