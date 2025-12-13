import { CASH_ACTIVITY_TYPES, CashActivityType } from "@/commands/cash-activity";
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
import { ActivityType } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import {
  Account,
  ActivityBulkMutationRequest,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
  CategoryWithChildren,
  Event,
  RecurrenceType,
  RECURRENCE_TYPES,
} from "@/lib/types";
import { cn, formatDateTimeDisplay, formatDateTimeLocal } from "@/lib/utils";
import { EditableCell } from "@/pages/activity/components/activity-datagrid/editable-cell";
import { SelectCell } from "@/pages/activity/components/activity-datagrid/select-cell";
import { ActivityTypeBadge } from "@/pages/activity/components/activity-type-badge";
import { useActivityMutations } from "@/pages/activity/hooks/use-activity-mutations";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatAmount,
  worldCurrencies,
} from "@wealthfolio/ui";
import type { Dispatch, SetStateAction } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

type EditableField =
  | "activityType"
  | "date"
  | "name"
  | "amount"
  | "fee"
  | "categoryId"
  | "subCategoryId"
  | "eventId"
  | "recurrence"
  | "accountId"
  | "currency"
  | "comment";

interface CellCoordinate {
  rowId: string;
  field: EditableField;
}

interface LocalTransaction extends ActivityDetails {
  isNew?: boolean;
}

interface CashActivityDatagridProps {
  accounts: Account[];
  activities: ActivityDetails[];
  onRefetch: () => Promise<unknown>;
  onEditActivity: (activity: ActivityDetails) => void;
}

const editableFields: EditableField[] = [
  "activityType",
  "date",
  "name",
  "amount",
  "fee",
  "categoryId",
  "subCategoryId",
  "eventId",
  "recurrence",
  "accountId",
  "currency",
  "comment",
];

const CASH_ACTIVITY_TYPE_NAMES: Record<CashActivityType, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
};

function generateTempActivityId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `temp-${crypto.randomUUID()}`;
  }
  return `temp-${Date.now().toString(36)}`;
}

function getNumericCellValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "";
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function toFiniteNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
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
    return formatAmount(numericValue, currency ?? fallbackCurrency, displayCurrency);
  } catch {
    return "";
  }
}

