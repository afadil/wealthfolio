import { getExpenseCategories, getIncomeCategories } from "@/commands/category";
import { getEvents } from "@/commands/event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isIncomeActivity,
} from "@/lib/activity-utils";
import { ActivityType, ActivityTypeNames, DataSource } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import {
  Account,
  ActivityBulkMutationRequest,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
  CategoryWithChildren,
  Event,
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
import { useQuery } from "@tanstack/react-query";
import type { SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Badge,
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

function resolveAssetIdForTransaction(
  transaction: LocalTransaction,
  fallbackCurrency: string,
): string | undefined {
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
}

function formatAmountDisplay(
  value: unknown,
  currency?: string,
  displayCurrency = false,
  fallbackCurrency = "USD",
): string {
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
}

function createDraftTransaction(
  accounts: Account[],
  fallbackCurrency: string,
): LocalTransaction {
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
  const [bulkActivityTypeModalOpen, setBulkActivityTypeModalOpen] = useState(false);
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkEventModalOpen, setBulkEventModalOpen] = useState(false);
  const { saveActivitiesMutation } = useActivityMutations();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { assets } = useAssets();

  const { data: expenseCategories = [] } = useQuery({
    queryKey: [QueryKeys.EXPENSE_CATEGORIES],
    queryFn: getExpenseCategories,
  });

  const { data: incomeCategories = [] } = useQuery({
    queryKey: [QueryKeys.INCOME_CATEGORIES],
    queryFn: getIncomeCategories,
  });

  const categories = useMemo(() => {
    return [...expenseCategories, ...incomeCategories];
  }, [expenseCategories, incomeCategories]);

  const { data: events = [] } = useQuery({
    queryKey: [QueryKeys.EVENTS],
    queryFn: getEvents,
  });

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

  useEffect(() => {
    filteredTransactionsRef.current = sortedTransactions;
  }, [sortedTransactions]);

  const transactionIndexLookup = useMemo(() => {
    return new Map(sortedTransactions.map((transaction, index) => [transaction.id, index]));
  }, [sortedTransactions]);

  const rowVirtualizer = useVirtualizer({
    count: sortedTransactions.length,
    getItemKey: (index) => sortedTransactions[index].id,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const { UnsavedChangesDialog } = useUnsavedChanges({
    hasUnsavedChanges,
    message: "You have unsaved changes. Are you sure you want to leave? Your changes will be lost.",
  });

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

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const bulkAssignActivityType = useCallback(
    (activityType: ActivityType) => {
      setLocalTransactions((prev) =>
        prev.map((t) => (selectedIds.has(t.id) ? { ...t, activityType } : t)),
      );
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        selectedIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIds(new Set());
      setBulkActivityTypeModalOpen(false);
      toast({
        title: "Activity type assigned",
        description: `Activity type assigned to ${selectedIds.size} transaction(s)`,
        variant: "success",
      });
    },
    [selectedIds, setDirtyTransactionIds, setLocalTransactions],
  );

  const bulkAssignCategory = useCallback(
    (categoryId: string | undefined, subCategoryId?: string) => {
      setLocalTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.id)
            ? {
                ...t,
                categoryId: categoryId || undefined,
                subCategoryId: categoryId ? subCategoryId : undefined,
              }
            : t,
        ),
      );
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        selectedIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIds(new Set());
      setBulkCategoryModalOpen(false);
      const message = categoryId
        ? `Category assigned to ${selectedIds.size} transaction(s)`
        : `Category cleared from ${selectedIds.size} transaction(s)`;
      toast({
        title: categoryId ? "Category assigned" : "Category cleared",
        description: message,
        variant: "success",
      });
    },
    [selectedIds, setDirtyTransactionIds, setLocalTransactions],
  );

  const bulkAssignEvent = useCallback(
    (eventId: string | undefined) => {
      setLocalTransactions((prev) =>
        prev.map((t) => (selectedIds.has(t.id) ? { ...t, eventId: eventId || undefined } : t)),
      );
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        selectedIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIds(new Set());
      setBulkEventModalOpen(false);
      toast({
        title: eventId ? "Event assigned" : "Event cleared",
        description: `Event ${eventId ? "assigned to" : "cleared from"} ${selectedIds.size} transaction(s)`,
        variant: "success",
      });
    },
    [selectedIds, setDirtyTransactionIds, setLocalTransactions],
  );

  const clearAllCategories = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) =>
        selectedIds.has(t.id)
          ? {
              ...t,
              categoryId: undefined,
              subCategoryId: undefined,
            }
          : t,
      ),
    );
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
    toast({
      title: "Categories cleared",
      description: `Cleared categories from ${selectedIds.size} transaction(s)`,
      variant: "success",
    });
  }, [selectedIds, setDirtyTransactionIds, setLocalTransactions]);

  const clearAllEvents = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) => (selectedIds.has(t.id) ? { ...t, eventId: undefined } : t)),
    );
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
    toast({
      title: "Events cleared",
      description: `Cleared events from ${selectedIds.size} transaction(s)`,
      variant: "success",
    });
  }, [selectedIds, setDirtyTransactionIds, setLocalTransactions]);

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
    <>
      <UnsavedChangesDialog />
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
                onClick={() => setBulkActivityTypeModalOpen(true)}
                variant="outline"
                size="xs"
                className="shrink-0"
              >
                <Icons.ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
                Type
              </Button>
              <Button
                onClick={() => setBulkCategoryModalOpen(true)}
                variant="outline"
                size="xs"
                className="shrink-0"
              >
                <Icons.Tag className="mr-1 h-3.5 w-3.5" />
                Category
              </Button>
              <Button
                onClick={() => setBulkEventModalOpen(true)}
                variant="outline"
                size="xs"
                className="shrink-0"
              >
                <Icons.Calendar className="mr-1 h-3.5 w-3.5" />
                Event
              </Button>

              <div className="bg-border mx-1 h-4 w-px" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" className="shrink-0">
                    <Icons.XCircle className="mr-1 h-3.5 w-3.5" />
                    Clear
                    <Icons.ChevronDown className="ml-1 h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={clearAllCategories}>
                    <Icons.Tag className="mr-2 h-4 w-4" />
                    Clear Categories
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={clearAllEvents}>
                    <Icons.Calendar className="mr-2 h-4 w-4" />
                    Clear Events
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

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

              <Button
                onClick={clearSelection}
                variant="ghost"
                size="xs"
                className="shrink-0 ml-auto"
              >
                Deselect
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
                  No investment activity yet. Add a trade or import from your brokerage.
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

      <BulkActivityTypeAssignModal
        open={bulkActivityTypeModalOpen}
        onClose={() => setBulkActivityTypeModalOpen(false)}
        onAssign={bulkAssignActivityType}
        selectedCount={selectedIds.size}
      />

      <BulkCategoryAssignModal
        open={bulkCategoryModalOpen}
        onClose={() => setBulkCategoryModalOpen(false)}
        categories={categories}
        onAssign={bulkAssignCategory}
        selectedCount={selectedIds.size}
      />

      <BulkEventAssignModal
        open={bulkEventModalOpen}
        onClose={() => setBulkEventModalOpen(false)}
        events={events}
        onAssign={bulkAssignEvent}
        selectedCount={selectedIds.size}
      />
    </>
  );
}

