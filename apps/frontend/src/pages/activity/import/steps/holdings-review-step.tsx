import { useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { parse, parseISO, isValid, format as formatDate } from "date-fns";
import type { SymbolSearchResult as GridSymbolSearchResult } from "@wealthfolio/ui";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

import { checkHoldingsImport } from "@/adapters";
import { useImportContext } from "../context";
import { setMapping, setParsedData, setHoldingsCheckPassed } from "../context/import-actions";
import { ImportAlert } from "../components/import-alert";
import { SymbolResolutionPanel } from "../components/symbol-resolution-panel";
import { HoldingsFormat } from "./holdings-mapping-step";
import { getDateFnsPattern } from "../utils/date-format-options";
import { HoldingsDataGrid, type HoldingsRow } from "../components/holdings-data-grid";
import type {
  HoldingsSnapshotInput,
  HoldingsPositionInput,
  CheckHoldingsImportResult,
  SymbolSearchResult,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CASH_SYMBOL = "$CASH";

interface ParseOptions {
  dateFormat: string;
  decimalSeparator: string;
  thousandsSeparator: string;
  defaultCurrency: string;
}

/**
 * Parse a numeric value from a string, handling various decimal/thousands formats.
 * Mirrors the logic in review-step.tsx's parseNumericValue.
 */
function parseNumericValue(
  value: string | undefined,
  decimalSeparator: string,
  thousandsSeparator: string,
): string | undefined {
  if (!value || value.trim() === "") return undefined;

  let normalized = value.trim();
  let isNegative = false;

  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    isNegative = true;
    normalized = normalized.slice(1, -1);
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  let resolvedDecimal = decimalSeparator;
  if (decimalSeparator === "auto") {
    if (lastComma !== -1 && lastDot !== -1) {
      resolvedDecimal = lastComma > lastDot ? "," : ".";
    } else if (lastComma !== -1) {
      resolvedDecimal = ",";
    } else {
      resolvedDecimal = ".";
    }
  }

  let cleaned = normalized.replace(/[^\d.,+-]/g, "");

  if (thousandsSeparator !== "none" && thousandsSeparator !== "auto") {
    cleaned = cleaned.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "");
  } else {
    const defaultThousands = resolvedDecimal === "," ? "." : ",";
    cleaned = cleaned.replace(new RegExp(`\\${defaultThousands}`, "g"), "");
  }

  if (resolvedDecimal === ",") {
    const parts = cleaned.split(",");
    if (parts.length > 1) {
      const decimalPart = parts.pop() ?? "";
      cleaned = `${parts.join("")}.${decimalPart}`;
    }
  } else {
    const parts = cleaned.split(".");
    if (parts.length > 1) {
      const decimalPart = parts.pop() ?? "";
      cleaned = `${parts.join("")}.${decimalPart}`;
    }
  }

  let candidate = cleaned;
  if (isNegative && candidate && !candidate.startsWith("-")) {
    candidate = `-${candidate}`;
  }

  if (candidate === "" || candidate === "-" || candidate === "+") {
    return undefined;
  }

  const numericCheck = Number(candidate);
  return Number.isFinite(numericCheck) ? candidate : undefined;
}

/**
 * Parse a date value to YYYY-MM-DD using the configured format.
 * Uses date-fns for robust parsing, matching the activity import approach.
 */
function parseDateToYMD(dateStr: string, dateFormat: string): string | null {
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 1. If user specified a format, try it first
  const pattern = getDateFnsPattern(dateFormat);
  if (pattern) {
    try {
      const parsed = parse(trimmed, pattern, new Date());
      if (isValid(parsed)) return formatDate(parsed, "yyyy-MM-dd");
    } catch {
      // fall through to auto-detection
    }
  }

  // 2. ISO8601 preset
  if (dateFormat === "ISO8601") {
    try {
      const parsed = parseISO(trimmed);
      if (isValid(parsed)) return formatDate(parsed, "yyyy-MM-dd");
    } catch {
      // fall through
    }
  }

  // 3. Auto-detection: try ISO format first
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    try {
      const parsed = parseISO(trimmed);
      if (isValid(parsed)) return formatDate(parsed, "yyyy-MM-dd");
    } catch {
      // fall through
    }
  }

  // 4. Try common separated formats with date-fns
  const commonPatterns = [
    "MM/dd/yyyy",
    "dd/MM/yyyy",
    "MM-dd-yyyy",
    "dd-MM-yyyy",
    "dd.MM.yyyy",
    "MM.dd.yyyy",
    "yyyy/MM/dd",
  ];
  for (const p of commonPatterns) {
    try {
      const parsed = parse(trimmed, p, new Date());
      if (isValid(parsed)) return formatDate(parsed, "yyyy-MM-dd");
    } catch {
      continue;
    }
  }

  // 5. Fallback to JS Date
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) {
    return formatDate(date, "yyyy-MM-dd");
  }

  return null;
}

