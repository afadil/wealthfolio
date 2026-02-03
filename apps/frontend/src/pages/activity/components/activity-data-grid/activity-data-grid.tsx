import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account, ActivityDetails } from "@/lib/types";
import { useAssets } from "@/pages/asset/hooks/use-assets";
import type { SortingState, Updater } from "@tanstack/react-table";
import { DataGrid, useDataGrid, type SymbolSearchResult } from "@wealthfolio/ui";
import { useCallback, useMemo, useState } from "react";
import { CreateCustomAssetDialog } from "@/components/create-custom-asset-dialog";
import { ActivityDataGridPagination } from "./activity-data-grid-pagination";
import { ActivityDataGridToolbar } from "./activity-data-grid-toolbar";
import {
  applyTransactionUpdate,
  createCurrencyResolver,
  createDraftTransaction,
  PINNED_COLUMNS,
  TRACKED_FIELDS,
  valuesAreEqual,
} from "./activity-utils";
import { isPendingReview, toLocalTransaction, type LocalTransaction } from "./types";
import { useActivityColumns } from "./use-activity-columns";
import { generateTempActivityId, useActivityGridState } from "./use-activity-grid-state";
import { useSaveActivities } from "./use-save-activities";

interface ActivityDataGridProps {
  accounts: Account[];
  activities: ActivityDetails[];
  onRefetch: () => Promise<unknown>;
  onEditActivity: (activity: ActivityDetails) => void;
  sorting: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
  // Pagination props
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  totalRowCount: number;
  isFetching: boolean;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/**
 * Activity data grid component with inline editing, bulk operations, and optimistic updates
 */
export function ActivityDataGrid({
  accounts,
  activities,
  onRefetch,
  onEditActivity,
  sorting,
  onSortingChange,
  pageIndex,
  pageSize,
  pageCount,
  totalRowCount,
  isFetching,
  onPageChange,
  onPageSizeChange,
}: ActivityDataGridProps) {
  // State management
  const {
    localTransactions,
    setLocalTransactions,
    dirtyTransactionIds,
    pendingDeleteIds,
    hasUnsavedChanges,
    changesSummary,
    markDirtyBatch,
    markForDeletion,
    markForDeletionBatch,
    resetChangeState,
  } = useActivityGridState({ activities });

  const { assets } = useAssets();
  const { settings } = useSettingsContext();

  // Derived values - use app base currency as the ultimate fallback
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const fallbackCurrency = baseCurrency;

  const accountLookup = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const assetCurrencyLookup = useMemo(() => {
    const entries = new Map<string, string>();
    assets.forEach((asset) => {
      if (!asset.currency) return;
      const symbolKey = asset.symbol?.trim().toUpperCase();
      const idKey = asset.id?.trim().toUpperCase();
      if (symbolKey) entries.set(symbolKey, asset.currency);
      if (idKey) entries.set(idKey, asset.currency);
    });
    return entries;
  }, [assets]);

  const resolveTransactionCurrency = useMemo(
    () => createCurrencyResolver(assetCurrencyLookup, fallbackCurrency),
    [assetCurrencyLookup, fallbackCurrency],
  );

  // Currency lookup for dirty transactions (single pass)
  const dirtyCurrencyLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const transaction of localTransactions) {
      const isDirtyOrNew = dirtyTransactionIds.has(transaction.id) || transaction.isNew;
      if (!isDirtyOrNew) continue;

      const resolved =
        transaction.currency ??
        resolveTransactionCurrency(transaction) ??
        transaction.accountCurrency ??
        fallbackCurrency;
      if (resolved) {
        lookup.set(transaction.id, resolved);
      }
    }
    return lookup;
  }, [dirtyTransactionIds, fallbackCurrency, localTransactions, resolveTransactionCurrency]);

  // Row operations
  const handleDuplicate = useCallback(
    (activity: ActivityDetails) => {
      const now = new Date();
      const source = toLocalTransaction(activity);
      const duplicated: LocalTransaction = {
        ...source,
        id: generateTempActivityId(),
        date: now,
        createdAt: now,
        updatedAt: now,
        isNew: true,
      };
      setLocalTransactions((prev) => [duplicated, ...prev]);
      markDirtyBatch([duplicated.id]);
    },
    [markDirtyBatch, setLocalTransactions],
  );

  const handleDelete = useCallback(
    (activity: ActivityDetails) => {
      const source = toLocalTransaction(activity);
      markForDeletion(activity.id, !!source.isNew);
    },
    [markForDeletion],
  );

  // Custom asset dialog state
  const [customAssetDialog, setCustomAssetDialog] = useState<{
    open: boolean;
    rowIndex: number;
    symbol: string;
  }>({ open: false, rowIndex: -1, symbol: "" });

  // Handle symbol selection to capture exchangeMic, currency, and asset metadata from search result
  const handleSymbolSelect = useCallback(
    (rowIndex: number, result: SymbolSearchResult) => {
      setLocalTransactions((prev) => {
        const updated = [...prev];
        if (updated[rowIndex]) {
          const row = updated[rowIndex];
          // Currency fallback: search result (from exchange) → account → base
          const currency = result.currency ?? row.accountCurrency ?? fallbackCurrency;
          updated[rowIndex] = {
            ...row,
            exchangeMic: result.exchangeMic,
            assetPricingMode: result.dataSource === "MANUAL" ? "MANUAL" : "MARKET",
            currency,
            // Capture asset metadata for custom assets
            pendingAssetName: result.longName,
            pendingAssetKind: result.assetKind,
          };
        }
        return updated;
      });
    },
    [setLocalTransactions, fallbackCurrency],
  );

  // Handle request to create a custom asset - opens the dialog
  const handleCreateCustomAsset = useCallback((rowIndex: number, symbol: string) => {
    setCustomAssetDialog({ open: true, rowIndex, symbol });
  }, []);

  // Handle custom asset created from dialog
  const handleCustomAssetCreated = useCallback(
    (result: SymbolSearchResult) => {
      const { rowIndex } = customAssetDialog;
      if (rowIndex < 0) return;

      // Update the transaction with the symbol and asset metadata
      setLocalTransactions((prev) => {
        const updated = [...prev];
        if (updated[rowIndex]) {
          const row = updated[rowIndex];
          const currency = result.currency ?? row.accountCurrency ?? fallbackCurrency;
          updated[rowIndex] = {
            ...row,
            assetSymbol: result.symbol,
            exchangeMic: result.exchangeMic,
            assetPricingMode: "MANUAL",
            currency,
            pendingAssetName: result.longName,
            pendingAssetKind: result.assetKind,
          };
        }
        return updated;
      });

      // Mark the transaction as dirty
      const transaction = localTransactions[rowIndex];
      if (transaction) {
        markDirtyBatch([transaction.id]);
      }

      setCustomAssetDialog({ open: false, rowIndex: -1, symbol: "" });
    },
    [customAssetDialog, setLocalTransactions, fallbackCurrency, localTransactions, markDirtyBatch],
  );

  // Column definitions
  const columns = useActivityColumns({
    accounts,
    onEditActivity,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
    onSymbolSelect: handleSymbolSelect,
    onCreateCustomAsset: handleCreateCustomAsset,
  });

  // Data change handler - processes changes from the data grid
  const onDataChange = useCallback(
    (nextData: LocalTransaction[]) => {
      setLocalTransactions((prev) => {
        const prevById = new Map(prev.map((t) => [t.id, t]));
        const changedIds: string[] = [];

        const normalized = nextData.map((nextRow) => {
          const previous = prevById.get(nextRow.id);
          if (!previous) {
            changedIds.push(nextRow.id);
            return nextRow;
          }

          let updated = previous;
          let changed = false;

          for (const field of TRACKED_FIELDS) {
            const prevValue = previous[field];
            const nextValue = nextRow[field];
            if (!valuesAreEqual(field, prevValue, nextValue)) {
              updated = applyTransactionUpdate({
                transaction: updated,
                field,
                value: nextValue,
                accountLookup,
                assetCurrencyLookup,
                fallbackCurrency,
                resolveTransactionCurrency,
              });
              changed = true;
            }
          }

          if (!changed) return previous;
          changedIds.push(nextRow.id);
          return updated;
        });

        if (changedIds.length > 0) {
          markDirtyBatch(changedIds);
        }

        return normalized;
      });
    },
    [
      accountLookup,
      assetCurrencyLookup,
      fallbackCurrency,
      markDirtyBatch,
      resolveTransactionCurrency,
      setLocalTransactions,
    ],
  );

  // Add single row at the top
  const onRowAdd = useCallback(() => {
    const draft = createDraftTransaction(accounts, fallbackCurrency);
    setLocalTransactions((prev) => [draft, ...prev]);
    markDirtyBatch([draft.id]);
    return { rowIndex: 0, columnId: "activityType" };
  }, [accounts, fallbackCurrency, markDirtyBatch, setLocalTransactions]);

  // Add multiple rows at the top
  const onRowsAdd = useCallback(
    (count: number) => {
      if (count <= 0) return;
      const drafts = Array.from({ length: count }, () =>
        createDraftTransaction(accounts, fallbackCurrency),
      );
      setLocalTransactions((prev) => [...drafts, ...prev]);
      markDirtyBatch(drafts.map((d) => d.id));
    },
    [accounts, fallbackCurrency, markDirtyBatch, setLocalTransactions],
  );

  // Delete multiple rows
  const onRowsDelete = useCallback(
    (rowsToDelete: LocalTransaction[]) => {
      if (rowsToDelete.length === 0) return;
      markForDeletionBatch(rowsToDelete.map((row) => ({ id: row.id, isNew: !!row.isNew })));
    },
    [markForDeletionBatch],
  );

  // Initialize data grid
  const dataGrid = useDataGrid<LocalTransaction>({
    data: localTransactions,
    columns,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    enableMultiRowSelection: true,
    enableSorting: true,
    enableColumnFilters: true,
    enableSearch: true,
    enablePaste: true,
    onDataChange,
    onRowAdd,
    onRowsAdd,
    onRowsDelete,
    onSortingChange,
    initialState: {
      sorting,
      columnPinning: { left: [...PINNED_COLUMNS.left], right: [...PINNED_COLUMNS.right] },
      columnVisibility: {
        subtype: true,
        isExternal: true,
        activityStatus: false,
      },
    },
  });

  const selectedRows = dataGrid.table.getSelectedRowModel().rows;
  const selectedRowCount = selectedRows.length;

  // Count selected rows that are pending review (needsReview=true and not new)
  const selectedPendingCount = useMemo(
    () => selectedRows.filter((row) => isPendingReview(row.original)).length,
    [selectedRows],
  );

  // Delete selected rows handler
  const deleteSelectedRows = useCallback(() => {
    const selected = dataGrid.table.getSelectedRowModel().rows;
    if (selected.length === 0) return;

    const selectedTransactions = selected.map((row) => row.original);
    onRowsDelete(selectedTransactions);
    dataGrid.table.resetRowSelection();
  }, [dataGrid.table, onRowsDelete]);

  // Approve selected synced activities (mark needsReview=false)
  const approveSelectedRows = useCallback(() => {
    const selected = dataGrid.table.getSelectedRowModel().rows;
    const pendingToApprove = selected
      .filter((row) => isPendingReview(row.original))
      .map((row) => row.original);

    if (pendingToApprove.length === 0) return;

    // Mark all pending activities as approved (needsReview=false) and mark them as dirty
    setLocalTransactions((prev) =>
      prev.map((transaction) => {
        const shouldApprove = pendingToApprove.some((p) => p.id === transaction.id);
        if (shouldApprove) {
          return { ...transaction, needsReview: false };
        }
        return transaction;
      }),
    );

    // Mark them as dirty so they will be saved
    markDirtyBatch(pendingToApprove.map((transaction) => transaction.id));
    dataGrid.table.resetRowSelection();
  }, [dataGrid.table, markDirtyBatch, setLocalTransactions]);

  // Save activities hook with validation and error handling
  const { saveActivities, isSaving } = useSaveActivities({
    localTransactions,
    dirtyTransactionIds,
    pendingDeleteIds,
    resolveTransactionCurrency,
    dirtyCurrencyLookup,
    assetCurrencyLookup,
    fallbackCurrency,
    setLocalTransactions,
    resetChangeState,
    resetRowSelection: () => dataGrid.table.resetRowSelection(),
    onRefetch,
  });

  // Save changes handler
  const handleSaveChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;
    await saveActivities();
  }, [hasUnsavedChanges, saveActivities]);

  // Cancel changes handler
  const handleCancelChanges = useCallback(() => {
    resetChangeState();
    dataGrid.table.resetRowSelection();
    setLocalTransactions((prev) => prev.filter((transaction) => !transaction.isNew));
    onRefetch();
    toast({
      title: "Changes discarded",
      description: "Unsaved edits and drafts have been cleared.",
      variant: "default",
    });
  }, [dataGrid.table, onRefetch, resetChangeState, setLocalTransactions]);

  // Get default currency for custom asset dialog from the row's account
  const dialogDefaultCurrency =
    customAssetDialog.rowIndex >= 0 && localTransactions[customAssetDialog.rowIndex]
      ? (localTransactions[customAssetDialog.rowIndex].accountCurrency ?? fallbackCurrency)
      : fallbackCurrency;

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      <ActivityDataGridToolbar
        selectedRowCount={selectedRowCount}
        selectedPendingCount={selectedPendingCount}
        hasUnsavedChanges={hasUnsavedChanges}
        changesSummary={changesSummary}
        isSaving={isSaving}
        table={dataGrid.table}
        onAddRow={() => dataGrid.onRowAdd?.()}
        onDeleteSelected={deleteSelectedRows}
        onApproveSelected={approveSelectedRows}
        onSave={handleSaveChanges}
        onCancel={handleCancelChanges}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <DataGrid {...dataGrid} stretchColumns height="calc(100vh - 260px)" />
      </div>

      <ActivityDataGridPagination
        pageIndex={pageIndex}
        pageSize={pageSize}
        pageCount={pageCount}
        totalRowCount={totalRowCount}
        isFetching={isFetching}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      <CreateCustomAssetDialog
        open={customAssetDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setCustomAssetDialog({ open: false, rowIndex: -1, symbol: "" });
          }
        }}
        onAssetCreated={handleCustomAssetCreated}
        defaultSymbol={customAssetDialog.symbol}
        defaultCurrency={dialogDefaultCurrency}
      />
    </div>
  );
}
