import { useQuery } from "@tanstack/react-query";
import { CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { useCallback, useMemo } from "react";

import { CSVFileViewer } from "../components/csv-file-viewer";
import { ImportAlert } from "../components/import-alert";
import { MappingTable } from "../components/mapping-table";
import { setMapping, useImportContext } from "../context";
import { useImportMapping } from "../hooks/use-import-mapping";
import { validateTickerSymbol } from "../utils/validation-utils";

import { getAccounts } from "@/adapters";
import { ActivityType, IMPORT_REQUIRED_FIELDS, ImportFormat } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, CsvRowData, ImportMappingData } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

// Smart defaults for activity type mapping
const ACTIVITY_TYPE_SMART_DEFAULTS: Record<string, ActivityType> = {
  BUY: ActivityType.BUY,
  PURCHASE: ActivityType.BUY,
  BOUGHT: ActivityType.BUY,
  SELL: ActivityType.SELL,
  SOLD: ActivityType.SELL,
  DIVIDEND: ActivityType.DIVIDEND,
  DIV: ActivityType.DIVIDEND,
  DEPOSIT: ActivityType.DEPOSIT,
  WITHDRAWAL: ActivityType.WITHDRAWAL,
  WITHDRAW: ActivityType.WITHDRAWAL,
  FEE: ActivityType.FEE,
  TAX: ActivityType.TAX,
  TRANSFER_IN: ActivityType.TRANSFER_IN,
  TRANSFER: ActivityType.TRANSFER_IN,
  TRANSFER_OUT: ActivityType.TRANSFER_OUT,
  INTEREST: ActivityType.INTEREST,
  INT: ActivityType.INTEREST,
  SPLIT: ActivityType.SPLIT,
  CREDIT: ActivityType.CREDIT,
  ADJUSTMENT: ActivityType.ADJUSTMENT,
};

