import { toast } from "@/components/ui/use-toast";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account, ActivityBulkMutationRequest, ActivityDetails } from "@/lib/types";
import { useAssets } from "@/pages/asset/hooks/use-assets";
import type { SortingState, Updater } from "@tanstack/react-table";
import { DataGrid, useDataGrid } from "@wealthfolio/ui";
import { useCallback, useMemo } from "react";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import { ActivityDataGridPagination } from "./activity-data-grid-pagination";
import { ActivityDataGridToolbar } from "./activity-data-grid-toolbar";
import {
  applyTransactionUpdate,
  buildSavePayload,
  createCurrencyResolver,
  createDraftTransaction,
  TRACKED_FIELDS,
  valuesAreEqual,
} from "./activity-utils";
import type { LocalTransaction } from "./types";
import { useActivityColumns } from "./use-activity-columns";
import { generateTempActivityId, useActivityGridState } from "./use-activity-grid-state";

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

  const { saveActivitiesMutation } = useActivityMutations();
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

  // Currency lookup for dirty transactions
  const dirtyCurrencyLookup = useMemo(() => {
    const idsToResolve = new Set<string>();
    localTransactions.forEach((transaction) => {
      if (dirtyTransactionIds.has(transaction.id) || transaction.isNew) {
        idsToResolve.add(transaction.id);
      }
    });

    if (idsToResolve.size === 0) {
      return new Map<string, string>();
    }

    const lookup = new Map<string, string>();
    localTransactions.forEach((transaction) => {
      if (!idsToResolve.has(transaction.id)) return;
      const resolved =
        transaction.currency ??
        resolveTransactionCurrency(transaction) ??
        transaction.accountCurrency ??
        fallbackCurrency;
      if (resolved) {
        lookup.set(transaction.id, resolved);
      }
    });
    return lookup;
  }, [dirtyTransactionIds, fallbackCurrency, localTransactions, resolveTransactionCurrency]);

  // Row operations
  const handleDuplicate = useCallback(
    (activity: ActivityDetails) => {
      const now = new Date();
      const source = activity as LocalTransaction;
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
      const source = activity as LocalTransaction;
      markForDeletion(activity.id, !!source.isNew);
    },
    [markForDeletion],
  );

  // Column definitions
  const columns = useActivityColumns({
    accounts,
    onEditActivity,
    onDuplicate: handleDuplicate,
    onDelete: handleDelete,
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
      columnPinning: { left: ["select", "status", "activityType"], right: ["actions"] },
    },
  });

  const selectedRows = dataGrid.table.getSelectedRowModel().rows;
  const selectedRowCount = selectedRows.length;

  // Count selected rows that are pending (isDraft=true and not new)
  const selectedPendingCount = useMemo(
    () => selectedRows.filter((row) => row.original.isDraft && !row.original.isNew).length,
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

  // Approve selected synced activities (mark isDraft=false)
  const approveSelectedRows = useCallback(() => {
    const selected = dataGrid.table.getSelectedRowModel().rows;
    const pendingToApprove = selected
      .filter((row) => row.original.isDraft && !row.original.isNew)
      .map((row) => row.original);

    if (pendingToApprove.length === 0) return;

    // Mark all pending activities as approved (isDraft=false) and mark them as dirty
    setLocalTransactions((prev) =>
      prev.map((transaction) => {
        const shouldApprove = pendingToApprove.some((p) => p.id === transaction.id);
        if (shouldApprove) {
          return { ...transaction, isDraft: false };
        }
        return transaction;
      }),
    );

    // Mark them as dirty so they will be saved
    markDirtyBatch(pendingToApprove.map((t) => t.id));
    dataGrid.table.resetRowSelection();
  }, [dataGrid.table, markDirtyBatch, setLocalTransactions]);

  // Save changes handler
  const handleSaveChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    const payload = buildSavePayload(
      localTransactions,
      dirtyTransactionIds,
      pendingDeleteIds,
      resolveTransactionCurrency,
      dirtyCurrencyLookup,
      assetCurrencyLookup,
      fallbackCurrency,
    );

    const request: ActivityBulkMutationRequest = {
      creates: payload.creates,
      updates: payload.updates,
      deleteIds: payload.deleteIds,
    };

    try {
      const result = await saveActivitiesMutation.mutateAsync(request);

      // Map temporary IDs to persisted IDs
      const createdMappings = new Map(
        (result.createdMappings ?? [])
          .filter((mapping) => mapping.tempId && mapping.activityId)
          .map((mapping) => [mapping.tempId!, mapping.activityId]),
      );

      // Update local state with persisted IDs
      setLocalTransactions((prev) =>
        prev
          .filter((transaction) => !pendingDeleteIds.has(transaction.id))
          .map((transaction) => {
            if (transaction.isNew) {
              const mappedId = createdMappings.get(transaction.id);
              if (mappedId) {
                return { ...transaction, id: mappedId, isNew: false };
              }
            }
            return transaction;
          }),
      );

      resetChangeState();
      dataGrid.table.resetRowSelection();

      toast({
        title: "Activities saved",
        description: "Your pending changes are now saved.",
        variant: "success",
      });

      await onRefetch();
    } catch {
      // Error handling is done by the mutation hook
    }
  }, [
    assetCurrencyLookup,
    dataGrid.table,
    dirtyCurrencyLookup,
    dirtyTransactionIds,
    fallbackCurrency,
    hasUnsavedChanges,
    localTransactions,
    onRefetch,
    pendingDeleteIds,
    resetChangeState,
    resolveTransactionCurrency,
    saveActivitiesMutation,
    setLocalTransactions,
  ]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      <ActivityDataGridToolbar
        selectedRowCount={selectedRowCount}
        selectedPendingCount={selectedPendingCount}
        hasUnsavedChanges={hasUnsavedChanges}
        changesSummary={changesSummary}
        isSaving={saveActivitiesMutation.isPending}
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
    </div>
  );
}
