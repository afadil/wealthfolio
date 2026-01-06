import { DataGrid, useDataGrid } from "@wealthfolio/ui";
import { useCallback, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import type { AssetKind, Quote } from "@/lib/types";
import { QuoteHistoryToolbar } from "./quote-history-toolbar";
import { format } from "date-fns";

// Helper to normalize date values (handles both Date objects and strings from DateCell)
const normalizeDate = (value: Date | string): Date => {
  if (value instanceof Date) return value;
  return new Date(value);
};

// Get decimal precision based on asset kind
const getDecimalPrecision = (assetKind?: AssetKind | null): number => {
  switch (assetKind) {
    case "CRYPTO":
      return 8; // Crypto needs high precision (e.g., 0.00012345 BTC)
    case "FX_RATE":
      return 6; // FX rates need high precision
    case "OPTION":
      return 4; // Options often have more decimal places
    default:
      return 2; // Standard precision for stocks, ETFs, etc.
  }
};

// Round number to specified decimal places
const roundToDecimals = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/**
 * Local representation of a quote entry for the data grid.
 */
export interface QuoteEntry {
  id: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  currency: string;
  isNew?: boolean;
}

interface QuoteHistoryDataGridProps {
  /** Quote data from the backend */
  data: Quote[];
  /** Symbol for the asset */
  symbol: string;
  /** Currency for the asset */
  currency: string;
  /** Asset kind for decimal precision */
  assetKind?: AssetKind | null;
  /** Whether manual tracking is enabled */
  isManualDataSource?: boolean;
  /** Callback to save a quote */
  onSaveQuote: (quote: Quote) => void;
  /** Callback to delete a quote */
  onDeleteQuote: (quoteId: string) => void;
  /** Callback to change data source mode */
  onChangeDataSource?: (isManual: boolean) => void;
}

// Generate a temporary ID for new entries
const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Convert Quote to QuoteEntry with optional rounding
const toQuoteEntry = (quote: Quote, decimals?: number): QuoteEntry => ({
  id: quote.id,
  date: new Date(quote.timestamp),
  open: decimals !== undefined ? roundToDecimals(quote.open, decimals) : quote.open,
  high: decimals !== undefined ? roundToDecimals(quote.high, decimals) : quote.high,
  low: decimals !== undefined ? roundToDecimals(quote.low, decimals) : quote.low,
  close: decimals !== undefined ? roundToDecimals(quote.close, decimals) : quote.close,
  volume: Math.round(quote.volume), // Volume is always integer
  currency: quote.currency,
  isNew: false,
});

// Convert QuoteEntry back to Quote for saving
const toQuote = (entry: QuoteEntry, symbol: string): Quote => {
  const datePart = format(entry.date, "yyyy-MM-dd").replace(/-/g, "");
  return {
    id: entry.id.startsWith("temp-") ? `${datePart}_${symbol.toUpperCase()}` : entry.id,
    createdAt: new Date().toISOString(),
    dataSource: "MANUAL",
    timestamp: entry.date.toISOString(),
    symbol: symbol,
    open: entry.open,
    high: entry.high,
    low: entry.low,
    close: entry.close,
    volume: entry.volume,
    adjclose: entry.close,
    currency: entry.currency,
  };
};

// Create draft entry
const createDraftEntry = (currency: string): QuoteEntry => ({
  id: generateTempId(),
  date: new Date(),
  open: 0,
  high: 0,
  low: 0,
  close: 0,
  volume: 0,
  currency,
  isNew: true,
});

export function QuoteHistoryDataGrid({
  data,
  symbol,
  currency,
  assetKind,
  isManualDataSource = false,
  onSaveQuote,
  onDeleteQuote,
  onChangeDataSource,
}: QuoteHistoryDataGridProps) {
  // Get decimal precision based on asset kind
  const decimalPrecision = getDecimalPrecision(assetKind);

  // Convert quotes to local entries with rounding
  const initialEntries = useMemo(
    () =>
      data
        .map((quote) => toQuoteEntry(quote, decimalPrecision))
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [data, decimalPrecision],
  );

  const [localEntries, setLocalEntries] = useState<QuoteEntry[]>(initialEntries);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Sync with external data changes
  useMemo(() => {
    setLocalEntries(initialEntries);
    setDirtyIds(new Set());
    setDeletedIds(new Set());
  }, [initialEntries]);

  // Track if there are unsaved changes
  const hasUnsavedChanges = dirtyIds.size > 0 || deletedIds.size > 0;

  // Column definitions
  const columnHelper = createColumnHelper<QuoteEntry>();

  // Calculate step value for number inputs based on precision
  const stepValue = Math.pow(10, -decimalPrecision);

  const columns = useMemo(
    () => [
      columnHelper.accessor("date", {
        header: "Date",
        size: 140,
        meta: { cell: { variant: "date-input" } },
      }),
      columnHelper.accessor("open", {
        header: "Open",
        size: 120,
        meta: { cell: { variant: "number", min: 0, step: stepValue } },
      }),
      columnHelper.accessor("high", {
        header: "High",
        size: 120,
        meta: { cell: { variant: "number", min: 0, step: stepValue } },
      }),
      columnHelper.accessor("low", {
        header: "Low",
        size: 120,
        meta: { cell: { variant: "number", min: 0, step: stepValue } },
      }),
      columnHelper.accessor("close", {
        header: "Close",
        size: 120,
        meta: { cell: { variant: "number", min: 0, step: stepValue } },
      }),
      columnHelper.accessor("volume", {
        header: "Volume",
        size: 120,
        meta: { cell: { variant: "number", min: 0 } },
      }),
    ],
    [columnHelper, stepValue],
  );

  // Handle data changes from the grid
  const onDataChange = useCallback((nextData: QuoteEntry[]) => {
    setLocalEntries((prev) => {
      const prevById = new Map(prev.map((e) => [e.id, e]));
      const changedIds: string[] = [];

      const updated = nextData.map((entry) => {
        const previous = prevById.get(entry.id);
        // Normalize date (DateCell returns string, we need Date)
        const normalizedEntry = {
          ...entry,
          date: normalizeDate(entry.date),
        };

        if (!previous) {
          changedIds.push(entry.id);
          return normalizedEntry;
        }

        // Check if any field changed
        const dateChanged = normalizedEntry.date.getTime() !== previous.date.getTime();
        const openChanged = entry.open !== previous.open;
        const highChanged = entry.high !== previous.high;
        const lowChanged = entry.low !== previous.low;
        const closeChanged = entry.close !== previous.close;
        const volumeChanged = entry.volume !== previous.volume;

        if (dateChanged || openChanged || highChanged || lowChanged || closeChanged || volumeChanged) {
          changedIds.push(entry.id);
          return normalizedEntry;
        }

        return previous;
      });

      if (changedIds.length > 0) {
        setDirtyIds((prev) => {
          const next = new Set(prev);
          changedIds.forEach((id) => next.add(id));
          return next;
        });
      }

      return updated;
    });
  }, []);

  // Add a new row
  const onRowAdd = useCallback(() => {
    const draft = createDraftEntry(currency);
    setLocalEntries((prev) => [draft, ...prev]);
    setDirtyIds((prev) => new Set(prev).add(draft.id));
    return { rowIndex: 0, columnId: "date" };
  }, [currency]);

  // Add multiple rows
  const onRowsAdd = useCallback(
    (count: number) => {
      if (count <= 0) return;
      const drafts = Array.from({ length: count }, () => createDraftEntry(currency));
      setLocalEntries((prev) => [...drafts, ...prev]);
      setDirtyIds((prev) => {
        const next = new Set(prev);
        drafts.forEach((d) => next.add(d.id));
        return next;
      });
    },
    [currency],
  );

  // Delete rows
  const onRowsDelete = useCallback((rowsToDelete: QuoteEntry[]) => {
    if (rowsToDelete.length === 0) return;

    const newIds = rowsToDelete.filter((r) => r.isNew).map((r) => r.id);
    const existingIds = rowsToDelete.filter((r) => !r.isNew).map((r) => r.id);

    // Remove new entries immediately
    if (newIds.length > 0) {
      setLocalEntries((prev) => prev.filter((e) => !newIds.includes(e.id)));
      setDirtyIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.delete(id));
        return next;
      });
    }

    // Mark existing entries for deletion
    if (existingIds.length > 0) {
      setDeletedIds((prev) => {
        const next = new Set(prev);
        existingIds.forEach((id) => next.add(id));
        return next;
      });
      setLocalEntries((prev) => prev.filter((e) => !existingIds.includes(e.id)));
    }
  }, []);

  // Initialize data grid
  const dataGrid = useDataGrid<QuoteEntry>({
    data: localEntries,
    columns,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    enableMultiRowSelection: true,
    enableSorting: true,
    enableSearch: true,
    enablePaste: true,
    onDataChange,
    onRowAdd,
    onRowsAdd,
    onRowsDelete,
    initialState: {
      sorting: [{ id: "date", desc: true }],
    },
  });

  const selectedRowCount = dataGrid.table.getSelectedRowModel().rows.length;

  // Delete selected rows
  const handleDeleteSelected = useCallback(() => {
    const selected = dataGrid.table.getSelectedRowModel().rows;
    if (selected.length === 0) return;
    onRowsDelete(selected.map((row) => row.original));
    dataGrid.table.resetRowSelection();
  }, [dataGrid.table, onRowsDelete]);

  // Save all changes
  const handleSave = useCallback(() => {
    // Save dirty entries
    for (const entry of localEntries) {
      if (dirtyIds.has(entry.id)) {
        const quote = toQuote(entry, symbol);
        onSaveQuote(quote);
      }
    }

    // Delete marked entries
    for (const id of deletedIds) {
      if (!id.startsWith("temp-")) {
        onDeleteQuote(id);
      }
    }

    // Reset state
    setDirtyIds(new Set());
    setDeletedIds(new Set());
  }, [localEntries, dirtyIds, deletedIds, symbol, onSaveQuote, onDeleteQuote]);

  // Cancel changes
  const handleCancel = useCallback(() => {
    setLocalEntries(initialEntries);
    setDirtyIds(new Set());
    setDeletedIds(new Set());
    dataGrid.table.resetRowSelection();
  }, [initialEntries, dataGrid.table]);

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      <QuoteHistoryToolbar
        selectedRowCount={selectedRowCount}
        hasUnsavedChanges={hasUnsavedChanges}
        dirtyCount={dirtyIds.size}
        deletedCount={deletedIds.size}
        isManualDataSource={isManualDataSource}
        onAddRow={() => dataGrid.onRowAdd?.()}
        onDeleteSelected={handleDeleteSelected}
        onSave={handleSave}
        onCancel={handleCancel}
        onChangeDataSource={onChangeDataSource}
      />

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        <DataGrid {...dataGrid} stretchColumns height="calc(100vh - 340px)" />
      </div>
    </div>
  );
}

export default QuoteHistoryDataGrid;
