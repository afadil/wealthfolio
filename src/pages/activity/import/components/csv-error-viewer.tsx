import { useMemo } from 'react';
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
import { ImportFormat, ActivityType, ImportMappingData } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';

interface ErrorsPreviewProps {
  parsingError: boolean;
  validationErrors: Record<string, string[]>;
  csvData: string[][];
  mapping: ImportMappingData;
}

export function ErrorViewer({
  parsingError,
  validationErrors,
  csvData,
  mapping,
}: ErrorsPreviewProps) {
  const totalErrors = Object.values(validationErrors).flat().length;

  const mappedHeaders = useMemo(() => {
    return csvData[0]?.filter((header) => Object.values(mapping.fieldMappings).includes(header));
  }, [csvData, mapping.fieldMappings]);

  const rowsWithErrors = useMemo(() => {
    const errorKeys = Object.keys(validationErrors);
    return errorKeys.map(Number);
  }, [validationErrors]);

  const getMappedHeader = (header: string) => {
    const mappedFormat = Object.entries(mapping.fieldMappings).find(
      ([_, value]) => value === header,
    );
    return mappedFormat ? mappedFormat[0] : header;
  };

  const getMappedActivityType = (activityType: string) => {
    for (const [key, values] of Object.entries(mapping.activityMappings)) {
      if (values.includes(activityType)) {
        return key as ActivityType;
      }
    }
    return activityType;
  };

  const getMappedSymbol = (symbol: string) => {
    return mapping.symbolMappings[symbol] || symbol;
  };

  return (
    <Card className="mx-auto w-full">
      <Tabs defaultValue={parsingError ? 'raw' : 'errors'}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg font-bold">
            <div className="flex items-center gap-2">
              Errors preview{' '}
              {totalErrors > 0 && (
                <Badge variant="destructive" className="rounded-md">
                  {totalErrors} {totalErrors === 1 ? 'Error' : 'Errors'}
                </Badge>
              )}
            </div>
            <TabsList>
              <TabsTrigger value="errors">Errors</TabsTrigger>
              <TabsTrigger value="raw">Raw CSV</TabsTrigger>
            </TabsList>
          </CardTitle>
          {parsingError && (
            <div className="text-sm font-light text-destructive">
              Unable to parse the CSV file. Please verify the format and try again.
            </div>
          )}
        </CardHeader>
        <CardContent>
          <TabsContent value="errors">
            <ScrollArea className="h-[500px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Row</TableHead>
                    {mappedHeaders?.map((header, index) => (
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
                        {mappedHeaders?.map((header, cellIndex) => {
                          const originalIndex = csvData[0].indexOf(header);
                          const cell = row[originalIndex];
                          const mappedHeader = getMappedHeader(header);
                          const rowErrors = validationErrors[`${rowsWithErrors[rowIndex]}`] || [];
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
                                            : mappedHeader === ImportFormat.Symbol
                                              ? getMappedSymbol(cell)
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
                              ) : mappedHeader === ImportFormat.Symbol ? (
                                getMappedSymbol(cell)
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
            <ScrollArea className="h-[500px] w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Row</TableHead>
                    <TableHead>CSV Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(parsingError ? csvData.slice(0, 10) : csvData).map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="flex items-center font-medium">
                        {index === 0 && parsingError ? (
                          <>
                            <Icons.ArrowRight className="h-4 w-4 text-red-500" />
                            <span className="ml-2">{index + 1}</span>
                          </>
                        ) : (
                          <span className="ml-6">{index + 1}</span>
                        )}
                      </TableCell>
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
