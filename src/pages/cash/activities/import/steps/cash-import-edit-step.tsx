import { getExpenseCategories, getIncomeCategories } from "@/commands/category";
import { bulkApplyActivityRules } from "@/commands/activity-rule";
import { getEvents } from "@/commands/event";
import { getEventTypes } from "@/commands/event-type";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableFacetedFilter } from "@/pages/activity/components/activity-datagrid/data-table-faceted-filter";
import { ActivityType } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import type {
  Account,
  CashImportRow,
  Category,
  CategoryWithChildren,
  Event,
  EventType,
  NewCategory,
  NewActivityRule,
  UpdateCategory,
  UpdateActivityRule,
  RecurrenceType,
} from "@/lib/types";
import { RECURRENCE_TYPES } from "@/lib/types";
import { cn, formatDateTimeDisplay, formatDateTimeLocal } from "@/lib/utils";
import { EditableCell } from "@/pages/activity/components/activity-datagrid/editable-cell";
import { SelectCell } from "@/pages/activity/components/activity-datagrid/select-cell";
import { ActivityTypeBadge } from "@/pages/activity/components/activity-type-badge";
import { CategoryEditModal } from "@/pages/settings/categories/components/category-edit-modal";
import { useCategoryMutations } from "@/pages/settings/categories/use-category-mutations";
import { RuleEditModal } from "@/pages/settings/activity-rules/components/rule-edit-modal";
import { useActivityRuleMutations } from "@/pages/settings/activity-rules/use-activity-rule-mutations";
import { EventFormDialog } from "@/pages/settings/events/components/event-form-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatAmount,
} from "@wealthfolio/ui";
import type { Dispatch, SetStateAction } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ManageCategoriesDialog } from "../components/manage-categories-dialog";
import { ManageRulesDialog } from "../components/manage-rules-dialog";
import { ManageEventsDialog } from "../components/manage-events-dialog";

const createOriginalTransactionsMap = (transactions: CashImportRow[]) =>
  new Map(transactions.map((t) => [t.lineNumber, { ...t }]));

type EditableField =
  | "activityType"
  | "date"
  | "name"
  | "amount"
  | "accountId"
  | "categoryId"
  | "subCategoryId"
  | "eventId"
  | "recurrence"
  | "description";

interface CellCoordinate {
  rowId: number;
  field: EditableField;
}

const editableFields: EditableField[] = [
  "activityType",
  "date",
  "name",
  "amount",
  "accountId",
  "categoryId",
  "subCategoryId",
  "eventId",
  "recurrence",
  "description",
];

type CategorizationStatus =
  | "categorized"
  | "uncategorized"
  | "with-events"
  | "without-events"
  | "with-recurrence"
  | "without-recurrence";

const CATEGORY_STATUS_VALUES = ["uncategorized", "categorized"] as const;
const EVENT_STATUS_VALUES = ["with-events", "without-events"] as const;
const RECURRENCE_STATUS_VALUES = ["with-recurrence", "without-recurrence"] as const;

const setsEqual = <T,>(a: Set<T>, b: Set<T>): boolean => {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
};

interface CashImportEditStepProps {
  transactions: CashImportRow[];
  accountId: string;
  accounts: Account[];
  onNext: (transactions: CashImportRow[]) => void;
  onBack: () => void;
}

const getNumericCellValue = (value: unknown): string => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "";
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
};

const formatAmountDisplay = (value: unknown, currency: string): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  try {
    return formatAmount(value, currency, false);
  } catch {
    return value.toString();
  }
};

