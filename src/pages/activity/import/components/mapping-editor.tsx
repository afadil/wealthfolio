import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportFormat, ActivityType, ImportMappingData, CsvRowData, Account } from "@/lib/types";

import { MappingTable } from "./mapping-table";
import { CardContent } from "@/components/ui/card";
import { CSVFileViewer } from "./csv-file-viewer";
import { validateTickerSymbol } from "../utils/validation-utils";

interface CsvMappingEditorProps {
  mapping: ImportMappingData;
  headers: string[];
  data: CsvRowData[];
  accounts: Account[];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  getMappedValue: (row: CsvRowData, field: ImportFormat) => string;
  handleAccountIdMapping: (csvAccountId: string, accountId: string) => void;
  distinctAccountIds: string[];
  mappedFieldsCount: number;
  totalFields: number;
  requiredFieldsMapped: boolean;
}

export function CsvMappingEditor(props: CsvMappingEditorProps) {
  const distinctSymbols = useMemo(() => {
    return Array.from(
      new Set(props.data.map((row) => props.getMappedValue(row, ImportFormat.SYMBOL))),
    ).filter(Boolean);
  }, [props.data, props.getMappedValue]);

  const invalidSymbols = useMemo(() => {
    return distinctSymbols.filter((symbol) => !validateTickerSymbol(symbol));
  }, [distinctSymbols]);

  const { distinctActivityTypes, totalRows } = useMemo(() => {
    const activityTypeMap = new Map<string, { row: CsvRowData; count: number }>();

    let total = 0;

    props.data.forEach((row) => {
      const csvType = props.getMappedValue(row, ImportFormat.ACTIVITY_TYPE);
      if (!activityTypeMap.has(csvType)) {
        activityTypeMap.set(csvType, {
          row,
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
  }, [props.data, props.getMappedValue, props.mapping.activityMappings]);

  const { distinctSymbolRows } = useMemo(() => {
    const symbolMap = new Map<string, { row: CsvRowData; count: number }>();

    props.data.forEach((row) => {
      const symbol = props.getMappedValue(row, ImportFormat.SYMBOL);
      if (!symbol) return;

      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          row,
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
  }, [props.data, props.getMappedValue, invalidSymbols, props.mapping.symbolMappings]);

  const distinctAccounts = useMemo(() => {
    return Array.from(
      new Set(props.data.map((row) => props.getMappedValue(row, ImportFormat.ACCOUNT))),
    ).filter(Boolean);
  }, [props.data, props.getMappedValue]);

  const invalidAccounts = useMemo(() => {
    return distinctAccounts.filter((account) => !props.mapping.accountMappings?.[account]);
  }, [distinctAccounts, props.mapping.accountMappings]);

  const { distinctAccountRows } = useMemo(() => {
    const accountMap = new Map<string, { row: CsvRowData; count: number }>();

    props.data.forEach((row) => {
      const account = props.getMappedValue(row, ImportFormat.ACCOUNT);
      if (!account) return;

      if (!accountMap.has(account)) {
        accountMap.set(account, {
          row,
          count: 1,
        });
      } else {
        const current = accountMap.get(account)!;
        accountMap.set(account, {
          ...current,
          count: current.count + 1,
        });
      }
    });

    return {
      distinctAccountRows: Array.from(accountMap.entries()).map(([account, data]) => ({
        accountId: account,
        row: data.row,
        count: data.count,
        isValid: !invalidAccounts.includes(account),
        mappedAccount: props.mapping.accountMappings[account],
      })),
    };
  }, [props.data, props.getMappedValue, invalidAccounts, props.mapping.accountMappings]);

  const dataToMap = useMemo(() => {
    // Create a Set of rows that need mapping
    const rowsNeedingMapping = new Set<CsvRowData>();
    const processedRows = new Map<string, CsvRowData>();

    // Process activity types and symbols in a single pass
    distinctActivityTypes.forEach(({ row, appType }) => {
      const lineNumber = row.lineNumber;
      processedRows.set(lineNumber, row);

      if (!appType) {
        rowsNeedingMapping.add(row);
      }
    });

    distinctSymbolRows.forEach(({ row, isValid, mappedSymbol }) => {
      const lineNumber = row.lineNumber;
      processedRows.set(lineNumber, row);

      if (!isValid && !mappedSymbol) {
        rowsNeedingMapping.add(row);
      }
    });

    distinctAccountRows.forEach(({ row, isValid, mappedAccount }) => {
      const lineNumber = row.lineNumber;
      processedRows.set(lineNumber, row);
      if (!isValid && !mappedAccount) {
        rowsNeedingMapping.add(row);
      }
    });

    // Convert to array and sort
    return Array.from(processedRows.values()).sort((a, b) => {
      const aNeedsMapping = rowsNeedingMapping.has(a);
      const bNeedsMapping = rowsNeedingMapping.has(b);

      if (aNeedsMapping !== bNeedsMapping) {
        return aNeedsMapping ? -1 : 1;
      }

      return parseInt(a.lineNumber) - parseInt(b.lineNumber);
    });
  }, [distinctActivityTypes, distinctSymbolRows, distinctAccountRows]);

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

  // Convert CsvRowData to CSVLine format for CSVFileViewer
  const csvData = useMemo(() => {
    return [
      // Add header row
      {
        id: 0,
        content: props.headers.join(","),
        isValid: true,
      },
      // Add data rows
      ...props.data.map((rowData, index) => ({
        id: index + 1, // Add 1 to account for header row
        content: props.headers.map((header) => rowData[header] || "").join(","),
        isValid: true, // Assume all lines are valid in the raw view
      })),
    ];
  }, [props.data, props.headers]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Tabs defaultValue="preview" className="flex flex-1 flex-col">
        <div className="py-2">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground px-3 text-sm">
              <span className="font-medium">{totalRows} </span>total row{totalRows !== 1 ? "s" : ""}
            </div>
            <TabsList className="bg-secondary flex space-x-1 rounded-full p-1">
              <TabsTrigger
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90 h-8 rounded-full px-2 text-sm"
                value="preview"
              >
                Activity Preview
              </TabsTrigger>
              <TabsTrigger
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90 h-8 rounded-full px-2 text-sm"
                value="raw"
              >
                File Preview
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <CardContent className="flex-1 overflow-y-auto p-0">
          <TabsContent value="preview" className="m-0 flex flex-col border-0 p-0">
            <MappingTable
              {...props}
              data={dataToMap}
              accounts={props.accounts}
              invalidSymbols={invalidSymbols}
              invalidAccounts={invalidAccounts}
              className="max-h-[50vh]"
            />
          </TabsContent>

          <TabsContent value="raw" className="m-0 flex-1 border-0 p-0">
            <CSVFileViewer data={csvData} className="w-full" maxHeight="50vh" />
          </TabsContent>
        </CardContent>
      </Tabs>
    </div>
  );
}
