import { toast } from "@/components/ui/use-toast";
import {
  calculateActivityValue,
  isCashActivity,
  isIncomeActivity,
} from "@/lib/activity-utils";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import type {
  Account,
  ActivityBulkMutationRequest,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
} from "@/lib/types";
import {
  formatDateTimeLocal,
  parseDecimalInput,
  parseLocalDateTime,
  roundDecimal,
  toPayloadNumber,
} from "@/lib/utils";
import { useAssets } from "@/pages/asset/hooks/use-assets";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  Button,
  Checkbox,
  DataGrid,
  Icons,
  useDataGrid,
  worldCurrencies,
} from "@wealthfolio/ui";
import { useCallback, useMemo } from "react";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import {
  generateTempActivityId,
  useActivityGridState,
  type LocalTransaction,
} from "../activity-datagrid/use-activity-grid-state";
import { ActivityOperations } from "../activity-operations";

interface ActivityDataGridProps {
  accounts: Account[];
  activities: ActivityDetails[];
  onRefetch: () => Promise<unknown>;
  onEditActivity: (activity: ActivityDetails) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

const resolveAssetIdForTransaction = (
  transaction: LocalTransaction,
  fallbackCurrency: string,
): string | undefined => {
  const existingAssetId = transaction.assetId?.trim() || transaction.assetSymbol?.trim();
  if (existingAssetId) {
    return existingAssetId;
  }

  if (isCashActivity(transaction.activityType)) {
    const currency = (transaction.currency || transaction.accountCurrency || fallbackCurrency)
      .toUpperCase()
      .trim();
    if (currency.length > 0) {
      return `$CASH-${currency}`;
    }
  }

  return undefined;
};

const createDraftTransaction = (
  accounts: Account[],
  fallbackCurrency: string,
): LocalTransaction => {
  const defaultAccount = accounts.find((account) => account.isActive) ?? accounts[0];
  const now = new Date();

  return {
    id: generateTempActivityId(),
    activityType: ActivityType.BUY,
    date: now,
    quantity: 0,
    unitPrice: 0,
    amount: 0,
    fee: 0,
    currency: defaultAccount?.currency ?? fallbackCurrency,
    isDraft: true,
    comment: "",
    createdAt: now,
    assetId: "",
    updatedAt: now,
    accountId: defaultAccount?.id ?? "",
    accountName: defaultAccount?.name ?? "",
    accountCurrency: defaultAccount?.currency ?? fallbackCurrency,
    assetSymbol: "",
    assetName: "",
    assetDataSource: undefined,
    subRows: undefined,
    isNew: true,
  };
};

function applyTransactionUpdate(params: {
  transaction: LocalTransaction;
  field: keyof LocalTransaction;
  value: unknown;
  accountLookup: Map<string, Account>;
  assetCurrencyLookup: Map<string, string>;
  fallbackCurrency: string;
  resolveTransactionCurrency: (transaction: LocalTransaction, options?: { includeFallback?: boolean }) => string | undefined;
}): LocalTransaction {
  const {
    transaction,
    field,
    value,
    accountLookup,
    assetCurrencyLookup,
    fallbackCurrency,
    resolveTransactionCurrency,
  } = params;

  const updated: LocalTransaction = { ...transaction };

  const applyCashDefaults = () => {
    if (!isCashActivity(updated.activityType)) {
      return;
    }
    const derivedCurrency = resolveTransactionCurrency(updated) ?? fallbackCurrency;
    const cashSymbol = `$CASH-${derivedCurrency.toUpperCase()}`;
    updated.assetSymbol = cashSymbol;
    updated.assetId = cashSymbol;
    updated.quantity = 0;
    updated.unitPrice = 0;
  };

  const applySplitDefaults = () => {
    if (updated.activityType !== ActivityType.SPLIT) {
      return;
    }
    updated.quantity = 0;
    updated.unitPrice = 0;
  };

  if (field === "date") {
    if (typeof value === "string") {
      updated.date = parseLocalDateTime(value);
    } else if (value instanceof Date) {
      updated.date = value;
    }
  } else if (field === "quantity") {
    updated.quantity = parseDecimalInput(value as string | number);
    applySplitDefaults();
  } else if (field === "unitPrice") {
    updated.unitPrice = parseDecimalInput(value as string | number);
    if (isCashActivity(updated.activityType) || isIncomeActivity(updated.activityType)) {
      updated.amount = updated.unitPrice;
    }
    applySplitDefaults();
  } else if (field === "amount") {
    updated.amount = parseDecimalInput(value as string | number);
  } else if (field === "fee") {
    updated.fee = parseDecimalInput(value as string | number);
  } else if (field === "assetSymbol") {
    const upper = (typeof value === "string" ? value : "").trim().toUpperCase();
    updated.assetSymbol = upper;
    updated.assetId = upper;

    const assetKey = (updated.assetId ?? updated.assetSymbol ?? "").trim().toUpperCase();
    const assetCurrency = assetCurrencyLookup.get(assetKey);
    if (assetCurrency) {
      updated.currency = assetCurrency;
    }
  } else if (field === "activityType") {
    updated.activityType = value as ActivityType;
    applyCashDefaults();
    applySplitDefaults();
  } else if (field === "accountId") {
    updated.accountId = typeof value === "string" ? value : "";
    const account = accountLookup.get(updated.accountId);
    if (account) {
      updated.accountName = account.name;
      updated.accountCurrency = account.currency;
      updated.currency = account.currency;
    }
    applyCashDefaults();
    applySplitDefaults();
  } else if (field === "currency") {
    updated.currency = typeof value === "string" ? value : updated.currency;
    applyCashDefaults();
    applySplitDefaults();
  } else if (field === "comment") {
    updated.comment = typeof value === "string" ? value : "";
  }

  updated.updatedAt = new Date();

  return updated;
}

export function ActivityDataGrid({
  accounts,
  activities,
  onRefetch,
  onEditActivity,
  sorting,
  onSortingChange,
}: ActivityDataGridProps) {
  const {
    localTransactions,
    setLocalTransactions,
    dirtyTransactionIds,
    setDirtyTransactionIds,
    pendingDeleteIds,
    setPendingDeleteIds,
    hasUnsavedChanges,
  } = useActivityGridState(activities);

  const { saveActivitiesMutation } = useActivityMutations();
  const { assets } = useAssets();

  const fallbackCurrency = useMemo(() => {
    const defaultAccount = accounts.find((account) => account.isDefault);
    if (defaultAccount?.currency) {
      return defaultAccount.currency;
    }
    const activeAccount = accounts.find((account) => account.isActive);
    if (activeAccount?.currency) {
      return activeAccount.currency;
    }
    return accounts[0]?.currency ?? "USD";
  }, [accounts]);

  const accountLookup = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const assetCurrencyLookup = useMemo(() => {
    const entries = new Map<string, string>();

    assets.forEach((asset) => {
      if (!asset.currency) {
        return;
      }
      const symbolKey = asset.symbol?.trim().toUpperCase();
      const idKey = asset.id?.trim().toUpperCase();

      if (symbolKey) {
        entries.set(symbolKey, asset.currency);
      }
      if (idKey) {
        entries.set(idKey, asset.currency);
      }
    });

    return entries;
  }, [assets]);

  const resolveTransactionCurrency = useCallback(
    (
      transaction: LocalTransaction,
      options: { includeFallback?: boolean } = { includeFallback: true },
    ): string | undefined => {
      const assetKey = (transaction.assetId ?? transaction.assetSymbol ?? "").trim().toUpperCase();
      const isCashAsset = assetKey.startsWith("$CASH-");
      const cashCurrency = isCashAsset ? assetKey.replace("$CASH-", "") : undefined;
      const assetCurrency = cashCurrency ?? assetCurrencyLookup.get(assetKey);

      if (transaction.currency) {
        return transaction.currency;
      }

      if (assetCurrency) {
        return assetCurrency;
      }

      if (options.includeFallback !== false) {
        return transaction.accountCurrency ?? fallbackCurrency;
      }

      return undefined;
    },
    [assetCurrencyLookup, fallbackCurrency],
  );

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
      if (!idsToResolve.has(transaction.id)) {
        return;
      }
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

  const activityTypeOptions = useMemo(
    () =>
      (Object.values(ActivityType) as ActivityType[]).map((type) => ({
        value: type,
        label: ActivityTypeNames[type],
      })),
    [],
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    [accounts],
  );

  const localCurrenciesKey = useMemo(() => {
    const currencies = new Set<string>();
    localTransactions.forEach((transaction) => {
      if (transaction.currency) {
        currencies.add(transaction.currency);
      }
    });

    return Array.from(currencies).sort().join("|");
  }, [localTransactions]);

  const currencyOptions = useMemo(() => {
    const entries = new Map<string, string>();

    worldCurrencies.forEach(({ value, label }) => {
      entries.set(value, label);
    });

    accounts.forEach((account) => {
      if (account.currency) {
        entries.set(account.currency, entries.get(account.currency) ?? account.currency);
      }
    });

    if (localCurrenciesKey) {
      localCurrenciesKey.split("|").forEach((currency) => {
        entries.set(currency, entries.get(currency) ?? currency);
      });
    }

    return Array.from(entries.entries()).map(([value]) => ({
      value,
      label: value,
    }));
  }, [accounts, localCurrenciesKey]);

  const columns = useMemo<ColumnDef<LocalTransaction>[]>(() => {
    return [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex h-full items-center justify-center">
            <Checkbox
              checked={table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && "indeterminate")}
              onCheckedChange={(checked) => table.toggleAllRowsSelected(Boolean(checked))}
              aria-label="Select all rows"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex h-full items-center justify-center">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
              aria-label="Select row"
            />
          </div>
        ),
        size: 44,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
      },
      {
        accessorKey: "activityType",
        header: "Type",
        size: 170,
        meta: {
          label: "Type",
          cell: { variant: "select", options: activityTypeOptions },
        },
      },
      {
        id: "date",
        header: "Date & Time",
        size: 180,
        accessorFn: (row) => formatDateTimeLocal(row.date),
        meta: {
          label: "Date & Time",
          cell: { variant: "short-text" },
        },
      },
      {
        accessorKey: "assetSymbol",
        header: "Symbol",
        size: 140,
        meta: {
          label: "Symbol",
          cell: { variant: "short-text" },
        },
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        size: 120,
        meta: {
          label: "Quantity",
          cell: { variant: "number", step: 0.000001 },
        },
      },
      {
        accessorKey: "unitPrice",
        header: "Unit Price",
        size: 120,
        meta: {
          label: "Unit Price",
          cell: { variant: "number", step: 0.000001 },
        },
      },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        meta: {
          label: "Amount",
          cell: { variant: "number", step: 0.000001 },
        },
      },
      {
        accessorKey: "fee",
        header: "Fee",
        size: 100,
        meta: {
          label: "Fee",
          cell: { variant: "number", step: 0.000001 },
        },
      },
      {
        accessorKey: "accountId",
        header: "Account",
        size: 180,
        meta: {
          label: "Account",
          cell: { variant: "select", options: accountOptions },
        },
      },
      {
        accessorKey: "currency",
        header: "Currency",
        size: 110,
        meta: {
          label: "Currency",
          cell: { variant: "select", options: currencyOptions },
        },
      },
      {
        accessorKey: "comment",
        header: "Comment",
        size: 260,
        meta: {
          label: "Comment",
          cell: { variant: "long-text" },
        },
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => (
          <div className="flex h-full items-center justify-center">
            <ActivityOperations
              activity={row.original}
              onEdit={onEditActivity}
              onDuplicate={(activity) => {
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
                setDirtyTransactionIds((prev) => new Set(prev).add(duplicated.id));
              }}
              onDelete={(activity) => {
                const id = activity.id;
                const source = activity as LocalTransaction;
                setLocalTransactions((prev) => prev.filter((t) => t.id !== id));
                setDirtyTransactionIds((prev) => {
                  const next = new Set(prev);
                  next.delete(id);
                  return next;
                });
                setPendingDeleteIds((prev) => {
                  const next = new Set(prev);
                  if (!source.isNew) {
                    next.add(id);
                  }
                  return next;
                });
              }}
            />
          </div>
        ),
        size: 64,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
      },
    ];
  }, [
    accountOptions,
    activityTypeOptions,
    currencyOptions,
    onEditActivity,
    setDirtyTransactionIds,
    setLocalTransactions,
    setPendingDeleteIds,
  ]);

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

          const fields: (keyof LocalTransaction)[] = [
            "activityType",
            "date",
            "assetSymbol",
            "quantity",
            "unitPrice",
            "amount",
            "fee",
            "accountId",
            "currency",
            "comment",
          ];

          for (const field of fields) {
            if (!Object.is((previous as Record<string, unknown>)[field], (nextRow as Record<string, unknown>)[field])) {
              updated = applyTransactionUpdate({
                transaction: updated,
                field,
                value: (nextRow as Record<string, unknown>)[field],
                accountLookup,
                assetCurrencyLookup,
                fallbackCurrency,
                resolveTransactionCurrency,
              });
              changed = true;
            }
          }

          if (!changed) {
            return previous;
          }

          changedIds.push(nextRow.id);
          return updated;
        });

        if (changedIds.length > 0) {
          setDirtyTransactionIds((current) => {
            const next = new Set(current);
            changedIds.forEach((id) => next.add(id));
            return next;
          });
        }

        return normalized;
      });
    },
    [
      accountLookup,
      assetCurrencyLookup,
      fallbackCurrency,
      resolveTransactionCurrency,
      setDirtyTransactionIds,
      setLocalTransactions,
    ],
  );

  const onRowAdd = useCallback(() => {
    const now = new Date();
    const draft = {
      ...createDraftTransaction(accounts, fallbackCurrency),
      date: now,
      createdAt: now,
      updatedAt: now,
    };

    setLocalTransactions((prev) => [...prev, draft]);
    setDirtyTransactionIds((prev) => new Set(prev).add(draft.id));

    return { columnId: "activityType" };
  }, [accounts, fallbackCurrency, setDirtyTransactionIds, setLocalTransactions]);

  const onRowsAdd = useCallback(
    (count: number) => {
      if (count <= 0) return;
      const now = new Date();
      const drafts = Array.from({ length: count }, () => ({
        ...createDraftTransaction(accounts, fallbackCurrency),
        date: now,
        createdAt: now,
        updatedAt: now,
      }));

      setLocalTransactions((prev) => [...prev, ...drafts]);
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        drafts.forEach((draft) => next.add(draft.id));
        return next;
      });
    },
    [accounts, fallbackCurrency, setDirtyTransactionIds, setLocalTransactions],
  );

  const onRowsDelete = useCallback(
    async (rowsToDelete: LocalTransaction[]) => {
      if (rowsToDelete.length === 0) return;

      const idsToDelete = rowsToDelete.map((row) => row.id);
      const deletedRows = rowsToDelete.filter((row) => !row.isNew);

      setLocalTransactions((prev) => prev.filter((t) => !idsToDelete.includes(t.id)));
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      if (deletedRows.length > 0) {
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          deletedRows.forEach((row) => next.add(row.id));
          return next;
        });
      }
    },
    [setDirtyTransactionIds, setLocalTransactions, setPendingDeleteIds],
  );

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
      columnPinning: { left: ["select"], right: ["actions"] },
    },
  });

  const selectedRowCount = dataGrid.table.getSelectedRowModel().rows.length;

  const deleteSelectedRows = useCallback(() => {
    const selected = dataGrid.table.getSelectedRowModel().rows;
    if (selected.length === 0) return;

    const selectedTransactions = selected.map((row) => row.original);
    onRowsDelete(selectedTransactions);
    dataGrid.table.resetRowSelection();
  }, [dataGrid.table, onRowsDelete]);

  const handleSaveChanges = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    const deleteIds = Array.from(pendingDeleteIds);
    const dirtyTransactions = localTransactions.filter((transaction) =>
      dirtyTransactionIds.has(transaction.id),
    );

    const creates: ActivityCreate[] = [];
    const updates: ActivityUpdate[] = [];

    dirtyTransactions.forEach((transaction) => {
      const resolvedCurrency =
        resolveTransactionCurrency(transaction, { includeFallback: false }) ??
        dirtyCurrencyLookup.get(transaction.id);
      const currencyFallback = transaction.accountCurrency ?? fallbackCurrency;
      const assetKey = (transaction.assetId ?? transaction.assetSymbol ?? "").toUpperCase();
      const currencyForPayload =
        resolvedCurrency ?? (!assetCurrencyLookup.has(assetKey) ? currencyFallback : undefined);

      const payload: ActivityCreate = {
        id: transaction.id,
        accountId: transaction.accountId,
        activityType: transaction.activityType,
        activityDate:
          transaction.date instanceof Date
            ? transaction.date.toISOString()
            : new Date(transaction.date).toISOString(),
        assetId: resolveAssetIdForTransaction(transaction, fallbackCurrency),
        assetDataSource: transaction.assetDataSource,
        quantity: toPayloadNumber(transaction.quantity),
        unitPrice: toPayloadNumber(transaction.unitPrice),
        amount: toPayloadNumber(transaction.amount),
        currency: currencyForPayload,
        fee: toPayloadNumber(transaction.fee),
        isDraft: false,
        comment: transaction.comment ?? undefined,
      };

      if (!payload.assetId && isCashActivity(payload.activityType as ActivityType)) {
        const cashCurrency = (resolvedCurrency ?? currencyFallback).toUpperCase().trim();
        payload.assetId = `$CASH-${cashCurrency}`;
      }

      if (payload.activityType === ActivityType.SPLIT) {
        delete payload.quantity;
        delete payload.unitPrice;
      }

      if (transaction.isNew) {
        creates.push(payload);
      } else {
        updates.push(payload as ActivityUpdate);
      }
    });

    const request: ActivityBulkMutationRequest = {
      creates,
      updates,
      deleteIds,
    };

    try {
      const result = await saveActivitiesMutation.mutateAsync(request);
      const createdMappings = new Map(
        (result.createdMappings ?? [])
          .filter((mapping) => mapping.tempId && mapping.activityId)
          .map((mapping) => [mapping.tempId!, mapping.activityId]),
      );

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

      setDirtyTransactionIds(new Set());
      setPendingDeleteIds(new Set());
      dataGrid.table.resetRowSelection();

      toast({
        title: "Activities saved",
        description: "Your pending changes are now saved.",
        variant: "success",
      });

      await onRefetch();
    } catch {
      // Error surface handled by the mutation hook.
    }
  }, [
    dirtyTransactionIds,
    hasUnsavedChanges,
    localTransactions,
    pendingDeleteIds,
    assetCurrencyLookup,
    fallbackCurrency,
    onRefetch,
    saveActivitiesMutation,
    resolveTransactionCurrency,
    dirtyCurrencyLookup,
    setDirtyTransactionIds,
    setLocalTransactions,
    setPendingDeleteIds,
    dataGrid.table,
  ]);

  const handleCancelChanges = useCallback(() => {
    setDirtyTransactionIds(new Set());
    setPendingDeleteIds(new Set());
    dataGrid.table.resetRowSelection();
    setLocalTransactions((prev) => prev.filter((transaction) => !transaction.isNew));
    onRefetch();
    toast({
      title: "Changes discarded",
      description: "Unsaved edits and drafts have been cleared.",
      variant: "default",
    });
  }, [onRefetch, setDirtyTransactionIds, setLocalTransactions, setPendingDeleteIds, dataGrid.table]);

  const changesCounts = useMemo(() => {
    const newCount = localTransactions.filter(
      (t) => t.isNew && dirtyTransactionIds.has(t.id),
    ).length;
    const updatedCount = localTransactions.filter(
      (t) => !t.isNew && dirtyTransactionIds.has(t.id),
    ).length;
    const deletedCount = pendingDeleteIds.size;

    return { newCount, updatedCount, deletedCount };
  }, [localTransactions, dirtyTransactionIds, pendingDeleteIds]);

  const toolbarTotalValue = useMemo(() => {
    const totalValue = localTransactions.reduce((sum, transaction) => {
      const currency = resolveTransactionCurrency(transaction) ?? fallbackCurrency;
      return sum + calculateActivityValue(transaction, currency);
    }, 0);

    return roundDecimal(totalValue, 6);
  }, [fallbackCurrency, localTransactions, resolveTransactionCurrency]);

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          {selectedRowCount > 0 && (
            <span className="font-medium">
              {selectedRowCount} row{selectedRowCount === 1 ? "" : "s"} selected
            </span>
          )}
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary">
                {dirtyTransactionIds.size + pendingDeleteIds.size} pending change
                {dirtyTransactionIds.size + pendingDeleteIds.size === 1 ? "" : "s"}
              </span>
              <div className="h-3.5 w-px bg-border" />
              <div className="flex items-center gap-4">
                {changesCounts.newCount > 0 && (
                  <span className="flex items-center gap-1 text-success">
                    <Icons.PlusCircle className="h-3 w-3" />
                    <span className="font-medium">{changesCounts.newCount}</span>
                  </span>
                )}
                {changesCounts.updatedCount > 0 && (
                  <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400">
                    <Icons.Pencil className="h-3 w-3" />
                    <span className="font-medium">{changesCounts.updatedCount}</span>
                  </span>
                )}
                {changesCounts.deletedCount > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <Icons.Trash className="h-3 w-3" />
                    <span className="font-medium">{changesCounts.deletedCount}</span>
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="hidden items-center gap-1.5 md:flex">
            <div className="h-3.5 w-px bg-border" />
            <span>Total:</span>
            <span className="font-medium">{toolbarTotalValue}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            onClick={() => dataGrid.onRowAdd?.()}
            variant="outline"
            size="xs"
            className="shrink-0 rounded-md"
            title="Add transaction"
            aria-label="Add transaction"
          >
            <Icons.Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </Button>

          {selectedRowCount > 0 && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                onClick={deleteSelectedRows}
                size="xs"
                variant="destructive"
                className="shrink-0 rounded-md text-xs"
                title="Delete selected"
                aria-label="Delete selected"
                disabled={saveActivitiesMutation.isPending}
              >
                <Icons.Trash className="h-3.5 w-3.5" />
                <span>Delete</span>
              </Button>
            </>
          )}

          {hasUnsavedChanges && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                onClick={handleSaveChanges}
                size="xs"
                className="shrink-0 rounded-md text-xs"
                title="Save changes"
                aria-label="Save changes"
                disabled={saveActivitiesMutation.isPending}
              >
                {saveActivitiesMutation.isPending ? (
                  <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icons.Save className="h-3.5 w-3.5" />
                )}
                <span>Save</span>
              </Button>

              <Button
                onClick={handleCancelChanges}
                size="xs"
                variant="outline"
                className="shrink-0 rounded-md text-xs"
                title="Discard changes"
                aria-label="Discard changes"
                disabled={saveActivitiesMutation.isPending}
              >
                <Icons.Undo className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-[320px] flex-1 overflow-hidden rounded-lg border bg-background">
        <DataGrid {...dataGrid} height={600} stretchColumns />
      </div>
    </div>
  );
}
