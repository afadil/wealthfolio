import { toast } from "@/components/ui/use-toast";
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isIncomeActivity,
} from "@/lib/activity-utils";
import { ActivityType, ActivityTypeNames, DataSource } from "@/lib/constants";
import {
  Account,
  ActivityBulkMutationRequest,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
} from "@/lib/types";
import {
  cn,
  formatDateTimeDisplay,
  formatDateTimeLocal,
  getNumericCellValue,
  parseDecimalInput,
  parseLocalDateTime,
  roundDecimal,
  toFiniteNumberOrUndefined,
  toPayloadNumber,
} from "@/lib/utils";
import { useAssets } from "@/pages/asset/hooks/use-assets";
import type { SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatAmount,
  Icons,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  worldCurrencies,
} from "@wealthfolio/ui";
import type { Dispatch, SetStateAction } from "react";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";
import { EditableCell } from "./editable-cell";
import { SelectCell } from "./select-cell";
import { SymbolAutocompleteCell } from "./symbol-autocomplete-cell";
import {
  generateTempActivityId,
  LocalTransaction,
  useActivityGridState,
} from "./use-activity-grid-state";

type EditableField =
  | "activityType"
  | "date"
  | "assetSymbol"
  | "quantity"
  | "unitPrice"
  | "amount"
  | "fee"
  | "accountId"
  | "currency"
  | "comment";

interface CellCoordinate {
  rowId: string;
  field: EditableField;
}

interface ActivityDatagridProps {
  accounts: Account[];
  activities: ActivityDetails[];
  onRefetch: () => Promise<unknown>;
  onEditActivity: (activity: ActivityDetails) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
}

const editableFields: EditableField[] = [
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

const formatAmountDisplay = (
  value: unknown,
  currency?: string,
  displayCurrency = false,
  fallbackCurrency = "USD",
): string => {
  const numericValue = toFiniteNumberOrUndefined(value);
  if (numericValue === undefined) {
    return "";
  }
  try {
    return formatAmount(
      roundDecimal(numericValue, 6),
      currency ?? fallbackCurrency,
      displayCurrency,
    );
  } catch {
    return "";
  }
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

interface SortableHeaderProps {
  title: string;
  columnId: string;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  className?: string;
}

function SortableHeader({
  title,
  columnId,
  sorting,
  onSortingChange,
  className,
}: SortableHeaderProps) {
  const currentSort = sorting.find((entry) => entry.id === columnId);
  const icon = currentSort ? (
    currentSort.desc ? (
      <Icons.ArrowDown className="ml-2 h-4 w-4" />
    ) : (
      <Icons.ArrowUp className="ml-2 h-4 w-4" />
    )
  ) : null;

  const handleSortingChange = (desc: boolean) => {
    onSortingChange([{ id: columnId, desc }]);
  };

  return (
    <TableHead className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="data-[state=open]:bg-accent h-8 w-full justify-start rounded-sm px-2"
          >
            <span>{title}</span>
            {icon}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => handleSortingChange(false)}>
            <Icons.ArrowUp className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSortingChange(true)}>
            <Icons.ArrowDown className="text-muted-foreground/70 mr-2 h-3.5 w-3.5" />
            Desc
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableHead>
  );
}