/**
 * Parse CSV rows into holdings snapshots grouped by date
 */
export function parseHoldingsSnapshots(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
  parseOptions: ParseOptions,
  symbolMappings?: Record<string, string>,
  symbolMeta?: Record<string, { exchangeMic?: string }>,
): HoldingsSnapshotInput[] {
  const { dateFormat, decimalSeparator, thousandsSeparator, defaultCurrency } = parseOptions;

  const dateHeader = mapping[HoldingsFormat.DATE];
  const symbolHeader = mapping[HoldingsFormat.SYMBOL];
  const quantityHeader = mapping[HoldingsFormat.QUANTITY];
  const avgCostHeader = mapping[HoldingsFormat.AVG_COST];
  const currencyHeader = mapping[HoldingsFormat.CURRENCY];

  const dateIndex = dateHeader ? headers.indexOf(dateHeader) : -1;
  const symbolIndex = symbolHeader ? headers.indexOf(symbolHeader) : -1;
  const quantityIndex = quantityHeader ? headers.indexOf(quantityHeader) : -1;
  const avgCostIndex = avgCostHeader ? headers.indexOf(avgCostHeader) : -1;
  const currencyIndex = currencyHeader ? headers.indexOf(currencyHeader) : -1;

  // Group rows by date
  const snapshotsByDate = new Map<
    string,
    { positions: HoldingsPositionInput[]; cashBalances: Record<string, string> }
  >();

  for (const row of rows) {
    const rawDate = dateIndex >= 0 ? row[dateIndex]?.trim() : "";
    const rawSymbol = symbolIndex >= 0 ? row[symbolIndex]?.trim().toUpperCase() : "";
    const rawQuantity = quantityIndex >= 0 ? row[quantityIndex]?.trim() : "";
    const rawAvgCost = avgCostIndex >= 0 ? row[avgCostIndex]?.trim() : undefined;
    const currency = currencyIndex >= 0 ? row[currencyIndex]?.trim() : defaultCurrency;

    if (!rawDate || !rawSymbol || !rawQuantity) {
      continue; // Skip rows with missing required fields
    }

    // Normalize date using configured format
    const normalizedDate = parseDateToYMD(rawDate, dateFormat);
    if (!normalizedDate) {
      continue; // Skip invalid dates
    }

    // Normalize numeric values using configured separators
    const quantity = parseNumericValue(rawQuantity, decimalSeparator, thousandsSeparator);
    if (!quantity) {
      continue; // Skip rows with invalid quantity
    }
    const avgCost = parseNumericValue(rawAvgCost, decimalSeparator, thousandsSeparator);

    if (!snapshotsByDate.has(normalizedDate)) {
      snapshotsByDate.set(normalizedDate, { positions: [], cashBalances: {} });
    }

    const snapshot = snapshotsByDate.get(normalizedDate)!;

    // Apply symbol mapping if available
    const symbol = symbolMappings?.[rawSymbol] || rawSymbol;

    if (symbol === CASH_SYMBOL) {
      // Cash balance entry — accumulate by currency
      const cashCurrency = currency || defaultCurrency;
      const existingAmount = parseFloat(snapshot.cashBalances[cashCurrency] || "0");
      const newAmount = parseFloat(quantity) || 0;
      snapshot.cashBalances[cashCurrency] = String(existingAmount + newAmount);
    } else {
      // Security position
      const exchangeMic = symbolMeta?.[rawSymbol]?.exchangeMic ?? symbolMeta?.[symbol]?.exchangeMic;
      snapshot.positions.push({
        symbol,
        quantity,
        avgCost: avgCost || undefined,
        currency: currency || defaultCurrency,
        ...(exchangeMic ? { exchangeMic } : {}),
      });
    }
  }

  // Convert map to array sorted by date (newest first)
  const snapshots: HoldingsSnapshotInput[] = [];
  for (const [date, data] of snapshotsByDate.entries()) {
    snapshots.push({
      date,
      positions: data.positions,
      cashBalances: data.cashBalances,
    });
  }

  snapshots.sort((a, b) => b.date.localeCompare(a.date));

  return snapshots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build flat rows for the data grid
// ─────────────────────────────────────────────────────────────────────────────

function buildHoldingsRows(
  headers: string[],
  parsedRows: string[][],
  fieldMappings: Record<string, string>,
  parseOptions: ParseOptions,
  symbolMappings?: Record<string, string>,
): HoldingsRow[] {
  const { dateFormat, decimalSeparator, thousandsSeparator, defaultCurrency } = parseOptions;

  const dateIndex = fieldMappings[HoldingsFormat.DATE]
    ? headers.indexOf(fieldMappings[HoldingsFormat.DATE])
    : -1;
  const symbolIndex = fieldMappings[HoldingsFormat.SYMBOL]
    ? headers.indexOf(fieldMappings[HoldingsFormat.SYMBOL])
    : -1;
  const quantityIndex = fieldMappings[HoldingsFormat.QUANTITY]
    ? headers.indexOf(fieldMappings[HoldingsFormat.QUANTITY])
    : -1;
  const avgCostIndex = fieldMappings[HoldingsFormat.AVG_COST]
    ? headers.indexOf(fieldMappings[HoldingsFormat.AVG_COST])
    : -1;
  const currencyIndex = fieldMappings[HoldingsFormat.CURRENCY]
    ? headers.indexOf(fieldMappings[HoldingsFormat.CURRENCY])
    : -1;

  const rows: HoldingsRow[] = [];

  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const rawDate = dateIndex >= 0 ? row[dateIndex]?.trim() : "";
    const rawSymbol = symbolIndex >= 0 ? row[symbolIndex]?.trim().toUpperCase() : "";
    const rawQuantity = quantityIndex >= 0 ? row[quantityIndex]?.trim() : "";
    const rawAvgCost = avgCostIndex >= 0 ? row[avgCostIndex]?.trim() : "";
    const rawCurrency = currencyIndex >= 0 ? row[currencyIndex]?.trim() : "";

    // Skip rows with missing required fields
    if (!rawDate || !rawSymbol || !rawQuantity) continue;

    const normalizedDate = parseDateToYMD(rawDate, dateFormat) ?? rawDate;
    const quantity =
      parseNumericValue(rawQuantity, decimalSeparator, thousandsSeparator) ?? rawQuantity;
    const avgCost =
      parseNumericValue(rawAvgCost, decimalSeparator, thousandsSeparator) ?? rawAvgCost;
    const currency = rawCurrency || defaultCurrency;
    const isCash = rawSymbol === CASH_SYMBOL;
    const resolvedSymbol = isCash ? CASH_SYMBOL : symbolMappings?.[rawSymbol] || rawSymbol;

    rows.push({
      rowIndex: i,
      date: normalizedDate,
      rawSymbol,
      symbol: resolvedSymbol,
      isCash,
      quantity,
      avgCost,
      currency,
    });
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Review Step Component
// ─────────────────────────────────────────────────────────────────────────────

export function HoldingsReviewStep() {
  const { state, dispatch } = useImportContext();
  const { headers, parsedRows, mapping, parseConfig, accountId } = state;

  const fieldMappings = mapping?.fieldMappings || {};
  const symbolMappings = mapping?.symbolMappings || {};
  const parseOptions: ParseOptions = useMemo(
    () => ({
      dateFormat: parseConfig.dateFormat,
      decimalSeparator: parseConfig.decimalSeparator,
      thousandsSeparator: parseConfig.thousandsSeparator,
      defaultCurrency: parseConfig.defaultCurrency,
    }),
    [parseConfig],
  );

  // Build flat row data for the grid
  const holdingsRows = useMemo(
    () => buildHoldingsRows(headers, parsedRows, fieldMappings, parseOptions, symbolMappings),
    [headers, parsedRows, fieldMappings, parseOptions, symbolMappings],
  );

  // Parse snapshots for the summary stats
  const snapshots = useMemo(
    () => parseHoldingsSnapshots(headers, parsedRows, fieldMappings, parseOptions, symbolMappings),
    [headers, parsedRows, fieldMappings, parseOptions, symbolMappings],
  );

  const totalPositions = snapshots.reduce((sum, s) => sum + s.positions.length, 0);
  const totalCashEntries = snapshots.reduce(
    (sum, s) => sum + Object.keys(s.cashBalances).length,
    0,
  );

  // Backend check state
  const [checkResult, setCheckResult] = useState<CheckHoldingsImportResult | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);

  useEffect(() => {
    if (!accountId || snapshots.length === 0) return;

    let cancelled = false;
    setCheckLoading(true);
    dispatch(setHoldingsCheckPassed(false));
    checkHoldingsImport(accountId, snapshots)
      .then((result) => {
        if (cancelled) return;
        setCheckResult(result);

        const unfound = result.symbols.filter((s) => !s.found);
        const hasErrors = result.validationErrors.length > 0;
        dispatch(setHoldingsCheckPassed(unfound.length === 0 && !hasErrors));

        // Merge check-resolved exchange_mic into symbolMappingMeta
        // (don't overwrite entries already set by user via ticker search)
        if (mapping && result.symbols.length > 0) {
          const existingMeta = mapping.symbolMappingMeta || {};
          let changed = false;
          const merged = { ...existingMeta };
          for (const sym of result.symbols) {
            if (sym.exchangeMic && !merged[sym.symbol]?.exchangeMic) {
              merged[sym.symbol] = { ...merged[sym.symbol], exchangeMic: sym.exchangeMic };
              changed = true;
            }
          }
          if (changed) {
            dispatch(setMapping({ ...mapping, symbolMappingMeta: merged }));
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCheckResult(null);
          dispatch(setHoldingsCheckPassed(false));
        }
      })
      .finally(() => {
        if (!cancelled) setCheckLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, snapshots]);

  const newSymbols = checkResult?.symbols.filter((s) => !s.found) ?? [];
  const foundSymbols = checkResult?.symbols.filter((s) => s.found) ?? [];

  // Handle data changes from the grid (quantity, avgCost, currency edits)
  const handleDataChange = useCallback(
    (nextRows: HoldingsRow[]) => {
      // Map grid edits back to parsedRows
      const updatedParsedRows = [...parsedRows];

      const quantityIndex = fieldMappings[HoldingsFormat.QUANTITY]
        ? headers.indexOf(fieldMappings[HoldingsFormat.QUANTITY])
        : -1;
      const avgCostIndex = fieldMappings[HoldingsFormat.AVG_COST]
        ? headers.indexOf(fieldMappings[HoldingsFormat.AVG_COST])
        : -1;
      const currencyIndex = fieldMappings[HoldingsFormat.CURRENCY]
        ? headers.indexOf(fieldMappings[HoldingsFormat.CURRENCY])
        : -1;

      for (const row of nextRows) {
        const origRow = [...(updatedParsedRows[row.rowIndex] || [])];
        if (quantityIndex >= 0) origRow[quantityIndex] = row.quantity;
        if (avgCostIndex >= 0) origRow[avgCostIndex] = row.avgCost;
        if (currencyIndex >= 0) origRow[currencyIndex] = row.currency;
        updatedParsedRows[row.rowIndex] = origRow;
      }

      dispatch(setParsedData(headers, updatedParsedRows));
    },
    [parsedRows, headers, fieldMappings, dispatch],
  );

  // Handle symbol selection from the grid's ticker search
  const handleSymbolSelect = useCallback(
    (_rowIndex: number, symbol: string, result?: GridSymbolSearchResult) => {
      if (!mapping || !result) return;

      // Find the raw symbol for this row to create the mapping
      const row = holdingsRows.find((r) => r.rowIndex === _rowIndex);
      if (!row) return;

      const csvSymbol = row.rawSymbol;
      const newSymbolMappings = { ...mapping.symbolMappings, [csvSymbol]: symbol };
      const newSymbolMappingMeta = {
        ...(mapping.symbolMappingMeta || {}),
        [csvSymbol]: {
          exchangeMic: result.exchangeMic,
          symbolName: result.longName,
          quoteCcy: result.currency,
          instrumentType:
            "quoteType" in result ? (result as { quoteType?: string }).quoteType : undefined,
        },
      };

      dispatch(
        setMapping({
          ...mapping,
          symbolMappings: newSymbolMappings,
          symbolMappingMeta: newSymbolMappingMeta,
        }),
      );
    },
    [mapping, holdingsRows, dispatch],
  );

  // Handle batch symbol resolution from the shared panel (same pattern as activity import)
  const handleSymbolResolution = useCallback(
    (mappings: Record<string, SymbolSearchResult>) => {
      if (!mapping) return;

      const newSymbolMappings = { ...mapping.symbolMappings };
      const newSymbolMappingMeta = { ...(mapping.symbolMappingMeta || {}) };

      for (const [csvSymbol, result] of Object.entries(mappings)) {
        newSymbolMappings[csvSymbol] = result.symbol;
        newSymbolMappingMeta[csvSymbol] = {
          exchangeMic: result.exchangeMic,
          symbolName: result.longName,
          quoteCcy: result.currency,
          instrumentType: result.quoteType,
        };
      }

      dispatch(
        setMapping({
          ...mapping,
          symbolMappings: newSymbolMappings,
          symbolMappingMeta: newSymbolMappingMeta,
        }),
      );
    },
    [mapping, dispatch],
  );

  const unresolvedSymbols = useMemo(
    () => newSymbols.map((s) => ({ csvSymbol: s.symbol })),
    [newSymbols],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ImportAlert
          variant="info"
          size="sm"
          title="Snapshots"
          description={`${snapshots.length} date${snapshots.length !== 1 ? "s" : ""}`}
          icon={Icons.Calendar}
          className="mb-0"
        />
        <ImportAlert
          variant="info"
          size="sm"
          title="Positions"
          description={`${totalPositions} holdings`}
          icon={Icons.BarChart}
          className="mb-0"
        />
        <ImportAlert
          variant="info"
          size="sm"
          title="Cash Balances"
          description={`${totalCashEntries} entr${totalCashEntries !== 1 ? "ies" : "y"}`}
          icon={Icons.Wallet}
          className="mb-0"
        />
        {checkLoading ? (
          <Skeleton className="h-[60px] rounded-lg" />
        ) : checkResult?.validationErrors.length ? (
          <ImportAlert
            variant="destructive"
            size="sm"
            title="Validation Errors"
            description={`${checkResult.validationErrors.length} error${checkResult.validationErrors.length !== 1 ? "s" : ""}`}
            icon={Icons.AlertTriangle}
            className="mb-0"
          />
        ) : newSymbols.length > 0 ? (
          <ImportAlert
            variant="warning"
            size="sm"
            title="Unresolved Symbols"
            description={`${newSymbols.length} to map`}
            icon={Icons.AlertTriangle}
            className="mb-0"
          />
        ) : (
          <ImportAlert
            variant="success"
            size="sm"
            title="Ready to Import"
            description={`${holdingsRows.length} rows`}
            icon={Icons.CheckCircle}
            className="mb-0"
            rightIcon={Icons.CheckCircle}
          />
        )}
      </div>

      {/* Backend check alerts */}
      {checkResult && (
        <div className="flex flex-col gap-3">
          {checkResult.existingDates.length > 0 && (
            <ImportAlert variant="warning" size="sm" title="Existing Snapshots Will Be Overwritten">
              <p className="text-xs">
                {checkResult.existingDates.length} snapshot date
                {checkResult.existingDates.length !== 1 ? "s" : ""} already exist
                {checkResult.existingDates.length === 1 ? "s" : ""} and will be overwritten:{" "}
                {checkResult.existingDates.sort().join(", ")}
              </p>
            </ImportAlert>
          )}
          <SymbolResolutionPanel
            unresolvedSymbols={unresolvedSymbols}
            onApplyMappings={handleSymbolResolution}
          />
          {foundSymbols.length > 0 && (
            <ImportAlert variant="info" size="sm" title="Matched Assets">
              <p className="text-xs">
                {foundSymbols.length} symbol{foundSymbols.length !== 1 ? "s" : ""} matched existing
                assets: {foundSymbols.map((s) => `${s.symbol} (${s.assetName})`).join(", ")}
              </p>
            </ImportAlert>
          )}
          {checkResult.validationErrors.length > 0 && (
            <ImportAlert variant="destructive" size="sm" title="Validation Errors">
              <ul className="list-inside list-disc text-xs">
                {checkResult.validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </ImportAlert>
          )}
        </div>
      )}

      {/* Editable Data Grid */}
      <HoldingsDataGrid
        rows={holdingsRows}
        onDataChange={handleDataChange}
        onSymbolSelect={handleSymbolSelect}
      />
    </div>
  );
}

export default HoldingsReviewStep;
