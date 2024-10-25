import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ImportFormat, ActivityType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';
import { useSymbolValidation } from '../hooks/useSymbolValidation';
import TickerSearchInput from '@/components/ticker-search';

const REQUIRED_FIELDS = [
  ImportFormat.Date,
  ImportFormat.ActivityType,
  ImportFormat.Symbol,
  ImportFormat.Quantity,
  ImportFormat.UnitPrice,
];

const SKIP_FIELD_VALUE = '__skip__';

interface ImportPreviewTableProps {
  importFormatFields: ImportFormat[];
  mapping: {
    columns: Partial<Record<ImportFormat, string>>;
    activityTypes: Partial<Record<ActivityType, string[]>>;
    symbolMappings: Record<string, string>;
  };
  headers: string[];
  csvData: string[][];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  getMappedValue: (row: string[], field: ImportFormat) => string;
}

export function ImportMappingTable({
  importFormatFields,
  mapping,
  headers,
  csvData,
  handleColumnMapping,
  handleActivityTypeMapping,
  handleSymbolMapping,
  getMappedValue,
}: ImportPreviewTableProps) {
  const [editingHeader, setEditingHeader] = useState<ImportFormat | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview');

  const distinctSymbols = useMemo(() => {
    return Array.from(
      new Set(csvData.slice(1).map((row) => getMappedValue(row, ImportFormat.Symbol))),
    ).filter(Boolean);
  }, [csvData, getMappedValue]);

  const { invalidSymbols, isLoading: isSymbolValidationLoading } =
    useSymbolValidation(distinctSymbols);

  const symbolsToMap = useMemo(() => {
    return distinctSymbols.filter(
      (symbol) => !mapping.symbolMappings[symbol] || invalidSymbols.includes(symbol),
    );
  }, [distinctSymbols, mapping.symbolMappings, invalidSymbols]);

  const { distinctActivityTypes, totalRows } = useMemo(() => {
    const activityTypeMap = new Map<string, { row: string[]; count: number }>();
    let total = 0;

    csvData.slice(1).forEach((row, index) => {
      const csvType = getMappedValue(row, ImportFormat.ActivityType);
      if (!activityTypeMap.has(csvType)) {
        activityTypeMap.set(csvType, {
          row: [...row, (index + 2).toString()],
          count: 1,
        });
      } else {
        const current = activityTypeMap.get(csvType)!;
        activityTypeMap.set(csvType, {
          ...current,
          count: current.count + 1,
        });
      }
      total++;
    });

    return {
      distinctActivityTypes: Array.from(activityTypeMap.entries()).map(([type, data]) => ({
        csvType: type,
        row: data.row,
        count: data.count,
        appType: findAppTypeForCsvType(type, mapping.activityTypes),
      })),
      activityTypeCounts: Object.fromEntries(
        Array.from(activityTypeMap.entries()).map(([type, data]) => [type, data.count]),
      ),
      totalRows: total,
    };
  }, [csvData, getMappedValue, mapping.activityTypes]);

  const { distinctSymbolRows } = useMemo(() => {
    const symbolMap = new Map<string, { row: string[]; rowIndices: number[] }>();

    csvData.slice(1).forEach((row, index) => {
      const symbol = getMappedValue(row, ImportFormat.Symbol);
      if (!symbol) return;

      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          row: [...row, (index + 2).toString()],
          rowIndices: [index + 2],
        });
      } else {
        const current = symbolMap.get(symbol)!;
        symbolMap.set(symbol, {
          ...current,
          rowIndices: [...current.rowIndices, index + 2],
        });
      }
    });

    return {
      distinctSymbolRows: Array.from(symbolMap.entries()).map(([symbol, data]) => ({
        symbol,
        row: data.row,
        rowIndices: data.rowIndices,
        isValid: !invalidSymbols.includes(symbol),
        mappedSymbol: mapping.symbolMappings[symbol],
      })),
    };
  }, [csvData, getMappedValue, invalidSymbols, mapping.symbolMappings]);

  const rowsToShow = useMemo(() => {
    const rowSet = new Set<number>();

    distinctActivityTypes.forEach(({ row }) => {
      const rowNum = parseInt(row[row.length - 1]);
      const csvType = getMappedValue(row, ImportFormat.ActivityType);
      const hasMapping = findAppTypeForCsvType(csvType, mapping.activityTypes);

      // Include both unmapped and mapped rows
      if (!hasMapping || hasMapping) {
        rowSet.add(rowNum);
      }
    });

    // Add rows that need symbol mapping or have symbol mapping
    distinctSymbolRows.forEach(({ rowIndices, isValid, mappedSymbol }) => {
      // Include both unmapped and mapped symbols
      if (!isValid || !mappedSymbol || mappedSymbol) {
        rowIndices.forEach((rowNum) => rowSet.add(rowNum));
      }
    });

    return Array.from(rowSet).sort((a, b) => a - b);
  }, [distinctActivityTypes, distinctSymbolRows, mapping.activityTypes]);

  const renderHeaderCell = (field: ImportFormat) => {
    const mappedHeader = mapping.columns[field];
    const isMapped = typeof mappedHeader === 'string' && headers.includes(mappedHeader);
    const isEditing = editingHeader === field || !isMapped;
    const isRequired = REQUIRED_FIELDS.includes(field);

    return (
      <div>
        <div className="flex items-center gap-2 px-4 pb-0 pt-2">
          <span className="font-bold">{field}</span>
        </div>
        {isEditing ? (
          <Select
            onValueChange={(val) => {
              handleColumnMapping(field, val === SKIP_FIELD_VALUE ? '' : val);
              setEditingHeader(null);
            }}
            value={mappedHeader || SKIP_FIELD_VALUE}
            onOpenChange={(open) => !open && setEditingHeader(null)}
          >
            <SelectTrigger className="h-8 w-full px-3 py-2 text-sm font-normal text-muted-foreground">
              <SelectValue placeholder={isRequired ? 'Select column' : 'Optional'} />
            </SelectTrigger>
            <SelectContent className="max-h-[300px] overflow-y-auto">
              {!isRequired && (
                <>
                  <SelectItem value={SKIP_FIELD_VALUE}>
                    {field === ImportFormat.Currency ? 'Account Currency' : 'Ignore'}
                  </SelectItem>
                  <SelectSeparator />
                </>
              )}
              {headers.map((header) => (
                <SelectItem key={header || '-'} value={header || '-'}>
                  {header || '-'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-8 py-0 font-normal text-muted-foreground"
            onClick={() => setEditingHeader(field)}
          >
            {mappedHeader || (isRequired ? 'Select column' : 'Ignore')}
          </Button>
        )}
      </div>
    );
  };

  function findAppTypeForCsvType(
    csvType: string,
    mappings: Partial<Record<ActivityType, string[]>>,
  ): ActivityType | null {
    const normalizedCsvType = csvType.trim().toUpperCase();

    for (const [appType, csvTypes] of Object.entries(mappings)) {
      if (
        csvTypes?.some((mappedType) => {
          const normalizedMappedType = mappedType.trim().toUpperCase();
          return normalizedCsvType.startsWith(normalizedMappedType);
        })
      ) {
        return appType as ActivityType;
      }
    }
    return null;
  }

  const renderActivityTypeCell = ({
    csvType,
    appType,
  }: {
    csvType: string;
    appType: ActivityType | null;
  }) => {
    const trimmedCsvType = csvType.trim().toUpperCase();
    const displayValue =
      trimmedCsvType.length > 27 ? `${trimmedCsvType.substring(0, 27)}...` : trimmedCsvType;

    if (appType) {
      return (
        <div className="flex items-center space-x-2">
          <Badge title={trimmedCsvType}>
            {displayValue.length > ACTIVITY_TYPE_PREFIX_LENGTH
              ? `${displayValue.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH)}...`
              : displayValue}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            className="h-8 py-0 font-normal text-muted-foreground"
            onClick={() => {
              // Pass empty string as ActivityType to trigger removal of mapping
              handleActivityTypeMapping(trimmedCsvType, '' as ActivityType);
            }}
          >
            {appType}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2">
        {displayValue.length > ACTIVITY_TYPE_PREFIX_LENGTH ? (
          <span className="text-destructive" title={trimmedCsvType}>
            {displayValue}
          </span>
        ) : (
          <Badge variant="destructive" title={trimmedCsvType}>
            {displayValue}
          </Badge>
        )}
        <Select
          onValueChange={(newType) =>
            handleActivityTypeMapping(trimmedCsvType, newType as ActivityType)
          }
          value=""
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="..." />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ActivityType).map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const renderCell = (field: ImportFormat, row: string[]) => {
    const value = getMappedValue(row, field);

    if (field === ImportFormat.Symbol && mapping.columns[ImportFormat.Symbol]) {
      return renderSymbolCell({
        csvSymbol: value,
        mappedSymbol: mapping.symbolMappings?.[value],
        isInvalid: invalidSymbols.includes(value),
      });
    }

    if (field === ImportFormat.ActivityType) {
      const csvType = value;
      const appType = findAppTypeForCsvType(csvType, mapping.activityTypes);
      return renderActivityTypeCell({ csvType, appType });
    }

    return value;
  };

  const renderSymbolCell = ({
    csvSymbol,
    mappedSymbol,
    isInvalid,
  }: {
    csvSymbol: string;
    mappedSymbol: string | undefined;
    isInvalid: boolean;
  }) => {
    if (mappedSymbol && !isInvalid) {
      return (
        <div className="flex items-center space-x-2">
          <span>{csvSymbol}</span>
          <Button
            type="button"
            variant="ghost"
            className="h-8 py-0 font-normal text-muted-foreground"
            onClick={() => {
              handleSymbolMapping(csvSymbol, '');
            }}
          >
            {mappedSymbol}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2">
        <span className={isInvalid ? 'text-destructive' : ''}>{csvSymbol}</span>
        <TickerSearchInput
          defaultValue={mappedSymbol || ''}
          onSelectResult={(newSymbol) => handleSymbolMapping(csvSymbol, newSymbol)}
        />
        {isInvalid && <Badge variant="destructive">Invalid</Badge>}
      </div>
    );
  };

  return (
    <Card className="mx-auto w-full">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'preview' | 'raw')}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg font-bold">
            <div>
              <div>CSV Mapping</div>
              <div className="text-sm font-normal text-muted-foreground">{totalRows} rows</div>
            </div>
            <TabsList>
              <TabsTrigger value="preview">Mapping Preview</TabsTrigger>
              <TabsTrigger value="raw">File Preview</TabsTrigger>
            </TabsList>
          </CardTitle>
        </CardHeader>

        <TabsContent value="preview">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <div className="flex flex-col">
                      <span>Field</span>
                      <span className="inline-flex h-8 items-center justify-center whitespace-nowrap py-0 text-sm font-normal text-muted-foreground">
                        Mapping
                      </span>
                    </div>
                  </TableHead>
                  {importFormatFields.map((field) => (
                    <TableHead key={field}>{renderHeaderCell(field)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsToShow.map((rowNum) => {
                  const row = csvData[rowNum - 1];
                  return (
                    <TableRow key={`row-${rowNum}`}>
                      <TableCell>{rowNum}</TableCell>
                      {importFormatFields.map((field) => (
                        <TableCell key={field}>{renderCell(field, row)}</TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
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
                {csvData.slice(1).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{index + 2}</TableCell>
                    <TableCell>
                      <code className="whitespace-pre-wrap font-mono text-sm">{row.join(',')}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
