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
import { ImportFormat, ActivityType, ImportMappingData } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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

  const isSymbolError = (error: string) => {
    return error.toLowerCase().includes('symbol') || error.toLowerCase().includes('ticker');
  };

  const formatErrorMessage = (error: string) => {
    const parts = error.split(': ');
    const message = parts.length > 1 ? parts[1] : error;
    
    if (isSymbolError(error)) {
      return (
        <span className="flex items-center gap-1">
          <Icons.AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          <span>{message || 'Invalid or missing symbol'}</span>
        </span>
      );
    }
    
    return (
      <span className="flex items-center gap-1">
        <Icons.AlertCircle className="h-3.5 w-3.5 text-destructive" />
        <span>{message}</span>
      </span>
    );
  };

  return (
    <Card className="mx-auto w-full">
      <Tabs defaultValue={parsingError ? 'raw' : 'errors'}>
        <CardHeader className="pb-2">
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
                    <TableHead className="w-[80px]">Row</TableHead>
                    {mappedHeaders?.map((header, index) => (
                      <TableHead key={index}>{getMappedHeader(header)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvData
                    .slice(1)
                    .filter((_, index) => rowsWithErrors.includes(index + 2))
                    .map((row, rowIndex) => {
                      const rowNumber = rowsWithErrors[rowIndex];
                      const rowErrors = validationErrors[`${rowNumber}`] || [];
                      const hasSymbolError = rowErrors.some(isSymbolError);
                      
                      return (
                        <Popover key={`row-${rowIndex}`}>
                          <PopoverTrigger asChild>
                            <TableRow 
                              className={cn(
                                hasSymbolError ? "bg-destructive/5" : "",
                                "relative hover:bg-muted/50 cursor-pointer"
                              )}
                            >
                              <TableCell className="py-2 font-medium">
                                <div className="flex items-center gap-1">
                                  {rowNumber}
                                  {hasSymbolError && (
                                    <Icons.AlertTriangle className="h-4 w-4 text-destructive" />
                                  )}
                                </div>
                              </TableCell>
                              {mappedHeaders?.map((header, cellIndex) => {
                                const originalIndex = csvData[0].indexOf(header);
                                const cell = row[originalIndex];
                                const mappedHeader = getMappedHeader(header);
                                const cellErrors = rowErrors.filter((error) =>
                                  error.startsWith(mappedHeader),
                                );
                                const isSymbolCell = mappedHeader === ImportFormat.SYMBOL;
                                const hasError = cellErrors.length > 0;
                                
                                return (
                                  <TableCell
                                    key={cellIndex}
                                    className={cn(
                                      hasError ? 'bg-destructive/10' : '',
                                      isSymbolCell && hasSymbolError ? 'bg-destructive/20 font-medium' : '',
                                      'py-2 relative'
                                    )}
                                  >
                                    {hasError ? (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span className="flex cursor-help items-center gap-1">
                                              {isSymbolCell && hasSymbolError ? (
                                                <Icons.AlertTriangle className="h-4 w-4 text-destructive" />
                                              ) : (
                                                <Icons.AlertCircle className="h-4 w-4 text-destructive" />
                                              )}
                                              <span className={cn(
                                                "underline decoration-dotted underline-offset-2",
                                                isSymbolCell && hasSymbolError ? "text-destructive font-medium" : ""
                                              )}>
                                                {mappedHeader === ImportFormat.ACTIVITY_TYPE
                                                  ? getMappedActivityType(cell)
                                                  : mappedHeader === ImportFormat.SYMBOL
                                                    ? getMappedSymbol(cell) || <em className="opacity-70">Missing</em>
                                                    : cell}
                                              </span>
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent 
                                            className={cn(
                                              "border-destructive/50 bg-destructive text-destructive-foreground dark:border-destructive [&>svg]:text-destructive",
                                              isSymbolCell && hasSymbolError ? "max-w-xs" : ""
                                            )}
                                          >
                                            {isSymbolCell && hasSymbolError ? (
                                              <div className="space-y-2">
                                                <p className="font-bold">Symbol Error</p>
                                                <ul className="list-disc pl-4 space-y-1">
                                                  {cellErrors.map((error, index) => (
                                                    <li key={index}>{error.split(': ')[1]}</li>
                                                  ))}
                                                </ul>
                                                <p className="text-xs mt-2 border-t border-destructive-foreground/20 pt-2">
                                                  Tip: Ensure the symbol follows the correct format or add a symbol mapping.
                                                </p>
                                              </div>
                                            ) : (
                                              cellErrors.map((error, index) => (
                                                <p key={index}>{error.split(': ')[1]}</p>
                                              ))
                                            )}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    ) : mappedHeader === ImportFormat.ACTIVITY_TYPE ? (
                                      getMappedActivityType(cell)
                                    ) : mappedHeader === ImportFormat.SYMBOL ? (
                                      getMappedSymbol(cell)
                                    ) : (
                                      cell
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          </PopoverTrigger>
                          <PopoverContent 
                            className="w-[450px] p-0 shadow-lg" 
                            align="start"
                            sideOffset={5}
                          >
                            <div className="p-3 text-sm space-y-2">
                              <h4 className="font-medium text-xs uppercase text-muted-foreground mb-2">Error Details</h4>
                              <div className="space-y-2">
                                {rowErrors.map((error, index) => (
                                  <div 
                                    key={index} 
                                    className={cn(
                                      "py-1.5 px-3 rounded-sm",
                                      isSymbolError(error) 
                                        ? "bg-destructive/10 border-l-2 border-destructive" 
                                        : "bg-muted/50 border-l-2 border-muted-foreground/30"
                                    )}
                                  >
                                    {formatErrorMessage(error)}
                                  </div>
                                ))}
                              </div>
                              {hasSymbolError && (
                                <div className="mt-3 text-xs text-muted-foreground bg-background/50 p-2 rounded border border-border">
                                  <p className="font-medium mb-1">How to fix symbol errors:</p>
                                  <ol className="list-decimal pl-5 space-y-1">
                                    <li>Ensure the symbol follows the correct format (e.g., AAPL, MSFT)</li>
                                    <li>Add a symbol mapping if your broker uses different symbols</li>
                                  </ol>
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      );
                    })}
                </TableBody>
              </Table>
              {Object.keys(validationErrors).length === 0 && !parsingError && (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <Icons.HelpCircle className="h-10 w-10 mb-2" />
                  <p>No errors found in the CSV data.</p>
                </div>
              )}
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
                            <Icons.ArrowRight className="h-4 w-4 text-destructive" />
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
