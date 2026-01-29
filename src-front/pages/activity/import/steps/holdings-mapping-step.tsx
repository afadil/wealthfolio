import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@wealthfolio/ui/components/ui/alert";

import { useImportContext } from "../context";
import { setMapping } from "../context/import-actions";
import type { ImportMappingData } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Format Fields
// ─────────────────────────────────────────────────────────────────────────────

export enum HoldingsFormat {
  DATE = "date",
  SYMBOL = "symbol",
  QUANTITY = "quantity",
  PRICE = "price",
  CURRENCY = "currency",
}

const HOLDINGS_REQUIRED_FIELDS: HoldingsFormat[] = [
  HoldingsFormat.DATE,
  HoldingsFormat.SYMBOL,
  HoldingsFormat.QUANTITY,
];

const HOLDINGS_FIELD_LABELS: Record<HoldingsFormat, string> = {
  [HoldingsFormat.DATE]: "Date",
  [HoldingsFormat.SYMBOL]: "Symbol",
  [HoldingsFormat.QUANTITY]: "Quantity",
  [HoldingsFormat.PRICE]: "Price (Optional)",
  [HoldingsFormat.CURRENCY]: "Currency (Optional)",
};

const HOLDINGS_FIELD_DESCRIPTIONS: Record<HoldingsFormat, string> = {
  [HoldingsFormat.DATE]: "The date of the holdings snapshot (YYYY-MM-DD)",
  [HoldingsFormat.SYMBOL]: "Ticker symbol (use $CASH for cash balances)",
  [HoldingsFormat.QUANTITY]: "Number of shares held (or cash amount for $CASH)",
  [HoldingsFormat.PRICE]: "Price per share at snapshot date",
  [HoldingsFormat.CURRENCY]: "Currency code (e.g., USD, EUR)",
};

// ─────────────────────────────────────────────────────────────────────────────
// CSV Preview Component
// ─────────────────────────────────────────────────────────────────────────────

interface CsvPreviewProps {
  headers: string[];
  rows: string[][];
  mapping: Record<string, string>;
}