// Bulk action modals

interface BulkActivityTypeAssignModalProps {
  open: boolean;
  onClose: () => void;
  onAssign: (activityType: ActivityType) => void;
  selectedCount: number;
}

const BULK_ACTIVITY_TYPE_OPTIONS = Object.values(ActivityType).map((type) => ({
  value: type,
  label: ActivityTypeNames[type],
}));

function BulkActivityTypeAssignModal({
  open,
  onClose,
  onAssign,
  selectedCount,
}: BulkActivityTypeAssignModalProps) {
  const [selectedType, setSelectedType] = useState<string>("");

  const handleAssign = () => {
    if (selectedType) {
      onAssign(selectedType as ActivityType);
      setSelectedType("");
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Assign Type to {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>Select an activity type to assign.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="mb-1 block text-sm font-medium">Activity Type</label>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger>
              <SelectValue placeholder="Select activity type" />
            </SelectTrigger>
            <SelectContent>
              {BULK_ACTIVITY_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedType}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BulkCategoryAssignModalProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryWithChildren[];
  onAssign: (categoryId: string | undefined, subCategoryId?: string) => void;
  selectedCount: number;
}

const NONE_CATEGORY_VALUE = "__none__";

function BulkCategoryAssignModal({
  open,
  onClose,
  categories,
  onAssign,
  selectedCount,
}: BulkCategoryAssignModalProps) {
  const [selectedCat, setSelectedCat] = useState("");
  const [selectedSub, setSelectedSub] = useState("");

  const isNoneSelected = selectedCat === NONE_CATEGORY_VALUE;
  const selectedCategory = !isNoneSelected
    ? categories.find((c) => c.id === selectedCat)
    : undefined;
  const subCategories = selectedCategory?.children || [];

  const handleAssign = () => {
    if (selectedCat === NONE_CATEGORY_VALUE) {
      onAssign(undefined, undefined);
    } else if (selectedCat) {
      onAssign(selectedCat, selectedSub || undefined);
    }
    setSelectedCat("");
    setSelectedSub("");
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Assign Category to {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Select a category and optionally a subcategory to assign, or clear existing categories.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <Select
              value={selectedCat}
              onValueChange={(v) => {
                setSelectedCat(v);
                setSelectedSub("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_CATEGORY_VALUE}>None (Clear category)</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      {cat.color && (
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {subCategories.length > 0 && !isNoneSelected && (
            <div>
              <label className="mb-1 block text-sm font-medium">Subcategory (optional)</label>
              <Select value={selectedSub} onValueChange={setSelectedSub}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subcategory" />
                </SelectTrigger>
                <SelectContent>
                  {subCategories.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedCat}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BulkEventAssignModalProps {
  open: boolean;
  onClose: () => void;
  events: Event[];
  onAssign: (eventId: string | undefined) => void;
  selectedCount: number;
}

const NONE_EVENT_VALUE = "__none__";

function BulkEventAssignModal({
  open,
  onClose,
  events,
  onAssign,
  selectedCount,
}: BulkEventAssignModalProps) {
  const [selectedEvent, setSelectedEvent] = useState("");

  const handleAssign = () => {
    if (selectedEvent === NONE_EVENT_VALUE) {
      onAssign(undefined);
    } else if (selectedEvent) {
      onAssign(selectedEvent);
    }
    setSelectedEvent("");
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Assign Event to {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>Select an event to assign or clear existing events.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="mb-1 block text-sm font-medium">Event</label>
          <Select value={selectedEvent} onValueChange={setSelectedEvent}>
            <SelectTrigger>
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_EVENT_VALUE}>None (Clear event)</SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedEvent}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