export function CashImportEditStep({
  transactions: initialTransactions,
  accountId,
  accounts,
  onNext,
  onBack,
}: CashImportEditStepProps) {
  const queryClient = useQueryClient();
  const { createCategoryMutation } = useCategoryMutations();
  const { createRuleMutation } = useActivityRuleMutations();
  const [localTransactions, setLocalTransactions] = useState<CashImportRow[]>(initialTransactions);
  const originalTransactionsRef = useRef<Map<number, CashImportRow>>(
    createOriginalTransactionsMap(initialTransactions),
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [focusedCell, setFocusedCell] = useState<CellCoordinate | null>(null);
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<Set<string>>(new Set());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedRecurrenceTypes, setSelectedRecurrenceTypes] = useState<Set<string>>(new Set());
  const [selectedCategorizationStatuses, setSelectedCategorizationStatuses] = useState<
    Set<CategorizationStatus>
  >(new Set());
  const [amountRange, setAmountRange] = useState<{ min: string; max: string }>({
    min: "",
    max: "",
  });
  const [displayedTransactions, setDisplayedTransactions] = useState<CashImportRow[]>([]);
  const [pendingFilterChanges, setPendingFilterChanges] = useState(0);
  const [lastAppliedFilter, setLastAppliedFilter] = useState<{
    searchQuery: string;
    accountIds: Set<string>;
    activityTypes: Set<string>;
    categoryIds: Set<string>;
    subCategoryIds: Set<string>;
    eventIds: Set<string>;
    recurrenceTypes: Set<string>;
    categorizationStatuses: Set<CategorizationStatus>;
    amountMin: string;
    amountMax: string;
  }>({
    searchQuery: "",
    accountIds: new Set(),
    activityTypes: new Set(),
    categoryIds: new Set(),
    subCategoryIds: new Set(),
    eventIds: new Set(),
    recurrenceTypes: new Set(),
    categorizationStatuses: new Set(),
    amountMin: "",
    amountMax: "",
  });

  const [bulkActivityTypeModalOpen, setBulkActivityTypeModalOpen] = useState(false);
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkEventModalOpen, setBulkEventModalOpen] = useState(false);
  const [bulkRecurrenceModalOpen, setBulkRecurrenceModalOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [selectParentCategoryOpen, setSelectParentCategoryOpen] = useState(false);
  const [createSubcategoryOpen, setCreateSubcategoryOpen] = useState(false);
  const [selectedParentCategory, setSelectedParentCategory] = useState<Category | null>(null);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [manageRulesOpen, setManageRulesOpen] = useState(false);
  const [manageEventsOpen, setManageEventsOpen] = useState(false);

  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const accountCurrency = account?.currency ?? "USD";

  const { data: expenseCategories = [] } = useQuery<CategoryWithChildren[]>({
    queryKey: [QueryKeys.EXPENSE_CATEGORIES],
    queryFn: getExpenseCategories,
  });

  const { data: incomeCategories = [] } = useQuery<CategoryWithChildren[]>({
    queryKey: [QueryKeys.INCOME_CATEGORIES],
    queryFn: getIncomeCategories,
  });

  const categories = useMemo(
    () => [...expenseCategories, ...incomeCategories],
    [expenseCategories, incomeCategories],
  );

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: [QueryKeys.EVENTS],
    queryFn: getEvents,
  });

  const { data: eventTypes = [] } = useQuery<EventType[]>({
    queryKey: [QueryKeys.EVENT_TYPES],
    queryFn: getEventTypes,
  });

  const activityTypeOptions = useMemo(
    () => [
      { value: ActivityType.DEPOSIT, label: "Deposit", searchValue: "Deposit Income" },
      { value: ActivityType.WITHDRAWAL, label: "Withdrawal", searchValue: "Withdrawal Expense" },
      { value: ActivityType.TRANSFER_IN, label: "Transfer In", searchValue: "Transfer In" },
      { value: ActivityType.TRANSFER_OUT, label: "Transfer Out", searchValue: "Transfer Out" },
    ],
    [],
  );

  const expenseCategoryOptions = useMemo(
    () =>
      expenseCategories.map((cat) => ({
        value: cat.id,
        label: cat.name,
        searchValue: cat.name,
      })),
    [expenseCategories],
  );

  const incomeCategoryOptions = useMemo(
    () =>
      incomeCategories.map((cat) => ({
        value: cat.id,
        label: cat.name,
        searchValue: cat.name,
      })),
    [incomeCategories],
  );

  const allCategoryOptions = useMemo(
    () => [
      { value: "", label: "No Category", searchValue: "None Clear Remove" },
      ...expenseCategoryOptions,
      ...incomeCategoryOptions,
    ],
    [expenseCategoryOptions, incomeCategoryOptions],
  );

  const categoryLookup = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

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
      const subcategories = (category?.children ?? []).map((sub) => ({
        value: sub.id,
        label: sub.name,
        searchValue: sub.name,
      }));
      if (subcategories.length === 0) return [];
      return [
        { value: "", label: "No Subcategory", searchValue: "None Clear Remove" },
        ...subcategories,
      ];
    },
    [categoryLookup],
  );

  const eventOptions = useMemo(
    () => [
      { value: "", label: "No Event", searchValue: "None Clear Remove" },
      ...events.map((event) => ({
        value: event.id,
        label: event.name,
        searchValue: event.name,
      })),
    ],
    [events],
  );

  const eventLookup = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);

  const recurrenceOptions = useMemo(
    () => [
      { value: "", label: "No Recurrence", searchValue: "None Clear Remove" },
      ...RECURRENCE_TYPES.map((type) => ({
        value: type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        searchValue: type,
      })),
    ],
    [],
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((acc) => ({
        value: acc.id,
        label: acc.name,
        searchValue: acc.name,
      })),
    [accounts],
  );

  const accountLookup = useMemo(() => new Map(accounts.map((acc) => [acc.id, acc])), [accounts]);

  const filterAccountOptions = useMemo(
    () =>
      accounts.map((acc) => ({
        value: acc.id,
        label: `${acc.name} (${acc.currency})`,
      })),
    [accounts],
  );

  const filterActivityTypeOptions = useMemo(
    () => [
      { value: ActivityType.DEPOSIT, label: "Deposit" },
      { value: ActivityType.WITHDRAWAL, label: "Withdrawal" },
      { value: ActivityType.TRANSFER_IN, label: "Transfer In" },
      { value: ActivityType.TRANSFER_OUT, label: "Transfer Out" },
    ],
    [],
  );

  const filterCategoryOptions = useMemo(
    () => [
      { value: "uncategorized", label: "Uncategorized" },
      { value: "categorized", label: "Categorized" },
      ...categories.map((cat) => ({
        value: cat.id,
        label: cat.name,
        color: cat.color,
      })),
    ],
    [categories],
  );

  const filterSubCategoryOptions = useMemo(() => {
    if (selectedCategoryIds.size === 0) return [];
    const options: { value: string; label: string; color?: string }[] = [];
    categories
      .filter((cat) => selectedCategoryIds.has(cat.id))
      .forEach((category) => {
        if (category.children && category.children.length > 0) {
          category.children.forEach((sub) => {
            options.push({
              value: sub.id,
              label: sub.name,
              color: category.color,
            });
          });
        }
      });
    return options;
  }, [categories, selectedCategoryIds]);

  const filterEventOptions = useMemo(
    () => [
      { value: "with-events", label: "With Events" },
      { value: "without-events", label: "Without Events" },
      ...events.map((event) => ({
        value: event.id,
        label: event.name,
      })),
    ],
    [events],
  );

  const filterRecurrenceOptions = useMemo(
    () => [
      { value: "with-recurrence", label: "With Recurrence" },
      { value: "without-recurrence", label: "Without Recurrence" },
      ...RECURRENCE_TYPES.map((type) => ({
        value: type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
      })),
    ],
    [],
  );

  const categorizedCount = localTransactions.filter((t) => t.categoryId).length;
  const uncategorizedCount = localTransactions.filter((t) => !t.categoryId).length;
  const withEventsCount = localTransactions.filter((t) => t.eventId).length;
  const withoutEventsCount = localTransactions.filter((t) => !t.eventId).length;
  const withRecurrenceCount = localTransactions.filter((t) => t.recurrence).length;
  const withoutRecurrenceCount = localTransactions.filter((t) => !t.recurrence).length;

  const hasAmountFilter = amountRange.min !== "" || amountRange.max !== "";
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedAccountIds.size > 0 ||
    selectedActivityTypes.size > 0 ||
    selectedCategoryIds.size > 0 ||
    selectedSubCategoryIds.size > 0 ||
    selectedEventIds.size > 0 ||
    selectedRecurrenceTypes.size > 0 ||
    selectedCategorizationStatuses.size > 0 ||
    hasAmountFilter;

  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedAccountIds(new Set());
    setSelectedActivityTypes(new Set());
    setSelectedCategoryIds(new Set());
    setSelectedSubCategoryIds(new Set());
    setSelectedEventIds(new Set());
    setSelectedRecurrenceTypes(new Set());
    setSelectedCategorizationStatuses(new Set());
    setAmountRange({ min: "", max: "" });
  }, []);

  const computeFilteredTransactions = useCallback(
    (
      transactions: CashImportRow[],
      filters: {
        searchQuery: string;
        accountIds: Set<string>;
        activityTypes: Set<string>;
        categoryIds: Set<string>;
        subCategoryIds: Set<string>;
        eventIds: Set<string>;
        recurrenceTypes: Set<string>;
        categorizationStatuses: Set<CategorizationStatus>;
        amountMin: string;
        amountMax: string;
      },
    ) => {
      let result = transactions;

      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase();
        result = result.filter(
          (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
        );
      }

      if (filters.accountIds.size > 0) {
        result = result.filter((t) => {
          const effectiveAccountId = t.accountId || accountId;
          return filters.accountIds.has(effectiveAccountId);
        });
      }

      if (filters.activityTypes.size > 0) {
        result = result.filter((t) => filters.activityTypes.has(t.activityType));
      }

      if (filters.categoryIds.size > 0) {
        result = result.filter((t) => t.categoryId && filters.categoryIds.has(t.categoryId));
      }

      if (filters.subCategoryIds.size > 0) {
        result = result.filter(
          (t) => t.subCategoryId && filters.subCategoryIds.has(t.subCategoryId),
        );
      }

      if (filters.eventIds.size > 0) {
        result = result.filter((t) => t.eventId && filters.eventIds.has(t.eventId));
      }

      if (filters.recurrenceTypes.size > 0) {
        result = result.filter((t) => t.recurrence && filters.recurrenceTypes.has(t.recurrence));
      }

      if (filters.categorizationStatuses.size > 0) {
        result = result.filter((t) => {
          return Array.from(filters.categorizationStatuses).some((status) => {
            switch (status) {
              case "categorized":
                return !!t.categoryId;
              case "uncategorized":
                return !t.categoryId;
              case "with-events":
                return !!t.eventId;
              case "without-events":
                return !t.eventId;
              case "with-recurrence":
                return !!t.recurrence;
              case "without-recurrence":
                return !t.recurrence;
              default:
                return true;
            }
          });
        });
      }

      const minAmount = filters.amountMin ? parseFloat(filters.amountMin) : null;
      const maxAmount = filters.amountMax ? parseFloat(filters.amountMax) : null;
      if (minAmount !== null || maxAmount !== null) {
        result = result.filter((t) => {
          const amount = Math.abs(t.amount || 0);
          if (minAmount !== null && amount < minAmount) return false;
          if (maxAmount !== null && amount > maxAmount) return false;
          return true;
        });
      }

      return result;
    },
    [accountId],
  );

  const applyFilterRefresh = useCallback(() => {
    const currentFilters = {
      searchQuery,
      accountIds: selectedAccountIds,
      activityTypes: selectedActivityTypes,
      categoryIds: selectedCategoryIds,
      subCategoryIds: selectedSubCategoryIds,
      eventIds: selectedEventIds,
      recurrenceTypes: selectedRecurrenceTypes,
      categorizationStatuses: selectedCategorizationStatuses,
      amountMin: amountRange.min,
      amountMax: amountRange.max,
    };
    const newDisplayed = computeFilteredTransactions(localTransactions, currentFilters);
    setDisplayedTransactions(newDisplayed);
    setLastAppliedFilter(currentFilters);
    setPendingFilterChanges(0);
  }, [
    localTransactions,
    searchQuery,
    selectedAccountIds,
    selectedActivityTypes,
    selectedCategoryIds,
    selectedSubCategoryIds,
    selectedEventIds,
    selectedRecurrenceTypes,
    selectedCategorizationStatuses,
    amountRange,
    computeFilteredTransactions,
  ]);

  useEffect(() => {
    if (displayedTransactions.length === 0 && localTransactions.length > 0) {
      applyFilterRefresh();
    }
  }, [localTransactions, displayedTransactions.length, applyFilterRefresh]);

  useEffect(() => {
    const hasFilterChanged =
      searchQuery !== lastAppliedFilter.searchQuery ||
      !setsEqual(selectedAccountIds, lastAppliedFilter.accountIds) ||
      !setsEqual(selectedActivityTypes, lastAppliedFilter.activityTypes) ||
      !setsEqual(selectedCategoryIds, lastAppliedFilter.categoryIds) ||
      !setsEqual(selectedSubCategoryIds, lastAppliedFilter.subCategoryIds) ||
      !setsEqual(selectedEventIds, lastAppliedFilter.eventIds) ||
      !setsEqual(selectedRecurrenceTypes, lastAppliedFilter.recurrenceTypes) ||
      !setsEqual(selectedCategorizationStatuses, lastAppliedFilter.categorizationStatuses) ||
      amountRange.min !== lastAppliedFilter.amountMin ||
      amountRange.max !== lastAppliedFilter.amountMax;

    if (hasFilterChanged) {
      applyFilterRefresh();
    }
  }, [
    searchQuery,
    selectedAccountIds,
    selectedActivityTypes,
    selectedCategoryIds,
    selectedSubCategoryIds,
    selectedEventIds,
    selectedRecurrenceTypes,
    selectedCategorizationStatuses,
    amountRange,
    lastAppliedFilter,
    applyFilterRefresh,
  ]);

  useEffect(() => {
    const hasActiveFilters =
      lastAppliedFilter.searchQuery.trim().length > 0 ||
      lastAppliedFilter.accountIds.size > 0 ||
      lastAppliedFilter.activityTypes.size > 0 ||
      lastAppliedFilter.categoryIds.size > 0 ||
      lastAppliedFilter.subCategoryIds.size > 0 ||
      lastAppliedFilter.eventIds.size > 0 ||
      lastAppliedFilter.recurrenceTypes.size > 0 ||
      lastAppliedFilter.categorizationStatuses.size > 0 ||
      lastAppliedFilter.amountMin !== "" ||
      lastAppliedFilter.amountMax !== "";

    if (!hasActiveFilters) {
      setPendingFilterChanges(0);
      return;
    }

    const wouldBeFilteredOut = displayedTransactions.filter((displayed) => {
      const current = localTransactions.find((t) => t.lineNumber === displayed.lineNumber);
      if (!current) return true;

      const matchesFilter = computeFilteredTransactions([current], lastAppliedFilter).length > 0;
      return !matchesFilter;
    }).length;

    setPendingFilterChanges(wouldBeFilteredOut);
  }, [localTransactions, displayedTransactions, lastAppliedFilter, computeFilteredTransactions]);

  useEffect(() => {
    setDisplayedTransactions((prev) =>
      prev
        .map((displayed) => {
          const updated = localTransactions.find((t) => t.lineNumber === displayed.lineNumber);
          return updated || displayed;
        })
        .filter((displayed) =>
          localTransactions.some((t) => t.lineNumber === displayed.lineNumber),
        ),
    );
  }, [localTransactions]);

  const filteredTransactionsRef = useRef(displayedTransactions);
  useEffect(() => {
    filteredTransactionsRef.current = displayedTransactions;
  }, [displayedTransactions]);

  const handleCellNavigation = useCallback((direction: "up" | "down" | "left" | "right") => {
    setFocusedCell((current) => {
      if (!current) return current;

      const transactions = filteredTransactionsRef.current;
      if (!transactions || transactions.length === 0) return current;

      const currentRowIndex = transactions.findIndex((t) => t.lineNumber === current.rowId);
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

      if (!nextRow || !nextField) return current;
      if (nextRow.lineNumber === current.rowId && nextField === current.field) return current;

      return { rowId: nextRow.lineNumber, field: nextField };
    });
  }, []);

  const updateTransaction = useCallback(
    (lineNumber: number, field: EditableField, value: string) => {
      setLocalTransactions((prev) =>
        prev.map((transaction) => {
          if (transaction.lineNumber !== lineNumber) return transaction;

          const updated = { ...transaction };

          if (field === "date") {
            updated.date = value ? new Date(value).toISOString() : new Date().toISOString();
          } else if (field === "name") {
            updated.name = value;
          } else if (field === "amount") {
            const parsed = parseFloat(value);
            updated.amount = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
          } else if (field === "activityType") {
            updated.activityType = value as ActivityType;
          } else if (field === "accountId") {
            updated.accountId = value || undefined;
          } else if (field === "categoryId") {
            updated.categoryId = value || undefined;
            updated.subCategoryId = undefined;
            updated.isManualOverride = true;
            updated.matchedRuleId = undefined;
            updated.matchedRuleName = undefined;
          } else if (field === "subCategoryId") {
            updated.subCategoryId = value || undefined;
            updated.isManualOverride = true;
          } else if (field === "eventId") {
            updated.eventId = value || undefined;
          } else if (field === "recurrence") {
            updated.recurrence = (value || undefined) as RecurrenceType | undefined;
          } else if (field === "description") {
            updated.description = value;
          }

          return updated;
        }),
      );
    },
    [],
  );

  const toggleSelect = useCallback((lineNumber: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) {
        next.delete(lineNumber);
      } else {
        next.add(lineNumber);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === displayedTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedTransactions.map((t) => t.lineNumber)));
    }
  }, [displayedTransactions, selectedIds.size]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const deleteRow = useCallback((lineNumber: number) => {
    setLocalTransactions((prev) => prev.filter((t) => t.lineNumber !== lineNumber));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(lineNumber);
      return next;
    });
  }, []);

  const deleteSelected = useCallback(() => {
    setLocalTransactions((prev) => prev.filter((t) => !selectedIds.has(t.lineNumber)));
    setSelectedIds(new Set());
    toast.success(`Deleted ${selectedIds.size} transaction(s)`);
  }, [selectedIds]);

  const resetTransaction = useCallback((lineNumber: number) => {
    const original = originalTransactionsRef.current.get(lineNumber);
    if (!original) return;

    setLocalTransactions((prev) =>
      prev.map((t) =>
        t.lineNumber === lineNumber
          ? { ...original, lineNumber: t.lineNumber, isValid: t.isValid }
          : t,
      ),
    );
    toast.success("Transaction reset to original state");
  }, []);

  const resetSelected = useCallback(() => {
    const count = selectedIds.size;
    setLocalTransactions((prev) =>
      prev.map((t) => {
        if (!selectedIds.has(t.lineNumber)) return t;
        const original = originalTransactionsRef.current.get(t.lineNumber);
        if (!original) return t;
        return {
          ...original,
          lineNumber: t.lineNumber,
          isValid: t.isValid,
        };
      }),
    );
    setSelectedIds(new Set());
    toast.success(`Reset ${count} transaction(s) to original state`);
  }, [selectedIds]);

  const isTransactionModified = useCallback((lineNumber: number) => {
    const original = originalTransactionsRef.current.get(lineNumber);
    const current = localTransactions.find((t) => t.lineNumber === lineNumber);
    if (!original || !current) return false;

    return (
      original.categoryId !== current.categoryId ||
      original.subCategoryId !== current.subCategoryId ||
      original.eventId !== current.eventId ||
      original.recurrence !== current.recurrence ||
      original.activityType !== current.activityType ||
      original.matchedRuleId !== current.matchedRuleId
    );
  }, [localTransactions]);

  const applyRules = useCallback(async () => {
    setIsApplyingRules(true);
    try {
      const transactionsToApply: { lineNumber: number; name: string; accountId: string }[] = [];
      localTransactions.forEach((t) => {
        if (!t.isManualOverride) {
          transactionsToApply.push({
            lineNumber: t.lineNumber,
            name: t.name,
            accountId: t.accountId || accountId,
          });
        }
      });

      if (transactionsToApply.length === 0) {
        toast.info("All transactions have manual assignments");
        setIsApplyingRules(false);
        return;
      }

      const results = await bulkApplyActivityRules(
        transactionsToApply.map((t) => ({ name: t.name, accountId: t.accountId })),
      );

      const resultMap = new Map<number, (typeof results)[number]>();
      transactionsToApply.forEach((t, index) => {
        if (results[index]) {
          resultMap.set(t.lineNumber, results[index]);
        }
      });

      let appliedCount = 0;
      setLocalTransactions((prev) =>
        prev.map((t) => {
          if (t.isManualOverride) return t;

          const result = resultMap.get(t.lineNumber);
          if (result && (result.categoryId || result.activityType || result.recurrence)) {
            appliedCount++;
            return {
              ...t,
              categoryId: result.categoryId || t.categoryId,
              subCategoryId:
                result.subCategoryId || (result.categoryId ? undefined : t.subCategoryId),
              // Override activity type if the rule specifies one
              activityType: (result.activityType as ActivityType) || t.activityType,
              // Override recurrence if the rule specifies one
              recurrence: (result.recurrence as RecurrenceType) || t.recurrence,
              matchedRuleId: result.ruleId || undefined,
              matchedRuleName: result.ruleName || undefined,
              isManualOverride: false,
            };
          }
          return t;
        }),
      );

      toast.success(`Applied rules to ${appliedCount} transaction(s)`);
    } catch (error) {
      toast.error(`Failed to apply rules: ${String(error)}`);
    } finally {
      setIsApplyingRules(false);
    }
  }, [localTransactions, accountId]);

  const bulkAssignCategory = useCallback(
    (categoryId: string | undefined, subCategoryId?: string) => {
      setLocalTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.lineNumber)
            ? {
                ...t,
                categoryId: categoryId || undefined,
                subCategoryId: categoryId ? subCategoryId : undefined,
                matchedRuleId: undefined,
                matchedRuleName: undefined,
                isManualOverride: true,
              }
            : t,
        ),
      );
      setSelectedIds(new Set());
      setBulkCategoryModalOpen(false);
      const message = categoryId
        ? `Category assigned to ${selectedIds.size} transaction(s)`
        : `Category cleared from ${selectedIds.size} transaction(s)`;
      toast.success(message);
    },
    [selectedIds],
  );

  const bulkAssignEvent = useCallback(
    (eventId: string | undefined) => {
      setLocalTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.lineNumber) ? { ...t, eventId: eventId || undefined } : t,
        ),
      );
      setSelectedIds(new Set());
      setBulkEventModalOpen(false);
      toast.success(`Event assigned to ${selectedIds.size} transaction(s)`);
    },
    [selectedIds],
  );

  const bulkAssignRecurrence = useCallback(
    (recurrence: RecurrenceType | undefined) => {
      setLocalTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.lineNumber) ? { ...t, recurrence: recurrence || undefined } : t,
        ),
      );
      setSelectedIds(new Set());
      setBulkRecurrenceModalOpen(false);
      toast.success(`Recurrence assigned to ${selectedIds.size} transaction(s)`);
    },
    [selectedIds],
  );

  const bulkAssignActivityType = useCallback(
    (activityType: ActivityType) => {
      setLocalTransactions((prev) =>
        prev.map((t) => (selectedIds.has(t.lineNumber) ? { ...t, activityType } : t)),
      );
      setSelectedIds(new Set());
      setBulkActivityTypeModalOpen(false);
      toast.success(`Activity type assigned to ${selectedIds.size} transaction(s)`);
    },
    [selectedIds],
  );

  const clearAllCategories = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) =>
        selectedIds.has(t.lineNumber)
          ? {
              ...t,
              categoryId: undefined,
              subCategoryId: undefined,
              matchedRuleId: undefined,
              matchedRuleName: undefined,
              isManualOverride: false,
            }
          : t,
      ),
    );
    setSelectedIds(new Set());
    toast.success(`Cleared categories from ${selectedIds.size} transaction(s)`);
  }, [selectedIds]);

  const clearAllEvents = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) => (selectedIds.has(t.lineNumber) ? { ...t, eventId: undefined } : t)),
    );
    setSelectedIds(new Set());
    toast.success(`Cleared events from ${selectedIds.size} transaction(s)`);
  }, [selectedIds]);

  const clearAllRecurrence = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) => (selectedIds.has(t.lineNumber) ? { ...t, recurrence: undefined } : t)),
    );
    setSelectedIds(new Set());
    toast.success(`Cleared recurrence from ${selectedIds.size} transaction(s)`);
  }, [selectedIds]);

  const handleCategorySave = useCallback(
    (data: NewCategory | { id: string; update: UpdateCategory }) => {
      if ("name" in data && !("id" in data)) {
        createCategoryMutation.mutate(data as NewCategory, {
          onSuccess: () => {
            setCreateCategoryOpen(false);
          },
        });
      }
    },
    [createCategoryMutation],
  );

  const handleSubcategorySave = useCallback(
    (data: NewCategory | { id: string; update: UpdateCategory }) => {
      if ("name" in data && !("id" in data)) {
        createCategoryMutation.mutate(data as NewCategory, {
          onSuccess: () => {
            setCreateSubcategoryOpen(false);
            setSelectedParentCategory(null);
          },
        });
      }
    },
    [createCategoryMutation],
  );

  const handleRuleSave = useCallback(
    (data: NewActivityRule | { id: string; update: UpdateActivityRule }) => {
      if ("pattern" in data && !("id" in data)) {
        createRuleMutation.mutate(data as NewActivityRule, {
          onSuccess: () => {
            setCreateRuleOpen(false);
            toast.success("Rule created successfully");
          },
        });
      }
    },
    [createRuleMutation],
  );

  const handleEventCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENTS] });
  }, [queryClient]);

  const handleNext = useCallback(() => {
    onNext(localTransactions);
  }, [localTransactions, onNext]);

  const selectedCount = selectedIds.size;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">Categorized</span>
          <Badge variant="secondary" className="text-xs">
            {categorizedCount}
          </Badge>
        </div>
        <div className="bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">Uncategorized</span>
          <Badge variant="secondary" className="text-xs">
            {uncategorizedCount}
          </Badge>
        </div>
        <div className="bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">With Events</span>
          <Badge variant="secondary" className="text-xs">
            {withEventsCount}
          </Badge>
        </div>
        <div className="bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">Without Events</span>
          <Badge variant="secondary" className="text-xs">
            {withoutEventsCount}
          </Badge>
        </div>
        <div className="bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">With Recurrence</span>
          <Badge variant="secondary" className="text-xs">
            {withRecurrenceCount}
          </Badge>
        </div>
        <div className="bg-muted/30 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-xs">No Recurrence</span>
          <Badge variant="secondary" className="text-xs">
            {withoutRecurrenceCount}
          </Badge>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="relative">
          <Icons.Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-[250px] pl-7 text-xs lg:w-[350px]"
          />
        </div>

        <div className="flex items-center gap-2">
          {pendingFilterChanges > 0 && (
            <Button
              onClick={applyFilterRefresh}
              variant="outline"
              size="sm"
              className="relative shrink-0"
            >
              <Icons.Refresh className="mr-1 h-3.5 w-3.5" />
              Refresh
              <Badge
                variant="secondary"
                className="bg-primary text-primary-foreground absolute -top-2 -right-2 h-5 min-w-5 px-1 text-xs"
              >
                {pendingFilterChanges}
              </Badge>
            </Button>
          )}

          <Button
            onClick={applyRules}
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={isApplyingRules}
          >
            {isApplyingRules ? (
              <Icons.Spinner className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icons.Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            Apply Rules
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                New
                <Icons.ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setCreateCategoryOpen(true)}>
                <Icons.Tag className="mr-2 h-4 w-4" />
                New Category
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectParentCategoryOpen(true)}>
                <Icons.Tag className="mr-2 h-4 w-4" />
                New Subcategory
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateRuleOpen(true)}>
                <Icons.ListFilter className="mr-2 h-4 w-4" />
                New Rule
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateEventOpen(true)}>
                <Icons.Calendar className="mr-2 h-4 w-4" />
                New Event
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setManageCategoriesOpen(true)}>
                <Icons.Settings className="mr-2 h-4 w-4" />
                Manage Categories...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setManageRulesOpen(true)}>
                <Icons.Settings className="mr-2 h-4 w-4" />
                Manage Rules...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setManageEventsOpen(true)}>
                <Icons.Settings className="mr-2 h-4 w-4" />
                Manage Events...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DataTableFacetedFilter
          title="Account"
          options={filterAccountOptions}
          selectedValues={selectedAccountIds}
          onFilterChange={setSelectedAccountIds}
        />

        <DataTableFacetedFilter
          title="Type"
          options={filterActivityTypeOptions}
          selectedValues={selectedActivityTypes}
          onFilterChange={setSelectedActivityTypes}
        />

        <DataTableFacetedFilter
          title="Category"
          options={filterCategoryOptions}
          selectedValues={
            new Set([
              ...selectedCategoryIds,
              ...Array.from(selectedCategorizationStatuses).filter((s) =>
                CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number]),
              ),
            ])
          }
          onFilterChange={(values) => {
            const allValues = Array.from(values);
            const statusValues = allValues.filter((v) =>
              CATEGORY_STATUS_VALUES.includes(v as (typeof CATEGORY_STATUS_VALUES)[number]),
            ) as CategorizationStatus[];
            const newCategoryIds = allValues.filter(
              (v) => !CATEGORY_STATUS_VALUES.includes(v as (typeof CATEGORY_STATUS_VALUES)[number]),
            );

            setSelectedCategoryIds(new Set(newCategoryIds));

            const eventStatuses = Array.from(selectedCategorizationStatuses).filter((s) =>
              EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number]),
            );
            setSelectedCategorizationStatuses(
              new Set([...statusValues, ...eventStatuses] as CategorizationStatus[]),
            );

            if (newCategoryIds.length === 0) {
              setSelectedSubCategoryIds(new Set());
            } else {
              const validSubCategories = new Set<string>();
              selectedSubCategoryIds.forEach((subId) => {
                categories.some((cat) => {
                  if (
                    newCategoryIds.includes(cat.id) &&
                    cat.children?.some((child) => child.id === subId)
                  ) {
                    validSubCategories.add(subId);
                    return true;
                  }
                  return false;
                });
              });
              if (validSubCategories.size !== selectedSubCategoryIds.size) {
                setSelectedSubCategoryIds(validSubCategories);
              }
            }
          }}
        />

        <DataTableFacetedFilter
          title="Subcategory"
          options={filterSubCategoryOptions}
          selectedValues={selectedSubCategoryIds}
          onFilterChange={setSelectedSubCategoryIds}
          disabled={selectedCategoryIds.size === 0}
        />

        <DataTableFacetedFilter
          title="Event"
          options={filterEventOptions}
          selectedValues={
            new Set([
              ...selectedEventIds,
              ...Array.from(selectedCategorizationStatuses).filter((s) =>
                EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number]),
              ),
            ])
          }
          onFilterChange={(values) => {
            const allValues = Array.from(values);
            const statusValues = allValues.filter((v) =>
              EVENT_STATUS_VALUES.includes(v as (typeof EVENT_STATUS_VALUES)[number]),
            ) as CategorizationStatus[];
            const newEventIds = allValues.filter(
              (v) => !EVENT_STATUS_VALUES.includes(v as (typeof EVENT_STATUS_VALUES)[number]),
            );

            setSelectedEventIds(new Set(newEventIds));

            const categoryStatuses = Array.from(selectedCategorizationStatuses).filter((s) =>
              CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number]),
            );
            setSelectedCategorizationStatuses(
              new Set([...categoryStatuses, ...statusValues] as CategorizationStatus[]),
            );
          }}
        />

        <DataTableFacetedFilter
          title="Recurrence"
          options={filterRecurrenceOptions}
          selectedValues={
            new Set([
              ...selectedRecurrenceTypes,
              ...Array.from(selectedCategorizationStatuses).filter((s) =>
                RECURRENCE_STATUS_VALUES.includes(s as (typeof RECURRENCE_STATUS_VALUES)[number]),
              ),
            ])
          }
          onFilterChange={(values) => {
            const allValues = Array.from(values);
            const statusValues = allValues.filter((v) =>
              RECURRENCE_STATUS_VALUES.includes(v as (typeof RECURRENCE_STATUS_VALUES)[number]),
            ) as CategorizationStatus[];
            const newRecurrenceTypes = allValues.filter(
              (v) =>
                !RECURRENCE_STATUS_VALUES.includes(v as (typeof RECURRENCE_STATUS_VALUES)[number]),
            );

            setSelectedRecurrenceTypes(new Set(newRecurrenceTypes));

            const otherStatuses = Array.from(selectedCategorizationStatuses).filter(
              (s) =>
                CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number]) ||
                EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number]),
            );
            setSelectedCategorizationStatuses(
              new Set([...otherStatuses, ...statusValues] as CategorizationStatus[]),
            );
          }}
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 border-dashed ${hasAmountFilter ? "border-primary" : ""}`}
            >
              <Icons.DollarSign className="mr-2 h-4 w-4" />
              Amount
              {hasAmountFilter && (
                <span className="ml-2 text-xs">
                  {amountRange.min && amountRange.max
                    ? `${amountRange.min} - ${amountRange.max}`
                    : amountRange.min
                      ? `≥ ${amountRange.min}`
                      : `≤ ${amountRange.max}`}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60" align="start">
            <div className="space-y-3">
              <p className="text-sm font-medium">Filter by Amount</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={amountRange.min}
                  onChange={(e) => setAmountRange({ ...amountRange, min: e.target.value })}
                  className="h-8"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={amountRange.max}
                  onChange={(e) => setAmountRange({ ...amountRange, max: e.target.value })}
                  className="h-8"
                />
              </div>
              {hasAmountFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => setAmountRange({ min: "", max: "" })}
                >
                  Clear
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearAllFilters}>
            Reset
            <Icons.Close className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="bg-primary/5 mb-3 flex items-center gap-2 rounded-md border px-2.5 py-1.5">
          <Badge variant="secondary" className="text-xs">
            {selectedCount} selected
          </Badge>

          <div className="bg-border mx-1 h-4 w-px" />

          <Button onClick={() => setBulkActivityTypeModalOpen(true)} variant="outline" size="xs">
            <Icons.ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            Type
          </Button>
          <Button onClick={() => setBulkCategoryModalOpen(true)} variant="outline" size="xs">
            <Icons.Tag className="mr-1 h-3.5 w-3.5" />
            Category
          </Button>
          <Button onClick={() => setBulkEventModalOpen(true)} variant="outline" size="xs">
            <Icons.Calendar className="mr-1 h-3.5 w-3.5" />
            Event
          </Button>
          <Button onClick={() => setBulkRecurrenceModalOpen(true)} variant="outline" size="xs">
            <Icons.Refresh className="mr-1 h-3.5 w-3.5" />
            Recurrence
          </Button>

          <div className="bg-border mx-1 h-4 w-px" />

          <Button onClick={resetSelected} variant="ghost" size="xs">
            <Icons.Undo className="mr-1 h-3.5 w-3.5" />
            Reset
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs">
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

          <Button onClick={deleteSelected} variant="destructive" size="xs">
            <Icons.Trash className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>

          <Button onClick={clearSelection} variant="ghost" size="xs" className="ml-auto">
            Deselect
          </Button>
        </div>
      )}

      <div className="bg-background flex-1 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted-foreground/5 sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-muted/30 h-9 w-12 border-r px-0 py-0">
                <div className="flex h-full items-center justify-center">
                  <Checkbox
                    checked={
                      displayedTransactions.length > 0 &&
                      selectedIds.size === displayedTransactions.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </div>
              </TableHead>
              <TableHead className="bg-muted/30 h-9 w-[80px] border-r px-2 py-1.5 text-xs font-semibold">
                Type
              </TableHead>
              <TableHead className="bg-muted/30 h-9 w-[130px] border-r px-2 py-1.5 text-xs font-semibold">
                Date
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[150px] border-r px-2 py-1.5 text-xs font-semibold">
                Name
              </TableHead>
              <TableHead className="bg-muted/30 h-9 w-[100px] border-r px-2 py-1.5 text-right text-xs font-semibold">
                Amount
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[150px] border-r px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
                Account
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[150px] border-r px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
                Category
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[150px] border-r px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
                Subcategory
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[150px] border-r px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
                Applied Rule
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[150px] border-r px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
                Event
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[100px] border-r px-2 py-1.5 text-xs font-semibold whitespace-nowrap">
                Recurrence
              </TableHead>
              <TableHead className="bg-muted/30 h-9 min-w-[120px] border-r px-2 py-1.5 text-xs font-semibold">
                Description
              </TableHead>
              <TableHead className="bg-muted/30 h-9 px-2 py-1.5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-muted-foreground h-32 text-center">
                  No transactions match your filters.
                </TableCell>
              </TableRow>
            ) : (
              displayedTransactions.map((transaction) => (
                <ImportTransactionRow
                  key={transaction.lineNumber}
                  transaction={transaction}
                  accountCurrency={accountCurrency}
                  defaultAccountId={accountId}
                  activityTypeOptions={activityTypeOptions}
                  categoryOptions={allCategoryOptions}
                  categoryLookup={categoryLookup}
                  subcategoryLookup={subcategoryLookup}
                  getSubcategoryOptions={getSubcategoryOptions}
                  eventOptions={eventOptions}
                  eventLookup={eventLookup}
                  recurrenceOptions={recurrenceOptions}
                  accountOptions={accountOptions}
                  accountLookup={accountLookup}
                  isSelected={selectedIds.has(transaction.lineNumber)}
                  isModified={isTransactionModified(transaction.lineNumber)}
                  focusedField={
                    focusedCell?.rowId === transaction.lineNumber ? focusedCell.field : null
                  }
                  onToggleSelect={toggleSelect}
                  onUpdateTransaction={updateTransaction}
                  onDelete={deleteRow}
                  onReset={resetTransaction}
                  onNavigate={handleCellNavigation}
                  setFocusedCell={setFocusedCell}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleNext}>
          Next
          <Icons.ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <BulkActivityTypeAssignModal
        open={bulkActivityTypeModalOpen}
        onClose={() => setBulkActivityTypeModalOpen(false)}
        onAssign={bulkAssignActivityType}
        selectedCount={selectedCount}
      />

      <BulkCategoryAssignModal
        open={bulkCategoryModalOpen}
        onClose={() => setBulkCategoryModalOpen(false)}
        categories={categories}
        onAssign={bulkAssignCategory}
        selectedCount={selectedCount}
      />

      <BulkEventAssignModal
        open={bulkEventModalOpen}
        onClose={() => setBulkEventModalOpen(false)}
        events={events}
        onAssign={bulkAssignEvent}
        selectedCount={selectedCount}
      />

      <BulkRecurrenceAssignModal
        open={bulkRecurrenceModalOpen}
        onClose={() => setBulkRecurrenceModalOpen(false)}
        onAssign={bulkAssignRecurrence}
        selectedCount={selectedCount}
      />

      <CategoryEditModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        onSave={handleCategorySave}
        isLoading={createCategoryMutation.isPending}
      />

      <EventFormDialog
        eventTypes={eventTypes}
        open={createEventOpen}
        onOpenChange={(open: boolean) => {
          setCreateEventOpen(open);
          if (!open) handleEventCreated();
        }}
      />

      <SelectParentCategoryModal
        open={selectParentCategoryOpen}
        onClose={() => setSelectParentCategoryOpen(false)}
        categories={categories}
        onSelect={(category) => {
          setSelectedParentCategory(category);
          setSelectParentCategoryOpen(false);
          setCreateSubcategoryOpen(true);
        }}
      />

      <CategoryEditModal
        open={createSubcategoryOpen}
        onClose={() => {
          setCreateSubcategoryOpen(false);
          setSelectedParentCategory(null);
        }}
        parentCategory={selectedParentCategory ?? undefined}
        onSave={handleSubcategorySave}
        isLoading={createCategoryMutation.isPending}
      />

      <RuleEditModal
        open={createRuleOpen}
        onClose={() => setCreateRuleOpen(false)}
        categories={categories}
        onSave={handleRuleSave}
        isLoading={createRuleMutation.isPending}
      />

      <ManageCategoriesDialog
        open={manageCategoriesOpen}
        onClose={() => setManageCategoriesOpen(false)}
      />

      <ManageRulesDialog open={manageRulesOpen} onClose={() => setManageRulesOpen(false)} />

      <ManageEventsDialog open={manageEventsOpen} onClose={() => setManageEventsOpen(false)} />
    </div>
  );
}

interface ImportTransactionRowProps {
  transaction: CashImportRow;
  accountCurrency: string;
  defaultAccountId: string;
  activityTypeOptions: { value: string; label: string; searchValue?: string }[];
  categoryOptions: { value: string; label: string; searchValue?: string }[];
  categoryLookup: Map<string, CategoryWithChildren>;
  subcategoryLookup: Map<string, { name: string; parentId: string }>;
  getSubcategoryOptions: (
    categoryId: string | undefined,
  ) => { value: string; label: string; searchValue?: string }[];
  eventOptions: { value: string; label: string; searchValue?: string }[];
  eventLookup: Map<string, Event>;
  recurrenceOptions: { value: string; label: string; searchValue?: string }[];
  accountOptions: { value: string; label: string; searchValue?: string }[];
  accountLookup: Map<string, Account>;
  isSelected: boolean;
  isModified: boolean;
  focusedField: EditableField | null;
  onToggleSelect: (lineNumber: number) => void;
  onUpdateTransaction: (lineNumber: number, field: EditableField, value: string) => void;
  onDelete: (lineNumber: number) => void;
  onReset: (lineNumber: number) => void;
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  setFocusedCell: Dispatch<SetStateAction<CellCoordinate | null>>;
}

const ImportTransactionRow = memo(
  function ImportTransactionRow({
    transaction,
    accountCurrency,
    defaultAccountId,
    activityTypeOptions,
    categoryOptions,
    categoryLookup,
    subcategoryLookup,
    getSubcategoryOptions,
    eventOptions,
    eventLookup,
    recurrenceOptions,
    accountOptions,
    accountLookup,
    isSelected,
    isModified,
    focusedField,
    onToggleSelect,
    onUpdateTransaction,
    onDelete,
    onReset,
    onNavigate,
    setFocusedCell,
  }: ImportTransactionRowProps) {
    const handleFocus = useCallback(
      (field: EditableField) => {
        setFocusedCell({ rowId: transaction.lineNumber, field });
      },
      [setFocusedCell, transaction.lineNumber],
    );

    const categoryName = transaction.categoryId
      ? categoryLookup.get(transaction.categoryId)?.name
      : undefined;
    const subcategoryName = transaction.subCategoryId
      ? subcategoryLookup.get(transaction.subCategoryId)?.name
      : undefined;
    const eventName = transaction.eventId ? eventLookup.get(transaction.eventId)?.name : undefined;

    const effectiveAccountId = transaction.accountId || defaultAccountId;
    const accountName = effectiveAccountId
      ? accountLookup.get(effectiveAccountId)?.name
      : undefined;

    const amountDisplay = formatAmountDisplay(transaction.amount, accountCurrency);
    const dateValue = transaction.date ? formatDateTimeLocal(new Date(transaction.date)) : "";
    const dateDisplay = transaction.date ? formatDateTimeDisplay(new Date(transaction.date)) : "";

    return (
      <TableRow
        className={cn(
          "group hover:bg-muted/40",
          isSelected && "bg-muted/60",
          !transaction.categoryId && "bg-amber-50/30 dark:bg-amber-950/10",
        )}
      >
        <TableCell className="h-9 w-12 border-r px-0 py-0 text-center">
          <div className="flex h-full items-center justify-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(transaction.lineNumber)}
            />
          </div>
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.activityType}
            options={activityTypeOptions}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "activityType", value)}
            onFocus={() => handleFocus("activityType")}
            onNavigate={onNavigate}
            isFocused={focusedField === "activityType"}
            renderValue={(value) => (
              <ActivityTypeBadge type={value as ActivityType} className="text-xs" />
            )}
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <EditableCell
            value={dateValue}
            displayValue={dateDisplay}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "date", value)}
            onFocus={() => handleFocus("date")}
            onNavigate={onNavigate}
            isFocused={focusedField === "date"}
            type="datetime-local"
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <EditableCell
            value={transaction.name}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "name", value)}
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
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "amount", value)}
            onFocus={() => handleFocus("amount")}
            onNavigate={onNavigate}
            isFocused={focusedField === "amount"}
            type="number"
            inputMode="decimal"
            step="0.01"
            className="justify-end text-right font-mono text-xs tabular-nums"
          />
        </TableCell>
        <TableCell className="h-9 min-w-[150px] border-r px-0 py-0">
          <SelectCell
            value={effectiveAccountId}
            options={accountOptions}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "accountId", value)}
            onFocus={() => handleFocus("accountId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "accountId"}
            renderValue={() => accountName || ""}
            className="text-xs whitespace-nowrap"
          />
        </TableCell>
        <TableCell className="h-9 min-w-[150px] border-r px-0 py-0">
          <SelectCell
            value={transaction.categoryId ?? ""}
            options={categoryOptions}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "categoryId", value)}
            onFocus={() => handleFocus("categoryId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "categoryId"}
            renderValue={() => categoryName || ""}
            className="text-xs whitespace-nowrap"
          />
        </TableCell>
        <TableCell className="h-9 min-w-[150px] border-r px-0 py-0">
          <SelectCell
            value={transaction.subCategoryId ?? ""}
            options={getSubcategoryOptions(transaction.categoryId)}
            onChange={(value) =>
              onUpdateTransaction(transaction.lineNumber, "subCategoryId", value)
            }
            onFocus={() => handleFocus("subCategoryId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "subCategoryId"}
            renderValue={() => subcategoryName || ""}
            className="text-xs whitespace-nowrap"
            disabled={!transaction.categoryId}
          />
        </TableCell>
        <TableCell className="text-muted-foreground h-9 border-r px-2 py-0 text-xs">
          {transaction.matchedRuleName ? (
            <span className="truncate" title={transaction.matchedRuleName}>
              {transaction.matchedRuleName}
            </span>
          ) : (
            "-"
          )}
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.eventId ?? ""}
            options={eventOptions}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "eventId", value)}
            onFocus={() => handleFocus("eventId")}
            onNavigate={onNavigate}
            isFocused={focusedField === "eventId"}
            renderValue={() => eventName || ""}
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <SelectCell
            value={transaction.recurrence ?? ""}
            options={recurrenceOptions}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "recurrence", value)}
            onFocus={() => handleFocus("recurrence")}
            onNavigate={onNavigate}
            isFocused={focusedField === "recurrence"}
            renderValue={(value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "")}
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 border-r px-0 py-0">
          <EditableCell
            value={transaction.description || ""}
            onChange={(value) => onUpdateTransaction(transaction.lineNumber, "description", value)}
            onFocus={() => handleFocus("description")}
            onNavigate={onNavigate}
            isFocused={focusedField === "description"}
            className="text-xs"
          />
        </TableCell>
        <TableCell className="h-9 px-2 py-0">
          <div className="pointer-events-none flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
            {isModified && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onReset(transaction.lineNumber)}
                title="Reset to original"
              >
                <Icons.Undo className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive h-6 w-6"
              onClick={() => onDelete(transaction.lineNumber)}
              title="Delete"
            >
              <Icons.Trash className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  },
  function areEqualProps(prev, next) {
    return (
      prev.transaction === next.transaction &&
      prev.isSelected === next.isSelected &&
      prev.isModified === next.isModified &&
      prev.focusedField === next.focusedField &&
      prev.accountCurrency === next.accountCurrency &&
      prev.activityTypeOptions === next.activityTypeOptions &&
      prev.categoryOptions === next.categoryOptions &&
      prev.categoryLookup === next.categoryLookup &&
      prev.subcategoryLookup === next.subcategoryLookup &&
      prev.getSubcategoryOptions === next.getSubcategoryOptions &&
      prev.eventOptions === next.eventOptions &&
      prev.eventLookup === next.eventLookup &&
      prev.recurrenceOptions === next.recurrenceOptions
    );
  },
);

interface BulkActivityTypeAssignModalProps {
  open: boolean;
  onClose: () => void;
  onAssign: (activityType: ActivityType) => void;
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
  const handleSelect = (type: ActivityType) => {
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
          <DialogDescription>Select a recurrence type to assign.</DialogDescription>
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

interface SelectParentCategoryModalProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryWithChildren[];
  onSelect: (category: Category) => void;
}

function SelectParentCategoryModal({
  open,
  onClose,
  categories,
  onSelect,
}: SelectParentCategoryModalProps) {
  const [selectedCat, setSelectedCat] = useState("");

  const handleSelect = () => {
    const category = categories.find((c) => c.id === selectedCat);
    if (category) {
      onSelect(category);
      setSelectedCat("");
    }
  };

  const handleClose = () => {
    setSelectedCat("");
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Parent Category</DialogTitle>
          <DialogDescription>Choose a category to add a subcategory under.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="mb-1 block text-sm font-medium">Category</label>
          <Select value={selectedCat} onValueChange={setSelectedCat}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
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
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!selectedCat}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