function createDraftTransaction(accounts: Account[], fallbackCurrency: string): LocalTransaction {
  const defaultAccount = accounts.find((account) => account.isActive) ?? accounts[0];
  const now = new Date();

  return {
    id: generateTempActivityId(),
    activityType: "DEPOSIT" as ActivityType,
    date: now,
    quantity: 0,
    unitPrice: 0,
    amount: 0,
    fee: 0,
    currency: defaultAccount?.currency ?? fallbackCurrency,
    isDraft: true,
    comment: "",
    createdAt: now,
    assetId: `$CASH-${(defaultAccount?.currency ?? fallbackCurrency).toUpperCase()}`,
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
}

export function CashActivityDatagrid({
  accounts,
  activities,
  onRefetch,
  onEditActivity,
}: CashActivityDatagridProps) {
  const [localTransactions, setLocalTransactions] = useState<LocalTransaction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedCell, setFocusedCell] = useState<CellCoordinate | null>(null);
  const [dirtyTransactionIds, setDirtyTransactionIds] = useState<Set<string>>(new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [bulkActivityTypeModalOpen, setBulkActivityTypeModalOpen] = useState(false);
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkEventModalOpen, setBulkEventModalOpen] = useState(false);
  const [bulkRecurrenceModalOpen, setBulkRecurrenceModalOpen] = useState(false);
  const { saveActivitiesMutation } = useActivityMutations();

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

  const { data: expenseCategories = [] } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.EXPENSE_CATEGORIES],
    queryFn: getExpenseCategories,
  });

  const { data: incomeCategories = [] } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.INCOME_CATEGORIES],
    queryFn: getIncomeCategories,
  });

  const categories = useMemo(
    () => [...expenseCategories, ...incomeCategories],
    [expenseCategories, incomeCategories],
  );

  const { data: events = [] } = useQuery<Event[], Error>({
    queryKey: [QueryKeys.EVENTS],
    queryFn: getEvents,
  });

  const activityTypeOptions = useMemo(
    () =>
      CASH_ACTIVITY_TYPES.map((type) => ({
        value: type,
        label: CASH_ACTIVITY_TYPE_NAMES[type],
        searchValue: `${CASH_ACTIVITY_TYPE_NAMES[type]} ${type}`,
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

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "No category", searchValue: "no category" },
      ...categories.map((cat) => ({
        value: cat.id,
        label: cat.name,
        searchValue: cat.name,
      })),
    ],
    [categories],
  );

  const getCategoryOptionsForActivityType = useCallback(
    () => categoryOptions,
    [categoryOptions],
  );

  const categoryLookup = useMemo(() => {
    return new Map(categories.map((cat) => [cat.id, cat]));
  }, [categories]);

  const subcategoryLookup = useMemo(() => {
    const map = new Map<string, { name: string; parentId: string }>();
    categories.forEach((cat) => {
      cat.children?.forEach((sub) => {
        map.set(sub.id, { name: sub.name, parentId: cat.id });
      });
    });
    return map;
  }, [categories]);

  const getSubcategoryOptions = useCallback(
    (categoryId: string | undefined) => {
      if (!categoryId) return [];
      const category = categoryLookup.get(categoryId);
      const children = category?.children ?? [];
      if (children.length === 0) return [];
      return [
        { value: "", label: "No subcategory", searchValue: "no subcategory" },
        ...children.map((sub) => ({
          value: sub.id,
          label: sub.name,
          searchValue: sub.name,
        })),
      ];
    },
    [categoryLookup],
  );

  const eventOptions = useMemo(
    () => [
      { value: "", label: "No event", searchValue: "no event" },
      ...events.map((event) => ({
        value: event.id,
        label: event.name,
        searchValue: event.name,
      })),
    ],
    [events],
  );

  const eventLookup = useMemo(() => {
    return new Map(events.map((event) => [event.id, event]));
  }, [events]);

  const RECURRENCE_LABELS: Record<string, string> = {
    fixed: "Fixed",
    variable: "Variable",
    periodic: "Periodic",
  };

  const recurrenceOptions = useMemo(
    () => [
      { value: "", label: "No recurrence", searchValue: "no recurrence" },
      ...RECURRENCE_TYPES.map((type) => ({
        value: type,
        label: RECURRENCE_LABELS[type] || type,
        searchValue: RECURRENCE_LABELS[type] || type,
      })),
    ],
    [],
  );

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

    localTransactions.forEach((transaction) => {
      if (transaction.currency) {
        entries.set(
          transaction.currency,
          entries.get(transaction.currency) ?? transaction.currency,
        );
      }
    });

    return Array.from(entries.entries()).map(([value, label]) => ({
      value,
      label: value,
      searchValue: label,
    }));
  }, [accounts, localTransactions]);

  const serverTransactions = useMemo(() => activities, [activities]);

  useEffect(() => {
    setLocalTransactions((previous) => {
      const dirtyIds = new Set(dirtyTransactionIds);
      const deletedIds = new Set(pendingDeleteIds);
      const preservedDrafts = previous.filter(
        (transaction) => transaction.isNew && !deletedIds.has(transaction.id),
      );

      const mergedFromServer = serverTransactions
        .filter((transaction) => !deletedIds.has(transaction.id))
        .map((transaction) => {
          if (dirtyIds.has(transaction.id)) {
            const localVersion = previous.find((local) => local.id === transaction.id);
            return localVersion ?? transaction;
          }
          return transaction;
        });

      return [...preservedDrafts, ...mergedFromServer];
    });
  }, [dirtyTransactionIds, pendingDeleteIds, serverTransactions]);

  const filteredTransactionsRef = useRef(localTransactions);

  useEffect(() => {
    filteredTransactionsRef.current = localTransactions;
  }, [localTransactions]);

  const hasUnsavedChanges =
    dirtyTransactionIds.size > 0 ||
    pendingDeleteIds.size > 0 ||
    localTransactions.some((t) => t.isNew);

  const { UnsavedChangesDialog } = useUnsavedChanges({
    hasUnsavedChanges,
    message: "You have unsaved changes. Are you sure you want to leave? Your changes will be lost.",
  });

  const handleCellNavigation = useCallback((direction: "up" | "down" | "left" | "right") => {
    setFocusedCell((current) => {
      if (!current) return current;

      const transactions = filteredTransactionsRef.current;
      if (!transactions || transactions.length === 0) return current;

      const currentRowIndex = transactions.findIndex((t) => t.id === current.rowId);
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
  }, []);

  const addNewRow = useCallback(() => {
    const draft = createDraftTransaction(accounts, fallbackCurrency);
    setLocalTransactions((prev) => [draft, ...prev]);
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      next.add(draft.id);
      return next;
    });
    setTimeout(() => {
      setFocusedCell({ rowId: draft.id, field: "activityType" });
    }, 0);
  }, [accounts, fallbackCurrency]);

  const updateTransaction = useCallback(
    (id: string, field: EditableField, value: string) => {
      setLocalTransactions((prev) =>
        prev.map((transaction) => {
          if (transaction.id !== id) return transaction;

          const updated: LocalTransaction = { ...transaction };

          const toNumber = (input: string) => {
            const parsed = Number.parseFloat(input);
            return Number.isFinite(parsed) ? parsed : 0;
          };

          const applyCashDefaults = () => {
            const derivedCurrency = updated.currency ?? updated.accountCurrency ?? fallbackCurrency;
            const cashSymbol = `$CASH-${derivedCurrency.toUpperCase()}`;
            updated.assetSymbol = cashSymbol;
            updated.assetId = cashSymbol;
            updated.quantity = 0;
            updated.unitPrice = 0;
          };

          if (field === "date") {
            updated.date = value ? new Date(value) : new Date();
          } else if (field === "name") {
            updated.name = value;
          } else if (field === "amount") {
            updated.amount = toNumber(value);
            updated.unitPrice = toNumber(value);
          } else if (field === "fee") {
            updated.fee = toNumber(value);
          } else if (field === "activityType") {
            updated.activityType = value as ActivityType;
            applyCashDefaults();
          } else if (field === "categoryId") {
            updated.categoryId = value || undefined;
            const category = categoryLookup.get(value);
            updated.categoryName = category?.name;
            updated.categoryColor = category?.color;
            updated.subCategoryId = undefined;
            updated.subCategoryName = undefined;
          } else if (field === "subCategoryId") {
            updated.subCategoryId = value || undefined;
            const subcat = subcategoryLookup.get(value);
            updated.subCategoryName = subcat?.name;
          } else if (field === "eventId") {
            updated.eventId = value || undefined;
            const event = eventLookup.get(value);
            updated.eventName = event?.name;
          } else if (field === "recurrence") {
            updated.recurrence = (value || undefined) as RecurrenceType | undefined;
          } else if (field === "accountId") {
            updated.accountId = value;
            const account = accountLookup.get(value);
            if (account) {
              updated.accountName = account.name;
              updated.accountCurrency = account.currency;
              updated.currency = account.currency;
            }
            applyCashDefaults();
          } else if (field === "currency") {
            updated.currency = value;
            applyCashDefaults();
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
    [accountLookup, categoryLookup, subcategoryLookup, eventLookup, fallbackCurrency],
  );

  const duplicateRow = useCallback(
    (id: string) => {
      const source = localTransactions.find((transaction) => transaction.id === id);
      if (!source) return;
      const now = new Date();
      const duplicated: LocalTransaction = {
        ...source,
        id: generateTempActivityId(),
        date: now,
        createdAt: now,
        updatedAt: now,
        isNew: true,
      };
      setLocalTransactions((prev) => [duplicated, ...prev]);
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        next.add(duplicated.id);
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setTimeout(() => {
        setFocusedCell({ rowId: duplicated.id, field: "activityType" });
      }, 0);
    },
    [localTransactions],
  );

  const deleteRow = useCallback(
    (id: string) => {
      setLocalTransactions((prev) => prev.filter((transaction) => transaction.id !== id));
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

      const target = localTransactions.find((transaction) => transaction.id === id);
      if (target && !target.isNew) {
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }
    },
    [localTransactions],
  );

  const deleteSelected = useCallback(() => {
    const idsToDelete = Array.from(selectedIds);
    idsToDelete.forEach((id) => deleteRow(id));
  }, [deleteRow, selectedIds]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === localTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(localTransactions.map((transaction) => transaction.id)));
    }
  }, [localTransactions, selectedIds.size]);

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
    (activityType: CashActivityType) => {
      setLocalTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.id) ? { ...t, activityType: activityType as ActivityType } : t,
        ),
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
    [selectedIds],
  );

  const bulkAssignCategory = useCallback(
    (categoryId: string | undefined, subCategoryId?: string) => {
      setLocalTransactions((prev) =>
        prev.map((t) => {
          if (!selectedIds.has(t.id)) return t;
          const category = categoryLookup.get(categoryId ?? "");
          const subcat = subcategoryLookup.get(subCategoryId ?? "");
          return {
            ...t,
            categoryId: categoryId || undefined,
            categoryName: category?.name,
            categoryColor: category?.color,
            subCategoryId: categoryId ? subCategoryId : undefined,
            subCategoryName: subcat?.name,
          };
        }),
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
    [selectedIds, categoryLookup, subcategoryLookup],
  );

  const bulkAssignEvent = useCallback(
    (eventId: string | undefined) => {
      setLocalTransactions((prev) =>
        prev.map((t) => {
          if (!selectedIds.has(t.id)) return t;
          const event = eventLookup.get(eventId ?? "");
          return {
            ...t,
            eventId: eventId || undefined,
            eventName: event?.name,
          };
        }),
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
    [selectedIds, eventLookup],
  );

  const clearAllCategories = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) =>
        selectedIds.has(t.id)
          ? {
              ...t,
              categoryId: undefined,
              categoryName: undefined,
              categoryColor: undefined,
              subCategoryId: undefined,
              subCategoryName: undefined,
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
  }, [selectedIds]);

  const clearAllEvents = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) =>
        selectedIds.has(t.id) ? { ...t, eventId: undefined, eventName: undefined } : t,
      ),
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
  }, [selectedIds]);

  const bulkAssignRecurrence = useCallback(
    (recurrence: RecurrenceType | undefined) => {
      setLocalTransactions((prev) =>
        prev.map((t) => {
          if (!selectedIds.has(t.id)) return t;
          return {
            ...t,
            recurrence: recurrence || undefined,
          };
        }),
      );
      setDirtyTransactionIds((prev) => {
        const next = new Set(prev);
        selectedIds.forEach((id) => next.add(id));
        return next;
      });
      setSelectedIds(new Set());
      setBulkRecurrenceModalOpen(false);
      toast({
        title: recurrence ? "Recurrence assigned" : "Recurrence cleared",
        description: `Recurrence ${recurrence ? "assigned to" : "cleared from"} ${selectedIds.size} transaction(s)`,
        variant: "success",
      });
    },
    [selectedIds],
  );

  const clearAllRecurrence = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) =>
        selectedIds.has(t.id) ? { ...t, recurrence: undefined } : t,
      ),
    );
    setDirtyTransactionIds((prev) => {
      const next = new Set(prev);
      selectedIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedIds(new Set());
    toast({
      title: "Recurrence cleared",
      description: `Cleared recurrence from ${selectedIds.size} transaction(s)`,
      variant: "success",
    });
  }, [selectedIds]);

  const handleEditTransaction = useCallback(
    (activity: ActivityDetails) => {
      onEditActivity(activity);
      if (activity.id) {
        setFocusedCell({ rowId: activity.id, field: "activityType" });
      }
    },
    [onEditActivity],
  );

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
        transaction.currency ?? transaction.accountCurrency ?? fallbackCurrency;

      const payload: ActivityCreate = {
        id: transaction.id,
        accountId: transaction.accountId,
        activityType: transaction.activityType,
        activityDate:
          transaction.date instanceof Date
            ? transaction.date.toISOString()
            : new Date(transaction.date).toISOString(),
        assetId: `$CASH-${resolvedCurrency.toUpperCase().trim()}`,
        quantity: 0,
        unitPrice: toFiniteNumberOrUndefined(transaction.amount),
        amount: toFiniteNumberOrUndefined(transaction.amount),
        currency: resolvedCurrency,
        fee: toFiniteNumberOrUndefined(transaction.fee),
        isDraft: false,
        comment: transaction.comment ?? undefined,
        name: transaction.name ?? undefined,
        categoryId: transaction.categoryId ?? undefined,
        subCategoryId: transaction.subCategoryId ?? undefined,
        eventId: transaction.eventId ?? undefined,
      };

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
    onRefetch,
    saveActivitiesMutation,
    fallbackCurrency,
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
  }, [onRefetch]);

  return (
    <>
      <UnsavedChangesDialog />
      <div className="space-y-3">
        <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
          <div className="flex items-center gap-1">
            <div className="text-muted-foreground flex items-center gap-2.5 text-xs">
              {selectedIds.size > 0 && (
                <span className="font-medium">
                  {selectedIds.size} row{selectedIds.size === 1 ? "" : "s"} selected
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="text-primary font-medium">
                  {dirtyTransactionIds.size + pendingDeleteIds.size} pending change
                  {dirtyTransactionIds.size + pendingDeleteIds.size === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {selectedIds.size > 0 && (
              <>
                <div className="bg-border mx-3 h-4 w-px" />
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
                <Button
                  onClick={() => setBulkRecurrenceModalOpen(true)}
                  variant="outline"
                  size="xs"
                  className="shrink-0"
                >
                  <Icons.Refresh className="mr-1 h-3.5 w-3.5" />
                  Recurrence
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
                    <DropdownMenuItem onClick={clearAllRecurrence}>
                      <Icons.Refresh className="mr-2 h-4 w-4" />
                      Clear Recurrence
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

                <div className="bg-border mx-2 h-4 w-px" />

                <Button onClick={clearSelection} variant="ghost" size="xs" className="shrink-0">
                  Deselect
                </Button>
              </>
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

        <div className="bg-background overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-muted/30 h-9 w-12 border-r px-0 py-0">
                  <div className="flex h-full items-center justify-center">
                    <Checkbox
                      checked={
                        localTransactions.length > 0 &&
                        selectedIds.size === localTransactions.length
                      }
                      onCheckedChange={toggleSelectAll}
                    />
                  </div>
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                  Type
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                  Date & Time
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                  Name
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                  Amount
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-right text-xs font-semibold">
                  Fee
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                  Category
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                  Subcategory
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                  Event
                </TableHead>
                <TableHead className="bg-muted/30 h-9 border-r px-2 py-1.5 text-xs font-semibold">
                  Recurrence
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
            <TableBody>
              {localTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-muted-foreground h-32 text-center">
                    No transactions yet. Add a deposit or import from your bank.
                  </TableCell>
                </TableRow>
              ) : (
                localTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    activityTypeOptions={activityTypeOptions}
                    accountOptions={accountOptions}
                    currencyOptions={currencyOptions}
                    getCategoryOptionsForActivityType={getCategoryOptionsForActivityType}
                    getSubcategoryOptions={getSubcategoryOptions}
                    eventOptions={eventOptions}
                    recurrenceOptions={recurrenceOptions}
                    accountLookup={accountLookup}
                    isSelected={selectedIds.has(transaction.id)}
                    isDirty={dirtyTransactionIds.has(transaction.id)}
                    focusedField={focusedCell?.rowId === transaction.id ? focusedCell.field : null}
                    onToggleSelect={toggleSelect}
                    onUpdateTransaction={updateTransaction}
                    onEditTransaction={handleEditTransaction}
                    onDuplicate={duplicateRow}
                    onDelete={deleteRow}
                    onNavigate={handleCellNavigation}
                    setFocusedCell={setFocusedCell}
                    fallbackCurrency={fallbackCurrency}
                  />
                ))
              )}
            </TableBody>
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

      <BulkRecurrenceAssignModal
        open={bulkRecurrenceModalOpen}
        onClose={() => setBulkRecurrenceModalOpen(false)}
        onAssign={bulkAssignRecurrence}
        selectedCount={selectedIds.size}
      />
    </>
  );
}

interface BulkActivityTypeAssignModalProps {
  open: boolean;
  onClose: () => void;
  onAssign: (activityType: CashActivityType) => void;
  selectedCount: number;
}

const ACTIVITY_TYPE_OPTIONS = [
  { value: ActivityType.DEPOSIT, label: "Deposit", icon: Icons.ArrowDown },
  { value: ActivityType.WITHDRAWAL, label: "Withdrawal", icon: Icons.ArrowUp },
  { value: ActivityType.TRANSFER_IN, label: "Transfer In", icon: Icons.ArrowDown },
  { value: ActivityType.TRANSFER_OUT, label: "Transfer Out", icon: Icons.ArrowUp },
] as const;

function BulkActivityTypeAssignModal({
  open,
  onClose,
  onAssign,
  selectedCount,
}: BulkActivityTypeAssignModalProps) {
  const handleSelect = (type: CashActivityType) => {
    onAssign(type);
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
        <div className="grid grid-cols-2 gap-2 py-4">
          {ACTIVITY_TYPE_OPTIONS.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => handleSelect(type.value as CashActivityType)}
                className="hover:bg-muted hover:border-primary flex flex-col items-center justify-center gap-2 rounded-lg border p-4 transition-colors"
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{type.label}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
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

interface BulkRecurrenceAssignModalProps {
  open: boolean;
  onClose: () => void;
  onAssign: (recurrence: RecurrenceType | undefined) => void;
  selectedCount: number;
}

const RECURRENCE_TYPE_OPTIONS = [
  { value: "fixed" as const, label: "Fixed", icon: Icons.Hash },
  { value: "variable" as const, label: "Variable", icon: Icons.TrendingUp },
  { value: "periodic" as const, label: "Periodic", icon: Icons.Refresh },
  { value: null, label: "None", icon: Icons.XCircle },
] as const;

function BulkRecurrenceAssignModal({
  open,
  onClose,
  onAssign,
  selectedCount,
}: BulkRecurrenceAssignModalProps) {
  const handleSelect = (type: RecurrenceType | null) => {
    onAssign(type ?? undefined);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Assign Recurrence to {selectedCount} Transaction{selectedCount !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Select a recurrence type to assign.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 py-4">
          {RECURRENCE_TYPE_OPTIONS.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.value ?? "none"}
                type="button"
                onClick={() => handleSelect(type.value)}
                className="hover:bg-muted hover:border-primary flex flex-col items-center justify-center gap-2 rounded-lg border p-4 transition-colors"
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{type.label}</span>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
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
  getCategoryOptionsForActivityType: (
    activityType: string | undefined,
  ) => { value: string; label: string; searchValue?: string }[];
  getSubcategoryOptions: (
    categoryId: string | undefined,
  ) => { value: string; label: string; searchValue?: string }[];
  eventOptions: { value: string; label: string; searchValue?: string }[];
  recurrenceOptions: { value: string; label: string; searchValue?: string }[];
  accountLookup: Map<string, Account>;
  isSelected: boolean;
  isDirty: boolean;
  focusedField: EditableField | null;
  onToggleSelect: (id: string) => void;
  onUpdateTransaction: (id: string, field: EditableField, value: string) => void;
  onEditTransaction: (transaction: ActivityDetails) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  setFocusedCell: Dispatch<SetStateAction<CellCoordinate | null>>;
  fallbackCurrency: string;
}

const TransactionRow = memo(
  function TransactionRow({
    transaction,
    activityTypeOptions,
    accountOptions,
    currencyOptions,
    getCategoryOptionsForActivityType,
    getSubcategoryOptions,
    eventOptions,
    recurrenceOptions,
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
    fallbackCurrency,
  }: TransactionRowProps) {
    const handleFocus = useCallback(
      (field: EditableField) => {
        setFocusedCell({ rowId: transaction.id, field });
      },
      [setFocusedCell, transaction.id],
    );

    const accountLabel =
      accountLookup.get(transaction.accountId)?.name ?? transaction.accountName ?? "";
    const currency = transaction.currency ?? transaction.accountCurrency ?? fallbackCurrency;
    const amountDisplay = formatAmountDisplay(
      transaction.amount,
      currency,
      false,
      fallbackCurrency,
    );
    const feeDisplay = formatAmountDisplay(transaction.fee, currency, false, fallbackCurrency);

    return (
      <TableRow
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
          <EditableCell
            value={transaction.name ?? ""}
            onChange={(value) => onUpdateTransaction(transaction.id, "name", value)}
            onFocus={() => handleFocus("name")}
            onNavigate={onNavigate}
            isFocused={focusedField === "name"}
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0 text-right">
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
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.categoryId ?? ""}
            options={getCategoryOptionsForActivityType(transaction.activityType)}
            onChange={(value) => onUpdateTransaction(transaction.id, "categoryId", value)}
            onFocus={() => handleFocus("categoryId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "categoryId"}
            renderValue={() => transaction.categoryName || ""}
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.subCategoryId ?? ""}
            options={getSubcategoryOptions(transaction.categoryId)}
            onChange={(value) => onUpdateTransaction(transaction.id, "subCategoryId", value)}
            onFocus={() => handleFocus("subCategoryId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "subCategoryId"}
            renderValue={() => transaction.subCategoryName || ""}
            className="text-xs"
            disabled={!transaction.categoryId}
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.eventId ?? ""}
            options={eventOptions}
            onChange={(value) => onUpdateTransaction(transaction.id, "eventId", value)}
            onFocus={() => handleFocus("eventId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "eventId"}
            renderValue={() => transaction.eventName || ""}
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.recurrence ?? ""}
            options={recurrenceOptions}
            onChange={(value) => onUpdateTransaction(transaction.id, "recurrence", value)}
            onFocus={() => handleFocus("recurrence")}
            onNavigate={onNavigate}
            isFocused={focusedField === "recurrence"}
            className="text-xs"
          />
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
          <div className="pointer-events-none flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onEditTransaction(transaction)}
              title="Edit"
            >
              <Icons.Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onDuplicate(transaction.id)}
              title="Duplicate"
            >
              <Icons.Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive h-6 w-6"
              onClick={() => onDelete(transaction.id)}
              title="Delete"
            >
              <Icons.Trash className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  },
  function areEqualTransactionRowProps(prev, next) {
    return (
      prev.transaction === next.transaction &&
      prev.isSelected === next.isSelected &&
      prev.isDirty === next.isDirty &&
      prev.focusedField === next.focusedField &&
      prev.activityTypeOptions === next.activityTypeOptions &&
      prev.accountOptions === next.accountOptions &&
      prev.currencyOptions === next.currencyOptions &&
      prev.getCategoryOptionsForActivityType === next.getCategoryOptionsForActivityType &&
      prev.getSubcategoryOptions === next.getSubcategoryOptions &&
      prev.eventOptions === next.eventOptions &&
      prev.recurrenceOptions === next.recurrenceOptions &&
      prev.accountLookup === next.accountLookup &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onUpdateTransaction === next.onUpdateTransaction &&
      prev.onEditTransaction === next.onEditTransaction &&
      prev.onDuplicate === next.onDuplicate &&
      prev.onDelete === next.onDelete &&
      prev.onNavigate === next.onNavigate &&
      prev.setFocusedCell === next.setFocusedCell
    );
  },
);