function CsvPreviewTable({ headers, rows, mapping }: CsvPreviewProps) {
  const displayRows = rows.slice(0, 10);

  // Get reverse mapping (headerName -> field)
  const headerToField = useMemo(() => {
    const map: Record<string, HoldingsFormat> = {};
    for (const [field, headerName] of Object.entries(mapping)) {
      if (headerName) {
        map[headerName] = field as HoldingsFormat;
      }
    }
    return map;
  }, [mapping]);

  return (
    <div className="max-h-[300px] overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            {headers.map((header, idx) => {
              const mappedField = headerToField[header];
              return (
                <th key={idx} className="border-r px-3 py-2 text-left font-medium last:border-r-0">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-xs">{header}</span>
                    {mappedField && (
                      <Badge variant="secondary" className="w-fit text-xs">
                        {HOLDINGS_FIELD_LABELS[mappedField]}
                      </Badge>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="font-mono text-xs">
          {displayRows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/30 border-t">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="border-r px-3 py-2 last:border-r-0">
                  {cell || <span className="text-muted-foreground">-</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Mapping Step Component
// ─────────────────────────────────────────────────────────────────────────────

export function HoldingsMappingStep() {
  const { state, dispatch } = useImportContext();
  const { headers, parsedRows, mapping } = state;

  // Local state for holdings field mappings
  const [holdingsFieldMappings, setHoldingsFieldMappings] = useState<Record<string, string>>(() => {
    // Try to auto-detect mappings based on header names
    const autoMappings: Record<string, string> = {};

    for (const header of headers) {
      const lowerHeader = header.toLowerCase().trim();

      if (lowerHeader === "date" || lowerHeader.includes("date")) {
        autoMappings[HoldingsFormat.DATE] = header;
      } else if (lowerHeader === "symbol" || lowerHeader === "ticker" || lowerHeader === "name") {
        autoMappings[HoldingsFormat.SYMBOL] = header;
      } else if (
        lowerHeader === "quantity" ||
        lowerHeader === "qty" ||
        lowerHeader === "shares" ||
        lowerHeader === "amount"
      ) {
        autoMappings[HoldingsFormat.QUANTITY] = header;
      } else if (lowerHeader === "price" || lowerHeader.includes("price")) {
        autoMappings[HoldingsFormat.PRICE] = header;
      } else if (lowerHeader === "currency" || lowerHeader === "ccy") {
        autoMappings[HoldingsFormat.CURRENCY] = header;
      }
    }

    return autoMappings;
  });

  // Update mapping in context
  const updateMapping = useCallback(
    (field: HoldingsFormat, headerName: string) => {
      const newMappings = { ...holdingsFieldMappings, [field]: headerName };
      setHoldingsFieldMappings(newMappings);

      // Update context mapping with holdings-specific field mappings
      const updatedMapping: ImportMappingData = {
        ...(mapping || {
          accountId: state.accountId,
          name: "holdings-import",
          fieldMappings: {},
          activityMappings: {},
          symbolMappings: {},
          accountMappings: {},
        }),
        fieldMappings: newMappings as Record<string, string>,
      };
      dispatch(setMapping(updatedMapping));
    },
    [holdingsFieldMappings, mapping, state.accountId, dispatch],
  );

  // Check which required fields are mapped
  const requiredFieldsMapped = HOLDINGS_REQUIRED_FIELDS.every(
    (field) => holdingsFieldMappings[field] && headers.includes(holdingsFieldMappings[field]),
  );

  // Count unique dates to show number of snapshots
  const dateColumn = holdingsFieldMappings[HoldingsFormat.DATE];
  const dateIndex = dateColumn ? headers.indexOf(dateColumn) : -1;
  const uniqueDates = useMemo(() => {
    if (dateIndex === -1) return new Set<string>();
    return new Set(parsedRows.map((row) => row[dateIndex]).filter(Boolean));
  }, [parsedRows, dateIndex]);

  // Count $CASH rows
  const symbolColumn = holdingsFieldMappings[HoldingsFormat.SYMBOL];
  const symbolIndex = symbolColumn ? headers.indexOf(symbolColumn) : -1;
  const cashRowCount = useMemo(() => {
    if (symbolIndex === -1) return 0;
    return parsedRows.filter((row) => row[symbolIndex]?.toUpperCase() === "$CASH").length;
  }, [parsedRows, symbolIndex]);

  return (
    <div className="flex flex-col gap-6">
      {/* Info Alert */}
      <Alert>
        <Icons.Info className="h-4 w-4" />
        <AlertTitle>Holdings Import Format</AlertTitle>
        <AlertDescription>
          <p className="mb-2">
            Map your CSV columns to the holdings format. Each row should represent one holding at a
            specific date.
          </p>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            <li>
              <strong>$CASH</strong> is a reserved symbol for cash balances. Use it in the Symbol
              column.
            </li>
            <li>Rows with the same date will be grouped into a single snapshot.</li>
            <li>Multiple dates will create multiple historical snapshots.</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Field Mappings */}
      <Card>
        <CardHeader className="px-4 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Column Mappings</CardTitle>
            <div className="flex items-center gap-2">
              {requiredFieldsMapped ? (
                <Badge variant="default" className="gap-1">
                  <Icons.Check className="h-3 w-3" />
                  All required fields mapped
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <Icons.X className="h-3 w-3" />
                  Required fields missing
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(HoldingsFormat).map((field) => {
              const isRequired = HOLDINGS_REQUIRED_FIELDS.includes(field);
              const currentValue = holdingsFieldMappings[field] || "";
              const isMapped = currentValue && headers.includes(currentValue);

              return (
                <div key={field} className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    {HOLDINGS_FIELD_LABELS[field]}
                    {isRequired && <span className="text-destructive">*</span>}
                    {isMapped && <Icons.Check className="h-4 w-4 text-green-600" />}
                  </label>
                  <Select
                    value={currentValue}
                    onValueChange={(value) => updateMapping(field, value)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select column..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Not mapped</SelectItem>
                      {headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    {HOLDINGS_FIELD_DESCRIPTIONS[field]}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {requiredFieldsMapped && (
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm font-medium">Import Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{parsedRows.length}</div>
                <div className="text-muted-foreground text-xs">Total Rows</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{uniqueDates.size}</div>
                <div className="text-muted-foreground text-xs">Snapshots</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{parsedRows.length - cashRowCount}</div>
                <div className="text-muted-foreground text-xs">Holdings</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{cashRowCount}</div>
                <div className="text-muted-foreground text-xs">Cash Entries</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CSV Preview */}
      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm font-medium">Data Preview</CardTitle>
        </CardHeader>
        <CardContent className="border-t p-0">
          <CsvPreviewTable headers={headers} rows={parsedRows} mapping={holdingsFieldMappings} />
        </CardContent>
      </Card>
    </div>
  );
}

export default HoldingsMappingStep;