function findAppTypeForCsvType(
  csvType: string,
  mappings: Record<string, string[]>,
): ActivityType | null {
  const normalizedCsvType = csvType.trim().toUpperCase();

  // Check explicit mappings first
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

  // Check smart defaults - exact match
  if (ACTIVITY_TYPE_SMART_DEFAULTS[normalizedCsvType]) {
    return ACTIVITY_TYPE_SMART_DEFAULTS[normalizedCsvType];
  }

  // Check smart defaults - partial match
  for (const [key, value] of Object.entries(ACTIVITY_TYPE_SMART_DEFAULTS)) {
    if (normalizedCsvType.startsWith(key) || normalizedCsvType.includes(key)) {
      return value;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function MappingStepUnified() {
  const { state, dispatch } = useImportContext();
  const { headers, parsedRows, mapping, accountId } = state;

  // Fetch accounts
  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
  const accounts = accountsData ?? [];

  // Convert string[][] to CsvRowData[]
  const data: CsvRowData[] = useMemo(() => {
    return parsedRows.map((row, index) => {
      const rowData: CsvRowData = { lineNumber: String(index + 1) };
      headers.forEach((header, colIndex) => {
        rowData[header] = row[colIndex] || "";
      });
      return rowData;
    });
  }, [parsedRows, headers]);

  // Use the import mapping hook
  const {
    mapping: localMapping,
    handleColumnMapping,
    handleActivityTypeMapping,
    handleSymbolMapping,
    handleAccountIdMapping,
  } = useImportMapping({
    headers,
    accountId,
    defaultMapping: mapping || {
      accountId: accountId || "",
      name: "",
      fieldMappings: {},
      activityMappings: {},
      symbolMappings: {},
      accountMappings: {},
    },
  });

  // Sync local mapping changes to context
  const syncMappingToContext = useCallback(
    (updatedMapping: ImportMappingData) => {
      dispatch(setMapping(updatedMapping));
    },
    [dispatch],
  );

  // Wrapper handlers that sync to context
  const onColumnMapping = useCallback(
    (field: ImportFormat, value: string) => {
      handleColumnMapping(field, value);
      // Sync after update
      const updated = {
        ...localMapping,
        fieldMappings: { ...localMapping.fieldMappings, [field]: value.trim() },
      };
      syncMappingToContext(updated);
    },
    [handleColumnMapping, localMapping, syncMappingToContext],
  );

  const onActivityTypeMapping = useCallback(
    (csvActivity: string, activityType: ActivityType) => {
      handleActivityTypeMapping(csvActivity, activityType);
      // The hook updates internally, we need to sync
      setTimeout(() => syncMappingToContext(localMapping), 0);
    },
    [handleActivityTypeMapping, localMapping, syncMappingToContext],
  );

  const onSymbolMapping = useCallback(
    (csvSymbol: string, newSymbol: string) => {
      handleSymbolMapping(csvSymbol, newSymbol);
      const updated = {
        ...localMapping,
        symbolMappings: { ...localMapping.symbolMappings, [csvSymbol.trim()]: newSymbol.trim() },
      };
      syncMappingToContext(updated);
    },
    [handleSymbolMapping, localMapping, syncMappingToContext],
  );

  const onAccountIdMapping = useCallback(
    (csvAccountId: string, newAccountId: string) => {
      handleAccountIdMapping(csvAccountId, newAccountId);
      const updated = {
        ...localMapping,
        accountMappings: {
          ...localMapping.accountMappings,
          [csvAccountId.trim()]: newAccountId.trim(),
        },
      };
      syncMappingToContext(updated);
    },
    [handleAccountIdMapping, localMapping, syncMappingToContext],
  );

  // Helper to get mapped value from row
  const getMappedValue = useCallback(
    (row: CsvRowData, field: ImportFormat): string => {
      const headerName = localMapping.fieldMappings[field] || "";
      if (!headerName) return "";
      return row[headerName] || "";
    },
    [localMapping.fieldMappings],
  );

  // Check if all required fields are mapped
  const requiredFieldsMapped = IMPORT_REQUIRED_FIELDS.every(
    (field) =>
      localMapping.fieldMappings[field] && headers.includes(localMapping.fieldMappings[field]),
  );

  // Count how many fields are mapped
  const mappedFieldsCount = Object.entries(localMapping.fieldMappings).filter(
    ([_, headerName]) => headerName && headers.includes(headerName),
  ).length;
  const totalFields = Object.values(ImportFormat).length;

  // Symbols validation
  const distinctSymbols = useMemo(() => {
    return Array.from(new Set(data.map((row) => getMappedValue(row, ImportFormat.SYMBOL)))).filter(
      Boolean,
    );
  }, [data, getMappedValue]);

  const invalidSymbols = useMemo(() => {
    return distinctSymbols.filter((symbol) => !validateTickerSymbol(symbol));
  }, [distinctSymbols]);

  // Account ID mappings
  const distinctAccountIds = useMemo(() => {
    if (!localMapping.fieldMappings[ImportFormat.ACCOUNT]) return [];
    return Array.from(new Set(data.map((row) => getMappedValue(row, ImportFormat.ACCOUNT)))).filter(
      Boolean,
    );
  }, [data, localMapping.fieldMappings, getMappedValue]);

  const invalidAccounts = useMemo(() => {
    return distinctAccountIds.filter((account) => !localMapping.accountMappings?.[account]);
  }, [distinctAccountIds, localMapping.accountMappings]);

  // Activity type mappings
  const { distinctActivityTypes, totalRows } = useMemo(() => {
    const activityTypeMap = new Map<string, { row: CsvRowData; count: number }>();
    let total = 0;

    data.forEach((row) => {
      const csvType = getMappedValue(row, ImportFormat.ACTIVITY_TYPE);
      if (!csvType) return;

      const normalizedCsvType = csvType.trim();
      if (!activityTypeMap.has(normalizedCsvType)) {
        activityTypeMap.set(normalizedCsvType, { row, count: 1 });
      } else {
        const current = activityTypeMap.get(normalizedCsvType)!;
        activityTypeMap.set(normalizedCsvType, { ...current, count: current.count + 1 });
      }
      total++;
    });

    return {
      distinctActivityTypes: Array.from(activityTypeMap.entries()).map(([type, d]) => ({
        csvType: type,
        row: d.row,
        count: d.count,
        appType: findAppTypeForCsvType(type, localMapping.activityMappings || {}),
      })),
      totalRows: total,
    };
  }, [data, getMappedValue, localMapping.activityMappings]);

  // Count unmapped items
  const activitiesToMapCount = useMemo(() => {
    return distinctActivityTypes.filter((activity) => !activity.appType).length;
  }, [distinctActivityTypes]);

  const accountsToMapCount = useMemo(() => {
    if (!localMapping.fieldMappings[ImportFormat.ACCOUNT]) return 0;
    return invalidAccounts.length;
  }, [localMapping.fieldMappings, invalidAccounts]);

  const symbolsToMapCount = useMemo(() => {
    return invalidSymbols.filter((symbol) => {
      const normalizedSymbol = symbol.trim();
      return !Object.keys(localMapping.symbolMappings || {}).some(
        (mappedSymbol) => mappedSymbol.trim() === normalizedSymbol,
      );
    }).length;
  }, [invalidSymbols, localMapping.symbolMappings]);

  // Data to display in mapping table (prioritize rows needing mapping)
  const { distinctSymbolRows } = useMemo(() => {
    const symbolMap = new Map<string, { row: CsvRowData; count: number }>();

    data.forEach((row) => {
      const symbol = getMappedValue(row, ImportFormat.SYMBOL);
      if (!symbol) return;

      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, { row, count: 1 });
      } else {
        const current = symbolMap.get(symbol)!;
        symbolMap.set(symbol, { ...current, count: current.count + 1 });
      }
    });

    return {
      distinctSymbolRows: Array.from(symbolMap.entries()).map(([symbol, d]) => ({
        symbol,
        row: d.row,
        count: d.count,
        isValid: !invalidSymbols.includes(symbol),
        mappedSymbol: localMapping.symbolMappings?.[symbol],
      })),
    };
  }, [data, getMappedValue, invalidSymbols, localMapping.symbolMappings]);

  const { distinctAccountRows } = useMemo(() => {
    const accountMap = new Map<string, { row: CsvRowData; count: number }>();

    data.forEach((row) => {
      const account = getMappedValue(row, ImportFormat.ACCOUNT);
      if (!account) return;

      if (!accountMap.has(account)) {
        accountMap.set(account, { row, count: 1 });
      } else {
        const current = accountMap.get(account)!;
        accountMap.set(account, { ...current, count: current.count + 1 });
      }
    });

    return {
      distinctAccountRows: Array.from(accountMap.entries()).map(([account, d]) => ({
        accountId: account,
        row: d.row,
        count: d.count,
        isValid: !invalidAccounts.includes(account),
        mappedAccount: localMapping.accountMappings?.[account],
      })),
    };
  }, [data, getMappedValue, invalidAccounts, localMapping.accountMappings]);

  const dataToMap = useMemo(() => {
    const rowsNeedingMapping = new Set<CsvRowData>();
    const processedRows = new Map<string, CsvRowData>();

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

    return Array.from(processedRows.values()).sort((a, b) => {
      const aNeedsMapping = rowsNeedingMapping.has(a);
      const bNeedsMapping = rowsNeedingMapping.has(b);

      if (aNeedsMapping !== bNeedsMapping) {
        return aNeedsMapping ? -1 : 1;
      }

      return parseInt(a.lineNumber) - parseInt(b.lineNumber);
    });
  }, [distinctActivityTypes, distinctSymbolRows, distinctAccountRows]);

  // CSV data for raw file viewer
  const csvData = useMemo(() => {
    return [
      { id: 0, content: headers.join(","), isValid: true },
      ...data.map((rowData, index) => ({
        id: index + 1,
        content: headers.map((header) => rowData[header] || "").join(","),
        isValid: true,
      })),
    ];
  }, [data, headers]);

  if (!data || data.length === 0) {
    return (
      <ImportAlert
        variant="destructive"
        title="No CSV data available"
        description="Please go back and upload a valid file."
        icon={Icons.AlertCircle}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Summary Cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ImportAlert
          variant={requiredFieldsMapped ? "success" : "destructive"}
          size="sm"
          title="Fields"
          description={`${mappedFieldsCount} of ${totalFields} mapped`}
          icon={Icons.ListChecks}
          className="mb-0"
          rightIcon={requiredFieldsMapped ? Icons.CheckCircle : Icons.AlertCircle}
        />

        <ImportAlert
          variant={activitiesToMapCount === 0 ? "success" : "destructive"}
          size="sm"
          title="Activities"
          description={`${distinctActivityTypes.length - activitiesToMapCount} of ${distinctActivityTypes.length} mapped`}
          icon={Icons.Activity}
          className="mb-0"
          rightIcon={activitiesToMapCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
        />

        <ImportAlert
          variant={symbolsToMapCount === 0 ? "success" : "destructive"}
          size="sm"
          title="Symbols"
          description={`${distinctSymbols.length - symbolsToMapCount} of ${distinctSymbols.length} mapped`}
          icon={Icons.Tag}
          className="mb-0"
          rightIcon={symbolsToMapCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
        />

        {localMapping.fieldMappings[ImportFormat.ACCOUNT] && (
          <ImportAlert
            variant={accountsToMapCount === 0 ? "success" : "destructive"}
            size="sm"
            title="Accounts"
            description={
              distinctAccountIds.length > 0
                ? `${distinctAccountIds.length - accountsToMapCount} of ${distinctAccountIds.length} mapped`
                : "No unmapped account IDs"
            }
            icon={Icons.Wallet}
            className="mb-0"
            rightIcon={accountsToMapCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}
      </div>

      {/* Mapping Editor with Preview Toggle */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Tabs defaultValue="preview" className="flex flex-1 flex-col">
          <div className="py-2">
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground hidden px-3 text-sm md:block">
                <span className="font-medium">{totalRows} </span>total row
                {totalRows !== 1 ? "s" : ""}
              </div>
              <TabsList className="bg-secondary flex space-x-1 rounded-full p-1">
                <TabsTrigger
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary data-[state=active]:hover:bg-primary/90 h-8 rounded-full px-2 text-sm"
                  value="preview"
                >
                  Activity Preview
                </TabsTrigger>
                <TabsTrigger
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary data-[state=active]:hover:bg-primary/90 h-8 rounded-full px-2 text-sm"
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
                mapping={localMapping}
                headers={headers}
                data={dataToMap}
                accounts={accounts}
                handleColumnMapping={onColumnMapping}
                handleActivityTypeMapping={onActivityTypeMapping}
                handleSymbolMapping={onSymbolMapping}
                handleAccountIdMapping={onAccountIdMapping}
                getMappedValue={getMappedValue}
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
    </div>
  );
}

export default MappingStepUnified;