export function ActivityDatagrid({
  accounts,
  activities,
  onRefetch,
  onEditActivity,
  sorting,
  onSortingChange,
}: ActivityDatagridProps) {
  const {
    localTransactions,
    setLocalTransactions,
    dirtyTransactionIds,
    setDirtyTransactionIds,
    pendingDeleteIds,
    setPendingDeleteIds,
    hasUnsavedChanges,
  } = useActivityGridState(activities);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedCell, setFocusedCell] = useState<CellCoordinate | null>(null);
  const { saveActivitiesMutation } = useActivityMutations();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  const activityTypeOptions = useMemo(
    () =>
      (Object.values(ActivityType) as ActivityType[]).map((type) => ({
        value: type,
        label: ActivityTypeNames[type],
        searchValue: `${ActivityTypeNames[type]} ${type}`,
      })),
    [],
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
        searchValue: `${account.name} ${account.currency} ${account.id}`,
      })),
    [accounts],
  );

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

    return Array.from(entries.entries()).map(([value, label]) => ({
      value,
      label: value,
      searchValue: label,
    }));
  }, [accounts, localCurrenciesKey]);

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

  const activeSorting = sorting[0] ?? { id: "date", desc: true };

  const sortedTransactions = useMemo(() => {
    const transactions = [...localTransactions];
    const isNewRow = (transaction: LocalTransaction) => Boolean(transaction.isNew);

    const compare = (a: LocalTransaction, b: LocalTransaction) => {
      switch (activeSorting.id) {
        case "activityType": {
          const left = (a.activityType ?? "").toString();
          const right = (b.activityType ?? "").toString();
          return left.localeCompare(right);
        }
        case "assetSymbol": {
          const left = (a.assetSymbol ?? "").toString();
          const right = (b.assetSymbol ?? "").toString();
          return left.localeCompare(right);
        }
        case "date":
        default: {
          const left = a.date ? new Date(a.date).getTime() : 0;
          const right = b.date ? new Date(b.date).getTime() : 0;
          return left - right;
        }
      }
    };

    transactions.sort((a, b) => {
      const newA = isNewRow(a);
      const newB = isNewRow(b);
      if (newA !== newB) {
        return newA ? -1 : 1;
      }

      const result = compare(a, b);
      return activeSorting.desc ? -result : result;
    });

    return transactions;
  }, [activeSorting.desc, activeSorting.id, localTransactions]);

  const filteredTransactionsRef = useRef(sortedTransactions);

  filteredTransactionsRef.current = sortedTransactions;

  const transactionIndexLookup = useMemo(() => {
    return new Map(sortedTransactions.map((transaction, index) => [transaction.id, index]));
  }, [sortedTransactions]);

  const getScrollElement = useCallback(() => scrollContainerRef.current, []);
  const estimateRowSize = useCallback(() => 44, []);
  const getRowKey = useCallback((index: number) => {
    return filteredTransactionsRef.current[index]?.id ?? index;
  }, []);

  const virtualizerOptions = useMemo(
    () => ({
      count: sortedTransactions.length,
      getItemKey: getRowKey,
      getScrollElement,
      estimateSize: estimateRowSize,
      overscan: 8,
    }),
    [estimateRowSize, getRowKey, getScrollElement, sortedTransactions.length],
  );

  const rowVirtualizer = useVirtualizer(virtualizerOptions);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const handleCellNavigation = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      setFocusedCell((current) => {
        if (!current) return current;

        const transactions = filteredTransactionsRef.current;
        if (!transactions || transactions.length === 0) return current;

        const currentRowIndex = transactionIndexLookup.get(current.rowId) ?? -1;
        if (currentRowIndex === -1) return current;

        const currentFieldIndex = editableFields.indexOf(current.field);
        if (currentFieldIndex === -1) return current;

        let newRowIndex = currentRowIndex;
        let newFieldIndex = currentFieldIndex;

        switch (direction) {
          case "up":
            newRowIndex = Math.max(0, currentRowIndex - 1);
            break;
          case "down":
            newRowIndex = Math.min(transactions.length - 1, currentRowIndex + 1);
            break;
          case "left":
            newFieldIndex = Math.max(0, currentFieldIndex - 1);
            break;
          case "right":
            newFieldIndex = Math.min(editableFields.length - 1, currentFieldIndex + 1);
            break;
        }

        const nextRow = transactions[newRowIndex];
        const nextField = editableFields[newFieldIndex];

        if (!nextRow || !nextField) {
          return current;
        }

        if (nextRow.id === current.rowId && nextField === current.field) {
          return current;
        }

        return { rowId: nextRow.id, field: nextField };
      });
    },
    [transactionIndexLookup],
  );

  const addNewRow = useCallback(() => {
    const now = new Date();
    const draft = {
      ...createDraftTransaction(accounts, fallbackCurrency),
      date: now,
      createdAt: now,
      updatedAt: now,
    };
    setLocalTransactions((prev) => [draft, ...prev]);
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      next.add(draft.id);
      return next;
    });
    setTimeout(() => {
      setFocusedCell({ rowId: draft.id, field: "activityType" });
    }, 0);
  }, [accounts, fallbackCurrency, setDirtyTransactionIds, setFocusedCell, setLocalTransactions]);

  const updateTransaction = useCallback(
    (id: string, field: EditableField, value: string, meta?: { dataSource?: DataSource }) => {
      setLocalTransactions((prev) =>
        prev.map((transaction) => {
          if (transaction.id !== id) return transaction;

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
            updated.date = parseLocalDateTime(value);
          } else if (field === "quantity") {
            updated.quantity = parseDecimalInput(value);
            applySplitDefaults();
          } else if (field === "unitPrice") {
            updated.unitPrice = parseDecimalInput(value);
            if (isCashActivity(updated.activityType) || isIncomeActivity(updated.activityType)) {
              updated.amount = updated.unitPrice;
            }
            applySplitDefaults();
          } else if (field === "amount") {
            updated.amount = parseDecimalInput(value);
          } else if (field === "fee") {
            updated.fee = parseDecimalInput(value);
          } else if (field === "assetSymbol") {
            const upper = value.trim().toUpperCase();
            updated.assetSymbol = upper;
            updated.assetId = upper;
            if (meta?.dataSource) {
              updated.assetDataSource = meta.dataSource;
            }
            const assetCurrency = resolveTransactionCurrency(updated, { includeFallback: false });
            if (assetCurrency) {
              updated.currency = assetCurrency;
            }
          } else if (field === "activityType") {
            updated.activityType = value as ActivityType;
            applyCashDefaults();
            applySplitDefaults();
          } else if (field === "accountId") {
            updated.accountId = value;
            const account = accountLookup.get(value);
            if (account) {
              updated.accountName = account.name;
              updated.accountCurrency = account.currency;
              updated.currency = account.currency;
            }
            applyCashDefaults();
            applySplitDefaults();
          } else if (field === "currency") {
            updated.currency = value;
            applyCashDefaults();
            applySplitDefaults();
          } else if (field === "comment") {
            updated.comment = value;
          }

          updated.updatedAt = new Date();

          return updated;
        }),
      );
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    },
    [
      accountLookup,
      fallbackCurrency,
      resolveTransactionCurrency,
      setDirtyTransactionIds,
      setLocalTransactions,
    ],
  );

  const duplicateRow = useCallback(
    (id: string) => {
      const now = new Date();
      let newId: string | null = null;

      setLocalTransactions((prev) => {
        const source = prev.find((transaction) => transaction.id === id);
        if (!source) return prev;

        newId = generateTempActivityId();
        const duplicated: LocalTransaction = {
          ...source,
          id: newId,
          date: now,
          createdAt: now,
          updatedAt: now,
          isNew: true,
        };

        return [duplicated, ...prev];
      });

      if (!newId) return;

      const duplicatedId = newId;

      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        next.add(duplicatedId);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setTimeout(() => {
        setFocusedCell({ rowId: duplicatedId, field: "activityType" });
      }, 0);
    },
    [setDirtyTransactionIds, setFocusedCell, setLocalTransactions, setSelectedIds],
  );

  const deleteRow = useCallback(
    (id: string) => {
      let deletedTransaction: LocalTransaction | undefined;
      setLocalTransactions((prev) => {
        deletedTransaction = prev.find((transaction) => transaction.id === id);
        return prev.filter((transaction) => transaction.id !== id);
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      if (deletedTransaction && !deletedTransaction.isNew) {
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    },
    [setDirtyTransactionIds, setLocalTransactions, setPendingDeleteIds, setSelectedIds],
  );

  const deleteSelected = useCallback(() => {
    const idsToDelete = Array.from(selectedIds);

    // Clear selection first to avoid state conflicts
    setSelectedIds(new Set());

    // Track which transactions to delete from state
    const transactionsToDelete: LocalTransaction[] = [];
    setLocalTransactions((prev) => {
      idsToDelete.forEach((id) => {
        const transaction = prev.find((t) => t.id === id);
        if (transaction) {
          transactionsToDelete.push(transaction);
        }
      });
      return prev.filter((transaction) => !idsToDelete.includes(transaction.id));
    });

    // Clean up dirty transaction IDs
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      idsToDelete.forEach((id) => next.delete(id));
      return next;
    });

    // Add non-new transactions to pending deletes
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      transactionsToDelete.forEach((transaction) => {
        if (!transaction.isNew) {
          next.add(transaction.id);
        }
      });
      return next;
    });
  }, [
    selectedIds,
    setDirtyTransactionIds,
    setLocalTransactions,
    setPendingDeleteIds,
    setSelectedIds,
  ]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === sortedTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTransactions.map((transaction) => transaction.id)));
    }
  }, [selectedIds.size, sortedTransactions]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleEditTransaction = useCallback(
    (activity: ActivityDetails) => {
      onEditActivity(activity);
      if (activity.id) {
        setFocusedCell({ rowId: activity.id, field: "activityType" });
      }
    },
    [onEditActivity, setFocusedCell],
  );

  useEffect(() => {
    if (!focusedCell) {
      return;
    }
    const targetIndex = transactionIndexLookup.get(focusedCell.rowId);
    if (targetIndex === undefined) {
      return;
    }

    const virtualItems = rowVirtualizer.getVirtualItems();
    const isVisible = virtualItems.some((item) => item.index === targetIndex);

    if (!isVisible) {
      rowVirtualizer.scrollToIndex(targetIndex, { align: "auto" });
    }
  }, [focusedCell, rowVirtualizer, transactionIndexLookup]);

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

      if (!payload.assetId && isCashActivity(payload.activityType)) {
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
      setSelectedIds(new Set());

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
    setSelectedIds,
  ]);

  const handleCancelChanges = useCallback(() => {
    setDirtyTransactionIds(new Set());
    setPendingDeleteIds(new Set());
    setSelectedIds(new Set());
    setLocalTransactions((prev) => prev.filter((transaction) => !transaction.isNew));
    onRefetch();
    toast({
      title: "Changes discarded",
      description: "Unsaved edits and drafts have been cleared.",
      variant: "default",
    });
  }, [
    onRefetch,
    setDirtyTransactionIds,
    setLocalTransactions,
    setPendingDeleteIds,
    setSelectedIds,
  ]);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-3">
      <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
        <div className="text-muted-foreground flex items-center gap-2.5 text-xs">
          {selectedIds.size > 0 && (
            <span className="font-medium">
              {selectedIds.size} row{selectedIds.size === 1 ? "" : "s"} selected
            </span>
          )}
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2">
              <span className="text-primary font-medium">
                {dirtyTransactionIds.size + pendingDeleteIds.size} pending change
                {dirtyTransactionIds.size + pendingDeleteIds.size === 1 ? "" : "s"}
              </span>
              <div className="bg-border h-3.5 w-px" />
              <div className="flex items-center gap-4">
                {changesCounts.newCount > 0 && (
                  <span className="text-success flex items-center gap-1">
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
                  <span className="text-destructive flex items-center gap-1">
                    <Icons.Trash className="h-3 w-3" />
                    <span className="font-medium">{changesCounts.deletedCount}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            onClick={addNewRow}
            variant="outline"
            size="xs"
            className="shrink-0 rounded-md"
            title="Add transaction"
            aria-label="Add transaction"
          >
            <Icons.Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </Button>

          {selectedIds.size > 0 && (
            <>
              <div className="bg-border mx-1 h-4 w-px" />
              <Button
                onClick={deleteSelected}
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
              <div className="bg-border mx-1 h-4 w-px" />
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

      <div
        ref={scrollContainerRef}
        className="bg-background min-h-[320px] flex-1 overflow-auto rounded-lg border [&>div]:overflow-visible"
      >
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-muted/30 h-9 w-12 border-r px-0 py-0">
                <div className="flex h-full items-center justify-center">
                  <Checkbox
                    checked={
                      sortedTransactions.length > 0 &&
                      selectedIds.size === sortedTransactions.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </div>
              </TableHead>
              <SortableHeader
                className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold"
                title="Type"
                columnId="activityType"
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
              <SortableHeader
                className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold"
                title="Date & Time"
                columnId="date"
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
              <SortableHeader
                className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold"
                title="Symbol"
                columnId="assetSymbol"
                sorting={sorting}
                onSortingChange={onSortingChange}
              />
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Quantity
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Unit Price
              </TableHead>
              <TableHead className="bg-muted/30 h-9 w-24 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Amount
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Fee
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                Total
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Account
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Currency
              </TableHead>
              <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                Comment
              </TableHead>
              <TableHead className="bg-muted/30 h-9 px-2 py-1.5" />
            </TableRow>
          </TableHeader>
          {sortedTransactions.length === 0 ? (
            <TableBody>
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground h-32 text-center">
                  No transactions yet. Click &quot;Add Transaction&quot; to get started.
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            <TableBody>
              {paddingTop > 0 ? (
                <TableRow key="virtual-padding-top">
                  <TableCell colSpan={12} style={{ height: paddingTop }} />
                </TableRow>
              ) : null}

              {virtualRows.map((virtualRow) => {
                const transaction = sortedTransactions[virtualRow.index];
                if (!transaction) {
                  return null;
                }

                return (
                  <Fragment key={virtualRow.key}>
                    <TransactionRow
                      transaction={transaction}
                      activityTypeOptions={activityTypeOptions}
                      accountOptions={accountOptions}
                      currencyOptions={currencyOptions}
                      accountLookup={accountLookup}
                      isSelected={selectedIds.has(transaction.id)}
                      isDirty={dirtyTransactionIds.has(transaction.id)}
                      focusedField={
                        focusedCell?.rowId === transaction.id ? focusedCell.field : null
                      }
                      onToggleSelect={toggleSelect}
                      onUpdateTransaction={updateTransaction}
                      onEditTransaction={handleEditTransaction}
                      onDuplicate={duplicateRow}
                      onDelete={deleteRow}
                      onNavigate={handleCellNavigation}
                      setFocusedCell={setFocusedCell}
                      resolvedCurrency={
                        dirtyCurrencyLookup.get(transaction.id) ??
                        transaction.currency ??
                        transaction.accountCurrency ??
                        fallbackCurrency
                      }
                      fallbackCurrency={fallbackCurrency}
                      rowRef={rowVirtualizer.measureElement}
                    />
                  </Fragment>
                );
              })}

              {paddingBottom > 0 ? (
                <TableRow key="virtual-padding-bottom">
                  <TableCell colSpan={12} style={{ height: paddingBottom }} />
                </TableRow>
              ) : null}
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  );
}

interface TransactionRowProps {
  transaction: LocalTransaction;
  activityTypeOptions: { value: string; label: string; searchValue?: string }[];
  accountOptions: { value: string; label: string; searchValue?: string }[];
  currencyOptions: { value: string; label: string; searchValue?: string }[];
  accountLookup: Map<string, Account>;
  isSelected: boolean;
  isDirty: boolean;
  focusedField: EditableField | null;
  onToggleSelect: (id: string) => void;
  onUpdateTransaction: (
    id: string,
    field: EditableField,
    value: string,
    meta?: { dataSource?: DataSource },
  ) => void;
  onEditTransaction: (transaction: ActivityDetails) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  setFocusedCell: Dispatch<SetStateAction<CellCoordinate | null>>;
  resolvedCurrency: string;
  fallbackCurrency: string;
  rowRef?: (instance: HTMLTableRowElement | null) => void;
}

const TransactionRow = memo(function TransactionRow({
  transaction,
  activityTypeOptions,
  accountOptions,
  currencyOptions,
  accountLookup,
  isSelected,
  isDirty,
  focusedField,
  onToggleSelect,
  onUpdateTransaction,
  onEditTransaction,
  onDuplicate,
  onDelete,
  onNavigate,
  setFocusedCell,
  resolvedCurrency,
  fallbackCurrency,
  rowRef,
}: TransactionRowProps) {
  const isCash = isCashActivity(transaction.activityType);
  const isSplit = transaction.activityType === ActivityType.SPLIT;
  const handleFocus = useCallback(
    (field: EditableField) => {
      setFocusedCell({ rowId: transaction.id, field });
    },
    [setFocusedCell, transaction.id],
  );

  const accountLabel =
    accountLookup.get(transaction.accountId)?.name ?? transaction.accountName ?? "";
  const totalValue = roundDecimal(calculateActivityValue(transaction), 6);
  const currency = resolvedCurrency || fallbackCurrency;
  const normalizedCurrency = currency.toUpperCase();
  const assetSymbolDisplay =
    transaction.assetSymbol ??
    (isCash ? `$CASH-${normalizedCurrency}` : (transaction.assetSymbol ?? ""));
  const assetSymbol = transaction.assetSymbol ?? "";
  const unitPriceDisplay = (() => {
    if (transaction.activityType === ActivityType.FEE) {
      return "-";
    }
    if (transaction.activityType === ActivityType.SPLIT) {
      const ratio = toFiniteNumberOrUndefined(transaction.amount);
      return ratio !== undefined ? `${ratio.toFixed(0)} : 1` : "";
    }
    if (
      isCashActivity(transaction.activityType) ||
      isIncomeActivity(transaction.activityType) ||
      isCashTransfer(transaction.activityType, assetSymbol)
    ) {
      return formatAmountDisplay(transaction.amount, currency, false, fallbackCurrency);
    }
    return formatAmountDisplay(transaction.unitPrice, currency, false, fallbackCurrency);
  })();
  const amountDisplay =
    transaction.activityType === ActivityType.SPLIT
      ? getNumericCellValue(transaction.amount)
      : formatAmountDisplay(transaction.amount, currency, false, fallbackCurrency);
  const feeDisplay =
    transaction.activityType === ActivityType.SPLIT
      ? "-"
      : formatAmountDisplay(transaction.fee, currency, false, fallbackCurrency);
  const totalDisplay =
    transaction.activityType === ActivityType.SPLIT
      ? "-"
      : formatAmountDisplay(totalValue, currency, false, fallbackCurrency);

  return (
    <TableRow
      ref={rowRef}
      className={cn(
        "group hover:bg-muted/40",
        isSelected && "bg-muted/60",
        transaction.isNew && "bg-primary/5",
        isDirty && "border-l-primary border-l-2",
      )}
    >
      <TableCell className="h-9 w-12 border-r px-0 py-0 text-center">
        <div className="flex h-full items-center justify-center">
          <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(transaction.id)} />
        </div>
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0">
        <SelectCell
          value={transaction.activityType}
          options={activityTypeOptions}
          onChange={(value) => onUpdateTransaction(transaction.id, "activityType", value)}
          onFocus={() => handleFocus("activityType")}
          onNavigate={onNavigate}
          isFocused={focusedField === "activityType"}
          renderValue={(value) => (
            <ActivityTypeBadge type={value as ActivityType} className="font-mono text-xs" />
          )}
        />
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0">
        <EditableCell
          value={formatDateTimeLocal(transaction.date)}
          displayValue={formatDateTimeDisplay(transaction.date)}
          onChange={(value) => onUpdateTransaction(transaction.id, "date", value)}
          onFocus={() => handleFocus("date")}
          onNavigate={onNavigate}
          isFocused={focusedField === "date"}
          type="datetime-local"
          className="font-mono"
        />
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0">
        <SymbolAutocompleteCell
          value={assetSymbolDisplay}
          onChange={(value, meta) =>
            onUpdateTransaction(transaction.id, "assetSymbol", value, meta)
          }
          onFocus={() => handleFocus("assetSymbol")}
          onNavigate={onNavigate}
          isFocused={focusedField === "assetSymbol"}
          className="font-mono text-xs font-semibold uppercase"
          disabled={isCash}
        />
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0 text-right">
        <EditableCell
          value={getNumericCellValue(transaction.quantity)}
          onChange={(value) => onUpdateTransaction(transaction.id, "quantity", value)}
          onFocus={() => handleFocus("quantity")}
          onNavigate={onNavigate}
          isFocused={focusedField === "quantity"}
          type="number"
          inputMode="decimal"
          className="justify-end text-right font-mono tabular-nums"
          disabled={isCash}
        />
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0 text-right">
        <EditableCell
          value={getNumericCellValue(transaction.unitPrice)}
          displayValue={unitPriceDisplay}
          onChange={(value) => onUpdateTransaction(transaction.id, "unitPrice", value)}
          onFocus={() => handleFocus("unitPrice")}
          onNavigate={onNavigate}
          isFocused={focusedField === "unitPrice"}
          type="number"
          inputMode="decimal"
          step="0.01"
          className="justify-end text-right font-mono tabular-nums"
          disabled={isCash || isSplit}
        />
      </TableCell>
      <TableCell className="h-9 w-24 border-r px-0 py-0 text-right">
        <EditableCell
          value={getNumericCellValue(transaction.amount)}
          displayValue={amountDisplay}
          onChange={(value) => onUpdateTransaction(transaction.id, "amount", value)}
          onFocus={() => handleFocus("amount")}
          onNavigate={onNavigate}
          isFocused={focusedField === "amount"}
          type="number"
          inputMode="decimal"
          step="0.01"
          className="justify-end text-right font-mono tabular-nums"
        />
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0 text-right">
        <EditableCell
          value={getNumericCellValue(transaction.fee)}
          displayValue={feeDisplay}
          onChange={(value) => onUpdateTransaction(transaction.id, "fee", value)}
          onFocus={() => handleFocus("fee")}
          onNavigate={onNavigate}
          isFocused={focusedField === "fee"}
          type="number"
          inputMode="decimal"
          step="0.01"
          className="justify-end text-right font-mono tabular-nums"
          disabled={isSplit}
        />
      </TableCell>
      <TableCell className="h-9 border-r px-2 py-1.5 text-right">
        <span className="font-mono text-xs font-semibold tabular-nums">{totalDisplay}</span>
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0">
        <SelectCell
          value={transaction.accountId ?? ""}
          options={accountOptions}
          onChange={(value) => onUpdateTransaction(transaction.id, "accountId", value)}
          onFocus={() => handleFocus("accountId")}
          onNavigate={onNavigate}
          isFocused={focusedField === "accountId"}
          renderValue={() => accountLabel || transaction.accountId || ""}
          className="text-xs"
        />
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0">
        <SelectCell
          value={transaction.currency ?? ""}
          options={currencyOptions}
          onChange={(value) => onUpdateTransaction(transaction.id, "currency", value)}
          onFocus={() => handleFocus("currency")}
          onNavigate={onNavigate}
          isFocused={focusedField === "currency"}
          className="font-mono text-xs"
        />
      </TableCell>
      <TableCell className="h-9 border-r px-0 py-0">
        <EditableCell
          value={transaction.comment ?? ""}
          onChange={(value) => onUpdateTransaction(transaction.id, "comment", value)}
          onFocus={() => handleFocus("comment")}
          onNavigate={onNavigate}
          isFocused={focusedField === "comment"}
          className="text-muted-foreground"
        />
      </TableCell>
      <TableCell className="h-9 px-2 py-0">
        <div className="pointer-events-none flex justify-end opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
          <ActivityOperations
            activity={transaction}
            onEdit={onEditTransaction}
            onDuplicate={(activity) => onDuplicate(activity.id)}
            onDelete={(activity) => onDelete(activity.id)}
          />
        </div>
      </TableCell>
    </TableRow>
  );
});
