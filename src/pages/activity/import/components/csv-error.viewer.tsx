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
import { ImportFormat } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ErrorsPreviewProps {
  errors: Record<string, string[]>;
  csvData: string[][];
  mapping: {
    columns: Partial<Record<ImportFormat, string>>;
    activityTypes: Partial<Record<string, string>>;
  };
}

export default function ErrorViewer({ errors, csvData, mapping }: ErrorsPreviewProps) {
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

  return (
    <Card className="mx-auto w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">CSV Preview</CardTitle>
        <div className="flex items-center space-x-2">
          <Badge variant="destructive">
            {totalErrors} {totalErrors === 1 ? 'Error' : 'Errors'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'errors' | 'raw')}>
          <TabsList>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="raw">Raw CSV</TabsTrigger>
          </TabsList>
          <TabsContent value="errors">
            <ScrollArea className="h-[600px] w-full">
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
                              className={cellErrors.length > 0 ? 'bg-red-50' : ''}
                            >
                              {cellErrors.length > 0 ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex cursor-help items-center space-x-1">
                                        <AlertCircle className="h-4 w-4 text-red-500" />
                                        <span className="underline decoration-dotted underline-offset-2">
                                          {cell}
                                        </span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {cellErrors.map((error, index) => (
                                        <p key={index}>{error.split(': ')[1]}</p>
                                      ))}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
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
            <ScrollArea className="h-[600px] w-full">
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
        </Tabs>
      </CardContent>
    </Card>
  );
}
