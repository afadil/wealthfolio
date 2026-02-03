import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@wealthfolio/ui/components/ui/select";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { cn } from "@/lib/utils";
import { useImportContext, setMapping as setMappingAction } from "../context";
import {
  ImportFormat,
  IMPORT_REQUIRED_FIELDS,
  ActivityType,
  ACTIVITY_TYPES,
} from "@/lib/constants";
import type { ImportMappingData, SymbolSearchResult } from "@/lib/types";
import TickerSearchInput from "@/components/ticker-search";
import { initializeColumnMapping } from "../hooks/use-import-mapping";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnMappingItem {
  csvColumn: string;
  sampleValues: string[];
  mappedField: ImportFormat | null;
}

interface ActivityTypeItem {
  csvValue: string;
  count: number;
  mappedType: string | null;
}

interface SymbolItem {
  csvSymbol: string;
  count: number;
  resolvedSymbol: string | null;
  isResolved: boolean;
  isCashOnly: boolean; // True if symbol is only used in cash activity rows
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_FIELDS: { value: ImportFormat; label: string; required: boolean }[] = [
  { value: ImportFormat.DATE, label: "Date", required: true },
  { value: ImportFormat.ACTIVITY_TYPE, label: "Activity Type", required: true },
  { value: ImportFormat.SYMBOL, label: "Symbol", required: true },
  { value: ImportFormat.QUANTITY, label: "Quantity", required: true },
  { value: ImportFormat.UNIT_PRICE, label: "Unit Price", required: true },
  { value: ImportFormat.AMOUNT, label: "Amount", required: true },
  { value: ImportFormat.CURRENCY, label: "Currency", required: false },
  { value: ImportFormat.FEE, label: "Fee", required: false },
  { value: ImportFormat.COMMENT, label: "Comment", required: false },
  { value: ImportFormat.ACCOUNT, label: "Account", required: false },
];

const SKIP_FIELD_VALUE = "__skip__";

// Smart defaults for activity type mapping
const ACTIVITY_TYPE_SMART_DEFAULTS: Record<string, string> = {
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

// Activity types where symbol is optional (can be cash or asset-related)
const NO_SYMBOL_REQUIRED_ACTIVITY_TYPES = [
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.INTEREST, // Can be cash interest or bond/asset interest
  ActivityType.TRANSFER_IN, // Can be cash or share transfer
  ActivityType.TRANSFER_OUT,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getSmartDefault(csvValue: string): string | null {
  const normalized = csvValue.trim().toUpperCase();

  // Direct match
  if (ACTIVITY_TYPE_SMART_DEFAULTS[normalized]) {
    return ACTIVITY_TYPE_SMART_DEFAULTS[normalized];
  }

  // Partial match (e.g., "BUY - MARKET" starts with "BUY")
  for (const [key, value] of Object.entries(ACTIVITY_TYPE_SMART_DEFAULTS)) {
    if (normalized.startsWith(key) || normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

function findMappedActivityType(
  csvValue: string,
  activityMappings: Record<string, string[]>,
): string | null {
  const normalized = csvValue.trim().toUpperCase();

  for (const [activityType, csvValues] of Object.entries(activityMappings)) {
    if (csvValues?.some((v) => normalized.startsWith(v.trim().toUpperCase()))) {
      return activityType;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnMappingSectionProps {
  columns: ColumnMappingItem[];
  onMapColumn: (csvColumn: string, field: ImportFormat | null) => void;
  usedFields: Set<ImportFormat>;
}

function ColumnMappingSection({ columns, onMapColumn, usedFields }: ColumnMappingSectionProps) {
  return (
    <div className="space-y-2">
      {/* Compact rows */}
      {columns.map((column) => {
        const isMapped = !!column.mappedField;
        return (
          <div
            key={column.csvColumn}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2",
              isMapped
                ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                : "bg-muted/30 border-dashed",
            )}
          >
            {/* Status icon */}
            {isMapped ? (
              <Icons.CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <div className="border-muted-foreground/30 h-4 w-4 shrink-0 rounded-full border-2" />
            )}

            {/* Column info */}
            <div className="min-w-0 flex-1">
              <span className={cn("text-sm font-medium", !isMapped && "text-muted-foreground")}>
                {column.csvColumn}
              </span>
              {column.sampleValues.length > 0 && (
                <span className="text-muted-foreground ml-2 text-xs">
                  ({column.sampleValues.slice(0, 3).join(", ")}
                  {column.sampleValues.length > 3 ? ", …" : ""})
                </span>
              )}
            </div>

            {/* Arrow */}
            <Icons.ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />

            {/* Field Selector */}
            <Select
              value={column.mappedField || SKIP_FIELD_VALUE}
              onValueChange={(value) => {
                onMapColumn(
                  column.csvColumn,
                  value === SKIP_FIELD_VALUE ? null : (value as ImportFormat),
                );
              }}
            >
              <SelectTrigger
                className={cn(
                  "h-8 w-[180px] shrink-0 text-sm",
                  !isMapped && "text-muted-foreground border-dashed",
                )}
              >
                <SelectValue placeholder="Select field..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SKIP_FIELD_VALUE}>
                  <span className="text-muted-foreground">Skip</span>
                </SelectItem>
                <SelectSeparator />
                {TARGET_FIELDS.map((field) => {
                  const isUsed = usedFields.has(field.value) && column.mappedField !== field.value;
                  return (
                    <SelectItem key={field.value} value={field.value} disabled={isUsed}>
                      {field.label}
                      {field.required && <span className="ml-1 text-amber-600">*</span>}
                      {isUsed && <span className="text-muted-foreground ml-1 text-xs">(used)</span>}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

interface ActivityTypeMappingSectionProps {
  items: ActivityTypeItem[];
  onMapActivityType: (csvValue: string, activityType: string) => void;
}

function ActivityTypeMappingSection({ items, onMapActivityType }: ActivityTypeMappingSectionProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icons.AlertCircle className="text-muted-foreground mb-4 h-12 w-12" />
        <p className="text-muted-foreground">
          Map the "Activity Type" column first to see values here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isMapped = !!item.mappedType;
        return (
          <div
            key={item.csvValue}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2",
              isMapped
                ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                : "border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
            )}
          >
            {/* Status icon */}
            {isMapped ? (
              <Icons.CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <Icons.AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            )}

            {/* CSV Value with count */}
            <div className="min-w-0 flex-1">
              <span
                className={cn("text-sm font-medium", !isMapped && "text-red-700 dark:text-red-400")}
              >
                {item.csvValue}
              </span>
              <span className="text-muted-foreground ml-2 text-xs">
                ({item.count} row{item.count !== 1 ? "s" : ""})
              </span>
            </div>

            {/* Arrow */}
            <Icons.ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />

            {/* Activity Type Selector */}
            <Select
              value={item.mappedType || ""}
              onValueChange={(value) => onMapActivityType(item.csvValue, value)}
            >
              <SelectTrigger
                className={cn(
                  "h-8 w-[180px] shrink-0 text-sm",
                  !isMapped && "border-red-300 dark:border-red-800",
                )}
              >
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

interface SymbolResolutionSectionProps {
  items: SymbolItem[];
  onResolveSymbol: (
    csvSymbol: string,
    resolvedSymbol: string,
    searchResult?: SymbolSearchResult,
  ) => void;
}

function SymbolResolutionSection({ items, onResolveSymbol }: SymbolResolutionSectionProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Icons.AlertCircle className="text-muted-foreground mb-4 h-12 w-12" />
        <p className="text-muted-foreground">Map the "Symbol" column first to see values here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isResolved = item.isResolved;
        const isCashOnly = item.isCashOnly;

        return (
          <div
            key={item.csvSymbol}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2",
              isResolved
                ? isCashOnly
                  ? "bg-muted/30 border-muted-foreground/20"
                  : "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                : "border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
            )}
          >
            {/* Status icon */}
            {isResolved ? (
              isCashOnly ? (
                <Icons.Minus className="text-muted-foreground h-4 w-4 shrink-0" />
              ) : (
                <Icons.CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
              )
            ) : (
              <Icons.AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            )}

            {/* CSV Symbol with count */}
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "font-mono text-sm font-medium",
                  isCashOnly && "text-muted-foreground",
                  !isResolved && "text-red-700 dark:text-red-400",
                )}
              >
                {item.csvSymbol || "(empty)"}
              </span>
              <span className="text-muted-foreground ml-2 text-xs">
                ({item.count} row{item.count !== 1 ? "s" : ""})
              </span>
              {isCashOnly && (
                <span className="text-muted-foreground ml-2 text-xs">— cash activity</span>
              )}
              {!isCashOnly && item.resolvedSymbol && item.resolvedSymbol !== item.csvSymbol && (
                <span className="text-muted-foreground ml-2 text-xs">→ {item.resolvedSymbol}</span>
              )}
            </div>

            {/* Arrow and Symbol Search - only show for non-cash symbols */}
            {!isCashOnly && (
              <>
                <Icons.ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                <TickerSearchInput
                  defaultValue={item.resolvedSymbol || item.csvSymbol}
                  onSelectResult={(symbol, searchResult) => {
                    onResolveSymbol(item.csvSymbol, symbol, searchResult);
                  }}
                  placeholder="Search symbol..."
                  className={cn(
                    "bg-background h-8 w-[180px] shrink-0 text-sm",
                    !isResolved && "border-red-300 dark:border-red-800",
                  )}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export function MappingStepV2() {
  const { state, dispatch } = useImportContext();
  const { headers, parsedRows, mapping } = state;
  const hasAutoInitialized = useRef(false);

  // Local state for the mapping being edited
  const [localMapping, setLocalMapping] = useState<ImportMappingData>(() => ({
    accountId: mapping?.accountId || state.accountId || "",
    name: mapping?.name || "",
    fieldMappings: mapping?.fieldMappings || {},
    activityMappings: mapping?.activityMappings || {},
    symbolMappings: mapping?.symbolMappings || {},
    accountMappings: mapping?.accountMappings || {},
  }));

  // Auto-initialize column mappings when headers are available
  useEffect(() => {
    // Only auto-initialize once per component mount
    if (hasAutoInitialized.current) return;

    // Skip if no headers or if there are already field mappings
    if (!headers || headers.length === 0) return;
    if (Object.keys(localMapping.fieldMappings).length > 0) {
      hasAutoInitialized.current = true;
      return;
    }

    // Auto-detect column mappings
    const autoMappings = initializeColumnMapping(headers);
    if (Object.keys(autoMappings).length > 0) {
      setLocalMapping((prev) => ({
        ...prev,
        fieldMappings: {
          ...autoMappings,
          ...prev.fieldMappings,
        },
      }));
    }
    hasAutoInitialized.current = true;
  }, [headers, localMapping.fieldMappings]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived data for Column Mapping section
  // ───────────────────────────────────────────────────────────────────────────

  const columnMappingItems = useMemo<ColumnMappingItem[]>(() => {
    return headers.map((header) => {
      const headerIndex = headers.indexOf(header);

      // Get unique sample values from the data (scan more rows to get variety)
      const allValues = parsedRows
        .slice(0, 20) // Sample from first 20 rows
        .map((row) => row[headerIndex]?.trim() || "")
        .filter(Boolean);

      // Get unique values, preserving order of first occurrence
      const uniqueValues: string[] = [];
      const seen = new Set<string>();
      for (const value of allValues) {
        if (!seen.has(value)) {
          seen.add(value);
          uniqueValues.push(value);
        }
        if (uniqueValues.length >= 5) break; // Limit to 5 unique samples
      }

      // Find if this column is mapped to any field
      const mappedField = Object.entries(localMapping.fieldMappings).find(
        ([_, csvHeader]) => csvHeader === header,
      )?.[0] as ImportFormat | undefined;

      return {
        csvColumn: header,
        sampleValues: uniqueValues,
        mappedField: mappedField || null,
      };
    });
  }, [headers, parsedRows, localMapping.fieldMappings]);

  // Track which fields are already used
  const usedFields = useMemo(() => {
    return new Set(
      Object.keys(localMapping.fieldMappings).filter(
        (key) => localMapping.fieldMappings[key],
      ) as ImportFormat[],
    );
  }, [localMapping.fieldMappings]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived data for Activity Type Mapping section
  // ───────────────────────────────────────────────────────────────────────────

  const activityTypeItems = useMemo<ActivityTypeItem[]>(() => {
    const activityTypeColumnHeader = localMapping.fieldMappings[ImportFormat.ACTIVITY_TYPE];
    if (!activityTypeColumnHeader) return [];

    const headerIndex = headers.indexOf(activityTypeColumnHeader);
    if (headerIndex === -1) return [];

    // Count occurrences of each activity type value
    const valueCounts = new Map<string, number>();
    parsedRows.forEach((row) => {
      const value = row[headerIndex]?.trim();
      if (value) {
        valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
      }
    });

    return Array.from(valueCounts.entries())
      .map(([csvValue, count]) => {
        // Check if already mapped
        let mappedType = findMappedActivityType(csvValue, localMapping.activityMappings);

        // If not mapped, try smart defaults
        if (!mappedType) {
          mappedType = getSmartDefault(csvValue);
        }

        return {
          csvValue,
          count,
          mappedType,
        };
      })
      .sort((a, b) => {
        // Sort unmapped items first, then by count
        if (a.mappedType && !b.mappedType) return 1;
        if (!a.mappedType && b.mappedType) return -1;
        return b.count - a.count;
      });
  }, [headers, parsedRows, localMapping.fieldMappings, localMapping.activityMappings]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived data for Symbol Resolution section
  // ───────────────────────────────────────────────────────────────────────────

  const symbolItems = useMemo<SymbolItem[]>(() => {
    const symbolColumnHeader = localMapping.fieldMappings[ImportFormat.SYMBOL];
    if (!symbolColumnHeader) return [];

    const symbolHeaderIndex = headers.indexOf(symbolColumnHeader);
    if (symbolHeaderIndex === -1) return [];

    // Get activity type column index for cash activity detection
    const activityTypeColumnHeader = localMapping.fieldMappings[ImportFormat.ACTIVITY_TYPE];
    const activityHeaderIndex = activityTypeColumnHeader
      ? headers.indexOf(activityTypeColumnHeader)
      : -1;

    // Track symbol counts and whether they're only used in cash activities
    const symbolData = new Map<string, { count: number; hasNonCashUsage: boolean }>();

    parsedRows.forEach((row) => {
      const symbol = row[symbolHeaderIndex]?.trim();
      if (symbol === undefined) return;

      const existing = symbolData.get(symbol) || { count: 0, hasNonCashUsage: false };
      existing.count++;

      // Check if this row requires a symbol (non-cash activity)
      if (activityHeaderIndex !== -1) {
        const csvActivityType = row[activityHeaderIndex]?.trim();
        if (csvActivityType) {
          const mappedType = findMappedActivityType(csvActivityType, localMapping.activityMappings);
          // Use the smart default if no explicit mapping
          const effectiveType = mappedType || getSmartDefault(csvActivityType);
          const isNoSymbolRequired =
            effectiveType &&
            (NO_SYMBOL_REQUIRED_ACTIVITY_TYPES as readonly string[]).includes(effectiveType);
          if (!isNoSymbolRequired) {
            existing.hasNonCashUsage = true;
          }
        } else {
          // No activity type means we can't determine, treat as requiring symbol
          existing.hasNonCashUsage = true;
        }
      } else {
        // No activity type column mapped, can't determine
        existing.hasNonCashUsage = true;
      }

      symbolData.set(symbol, existing);
    });

    return Array.from(symbolData.entries())
      .map(([csvSymbol, data]) => {
        const resolvedSymbol = localMapping.symbolMappings[csvSymbol];
        const isValidSymbol = /^[A-Z0-9]{1,10}([.-][A-Z0-9]+){0,2}$/.test(csvSymbol.trim());
        const isCashOnly = !data.hasNonCashUsage;

        // Consider resolved if: cash-only OR valid symbol format OR has explicit mapping
        const isResolved = isCashOnly || isValidSymbol || !!resolvedSymbol;

        return {
          csvSymbol,
          count: data.count,
          resolvedSymbol: resolvedSymbol || null,
          isResolved,
          isCashOnly,
        };
      })
      .sort((a, b) => {
        // Sort: unresolved first, then cash-only, then by count
        if (a.isResolved && !b.isResolved) return 1;
        if (!a.isResolved && b.isResolved) return -1;
        if (a.isCashOnly && !b.isCashOnly) return 1;
        if (!a.isCashOnly && b.isCashOnly) return -1;
        return b.count - a.count;
      });
  }, [
    headers,
    parsedRows,
    localMapping.fieldMappings,
    localMapping.symbolMappings,
    localMapping.activityMappings,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleMapColumn = useCallback((csvColumn: string, field: ImportFormat | null) => {
    setLocalMapping((prev) => {
      const newFieldMappings = { ...prev.fieldMappings };

      // Remove any existing mapping to this field
      if (field) {
        Object.keys(newFieldMappings).forEach((key) => {
          if (newFieldMappings[key] === csvColumn) {
            delete newFieldMappings[key];
          }
        });
      }

      // Remove any existing mapping for this CSV column
      Object.keys(newFieldMappings).forEach((key) => {
        if (newFieldMappings[key] === csvColumn) {
          delete newFieldMappings[key];
        }
      });

      // Set new mapping
      if (field) {
        newFieldMappings[field] = csvColumn;
      }

      return {
        ...prev,
        fieldMappings: newFieldMappings,
      };
    });
  }, []);

  const handleMapActivityType = useCallback((csvValue: string, activityType: string) => {
    setLocalMapping((prev) => {
      const newActivityMappings = { ...prev.activityMappings };
      const normalizedCsvValue = csvValue.trim().toUpperCase();

      // Remove this CSV value from any existing mapping
      Object.keys(newActivityMappings).forEach((key) => {
        newActivityMappings[key] = (newActivityMappings[key] || []).filter(
          (v) => v.trim().toUpperCase() !== normalizedCsvValue,
        );
        // Clean up empty arrays
        if (newActivityMappings[key].length === 0) {
          delete newActivityMappings[key];
        }
      });

      // Add to new mapping
      if (activityType) {
        if (!newActivityMappings[activityType]) {
          newActivityMappings[activityType] = [];
        }
        if (!newActivityMappings[activityType].includes(normalizedCsvValue)) {
          newActivityMappings[activityType].push(normalizedCsvValue);
        }
      }

      return {
        ...prev,
        activityMappings: newActivityMappings,
      };
    });
  }, []);

  const handleResolveSymbol = useCallback(
    (csvSymbol: string, resolvedSymbol: string, _searchResult?: SymbolSearchResult) => {
      setLocalMapping((prev) => ({
        ...prev,
        symbolMappings: {
          ...prev.symbolMappings,
          [csvSymbol.trim()]: resolvedSymbol.trim(),
        },
      }));
    },
    [],
  );

  // Auto-save mapping to context when local mapping changes
  // This keeps the context in sync with local edits
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip first render to avoid unnecessary dispatch
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    dispatch(setMappingAction(localMapping));
  }, [localMapping, dispatch]);

  // ───────────────────────────────────────────────────────────────────────────
  // Status indicators
  // ───────────────────────────────────────────────────────────────────────────

  const requiredFieldsMapped = IMPORT_REQUIRED_FIELDS.every(
    (field) => localMapping.fieldMappings[field],
  );

  const unmappedActivityTypes = activityTypeItems.filter((item) => !item.mappedType).length;
  const unresolvedSymbols = symbolItems.filter((item) => !item.isResolved).length;

  const columnStatus = requiredFieldsMapped ? "complete" : "incomplete";
  const activityStatus =
    unmappedActivityTypes === 0
      ? "complete"
      : activityTypeItems.length === 0
        ? "empty"
        : "incomplete";
  const symbolStatus =
    unresolvedSymbols === 0 ? "complete" : symbolItems.length === 0 ? "empty" : "incomplete";

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Status Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3",
            columnStatus === "complete"
              ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
              : "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20",
          )}
        >
          {columnStatus === "complete" ? (
            <Icons.CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <Icons.AlertCircle className="h-5 w-5 text-amber-600" />
          )}
          <div>
            <div className="text-sm font-medium">Columns</div>
            <div className="text-muted-foreground text-xs">
              {
                Object.keys(localMapping.fieldMappings).filter((k) => localMapping.fieldMappings[k])
                  .length
              }{" "}
              mapped
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3",
            activityStatus === "complete"
              ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
              : activityStatus === "empty"
                ? "border-border"
                : "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20",
          )}
        >
          {activityStatus === "complete" ? (
            <Icons.CheckCircle className="h-5 w-5 text-green-600" />
          ) : activityStatus === "empty" ? (
            <Icons.Circle className="text-muted-foreground h-5 w-5" />
          ) : (
            <Icons.AlertCircle className="h-5 w-5 text-amber-600" />
          )}
          <div>
            <div className="text-sm font-medium">Activity Types</div>
            <div className="text-muted-foreground text-xs">
              {activityTypeItems.length - unmappedActivityTypes}/{activityTypeItems.length} mapped
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3",
            symbolStatus === "complete"
              ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
              : symbolStatus === "empty"
                ? "border-border"
                : "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20",
          )}
        >
          {symbolStatus === "complete" ? (
            <Icons.CheckCircle className="h-5 w-5 text-green-600" />
          ) : symbolStatus === "empty" ? (
            <Icons.Circle className="text-muted-foreground h-5 w-5" />
          ) : (
            <Icons.AlertCircle className="h-5 w-5 text-amber-600" />
          )}
          <div>
            <div className="text-sm font-medium">Symbols</div>
            <div className="text-muted-foreground text-xs">
              {symbolItems.length - unresolvedSymbols}/{symbolItems.length} resolved
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="columns" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="columns" className="flex items-center gap-2">
            <Icons.ListChecks className="h-4 w-4" />
            Columns
            {columnStatus === "incomplete" && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                !
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="types" className="flex items-center gap-2">
            <Icons.Activity className="h-4 w-4" />
            Activity Types
            {activityStatus === "incomplete" && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {unmappedActivityTypes}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="symbols" className="flex items-center gap-2">
            <Icons.Tag className="h-4 w-4" />
            Symbols
            {symbolStatus === "incomplete" && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {unresolvedSymbols}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="columns" className="mt-4">
          <ColumnMappingSection
            columns={columnMappingItems}
            onMapColumn={handleMapColumn}
            usedFields={usedFields}
          />
        </TabsContent>

        <TabsContent value="types" className="mt-4">
          <ActivityTypeMappingSection
            items={activityTypeItems}
            onMapActivityType={handleMapActivityType}
          />
        </TabsContent>

        <TabsContent value="symbols" className="mt-4">
          <SymbolResolutionSection items={symbolItems} onResolveSymbol={handleResolveSymbol} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MappingStepV2;
