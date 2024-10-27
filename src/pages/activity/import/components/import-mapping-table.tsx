import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportFormat, ActivityType, ImportMappingData } from '@/lib/types';
import { validateTickerSymbol } from '../utils/csvValidation';
import { ImportMappingPreviewTable } from './import-mapping-preview-table';
import { ImportMappingRawTable } from './import-mapping-raw-table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface ImportMappingTableProps {
  importFormatFields: ImportFormat[];
  mapping: ImportMappingData;
  headers: string[];
  csvData: string[][];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  getMappedValue: (row: string[], field: ImportFormat) => string;
}

export function ImportMappingTable(props: ImportMappingTableProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'raw'>('preview');

  const distinctSymbols = useMemo(() => {
    return Array.from(
      new Set(props.csvData.slice(1).map((row) => props.getMappedValue(row, ImportFormat.Symbol))),
    ).filter(Boolean);
  }, [props.csvData, props.getMappedValue]);

  const invalidSymbols = useMemo(() => {
    return distinctSymbols.filter((symbol) => !validateTickerSymbol(symbol));
  }, [distinctSymbols]);

  const { distinctActivityTypes, totalRows } = useMemo(() => {
    const activityTypeMap = new Map<string, { row: string[]; count: number }>();
    let total = 0;

    props.csvData.slice(1).forEach((row, index) => {
      const csvType = props.getMappedValue(row, ImportFormat.ActivityType);
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
        appType: findAppTypeForCsvType(type, props.mapping.activityMappings),
      })),
      totalRows: total,
    };
  }, [props.csvData, props.getMappedValue, props.mapping.activityMappings]);

  const { distinctSymbolRows } = useMemo(() => {
    const symbolMap = new Map<string, { row: string[]; count: number }>();

    props.csvData.slice(1).forEach((row, index) => {
      const symbol = props.getMappedValue(row, ImportFormat.Symbol);
      if (!symbol) return;

      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          row: [...row, (index + 2).toString()],
          count: 1,
        });
      } else {
        const current = symbolMap.get(symbol)!;
        symbolMap.set(symbol, {
          ...current,
          count: current.count + 1,
        });
      }
    });

    return {
      distinctSymbolRows: Array.from(symbolMap.entries()).map(([symbol, data]) => ({
        symbol,
        row: data.row,
        count: data.count,
        isValid: !invalidSymbols.includes(symbol),
        mappedSymbol: props.mapping.symbolMappings[symbol],
      })),
    };
  }, [props.csvData, props.getMappedValue, invalidSymbols, props.mapping.symbolMappings]);

  const rowsToShow = useMemo(() => {
    // Use a Map to track rows and their mapping status
    // key: rowNum, value: { needsMapping: boolean }
    const rowMap = new Map<number, { needsMapping: boolean }>();

    // First pass: collect rows that need mapping
    distinctActivityTypes.forEach(({ row, appType }) => {
      const rowNum = parseInt(row[row.length - 1]);
      if (!rowMap.has(rowNum)) {
        rowMap.set(rowNum, {
          needsMapping: !appType, // needs mapping if no appType
        });
      }
    });

    distinctSymbolRows.forEach(({ row, isValid, mappedSymbol }) => {
      const rowNum = parseInt(row[row.length - 1]);
      if (!rowMap.has(rowNum)) {
        rowMap.set(rowNum, {
          needsMapping: !isValid && !mappedSymbol,
        });
      } else {
        // If row already exists, update needsMapping if symbol needs mapping
        const existing = rowMap.get(rowNum)!;
        if (!isValid && !mappedSymbol) {
          existing.needsMapping = true;
        }
      }
    });

    // Sort rows: unmapped first, then mapped, both in ascending order
    return Array.from(rowMap.entries())
      .sort((a, b) => {
        // First sort by mapping status
        if (a[1].needsMapping && !b[1].needsMapping) return -1;
        if (!a[1].needsMapping && b[1].needsMapping) return 1;
        // Then sort by row number
        return a[0] - b[0];
      })
      .map(([rowNum]) => rowNum);
  }, [distinctActivityTypes, distinctSymbolRows]);

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

  return (
    <Card>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'preview' | 'raw')}
        className="flex h-full flex-col space-y-4"
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-semibold">Mapping</h2>
              <span className="rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground">
                {totalRows} rows
              </span>
            </div>
            <TabsList>
              <TabsTrigger value="preview">Mapping Preview</TabsTrigger>
              <TabsTrigger value="raw">File Preview</TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>

        <CardContent>
          <TabsContent value="preview" className="m-0 h-[500px] min-h-0 flex-1">
            <ImportMappingPreviewTable
              {...props}
              rowsToShow={rowsToShow}
              invalidSymbols={invalidSymbols}
            />
          </TabsContent>

          <TabsContent value="raw">
            <ImportMappingRawTable headers={props.headers} csvData={props.csvData} />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
