import { getCategoriesHierarchical } from "@/commands/category";
import { bulkApplyCategoryRules } from "@/commands/category-rule";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  NewCategoryRule,
  UpdateCategory,
  UpdateCategoryRule,
} from "@/lib/types";
import { cn, formatDateTimeDisplay, formatDateTimeLocal } from "@/lib/utils";
import { EditableCell } from "@/pages/activity/components/activity-datagrid/editable-cell";
import { SelectCell } from "@/pages/activity/components/activity-datagrid/select-cell";
import { ActivityTypeBadge } from "@/pages/activity/components/activity-type-badge";
import { CategoryEditModal } from "@/pages/settings/categories/components/category-edit-modal";
import { useCategoryMutations } from "@/pages/settings/categories/use-category-mutations";
import { RuleEditModal } from "@/pages/settings/category-rules/components/rule-edit-modal";
import { useCategoryRuleMutations } from "@/pages/settings/category-rules/use-category-rule-mutations";
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

type EditableField =
  | "activityType"
  | "date"
  | "name"
  | "amount"
  | "accountId"
  | "categoryId"
  | "subCategoryId"
  | "eventId"
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
  "description",
];

type FilterType = "all" | "categorized" | "uncategorized" | "with-events" | "without-events";

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
  const { createRuleMutation } = useCategoryRuleMutations();
  const [localTransactions, setLocalTransactions] = useState<CashImportRow[]>(initialTransactions);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [focusedCell, setFocusedCell] = useState<CellCoordinate | null>(null);
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  // Manual filter refresh state - transactions stay visible until user clicks refresh
  const [displayedTransactions, setDisplayedTransactions] = useState<CashImportRow[]>([]);
  const [pendingFilterChanges, setPendingFilterChanges] = useState(0);
  const [lastAppliedFilter, setLastAppliedFilter] = useState<{
    filter: FilterType;
    searchQuery: string;
  }>({ filter: "all", searchQuery: "" });

  // Modal states
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkEventModalOpen, setBulkEventModalOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [selectParentCategoryOpen, setSelectParentCategoryOpen] = useState(false);
  const [createSubcategoryOpen, setCreateSubcategoryOpen] = useState(false);
  const [selectedParentCategory, setSelectedParentCategory] = useState<Category | null>(null);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);

  // Manage dialogs state
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [manageRulesOpen, setManageRulesOpen] = useState(false);
  const [manageEventsOpen, setManageEventsOpen] = useState(false);

  // Get account info
  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);
  const accountCurrency = account?.currency ?? "USD";

  // Fetch categories and events
  const { data: categories = [] } = useQuery<CategoryWithChildren[]>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: [QueryKeys.EVENTS],
    queryFn: getEvents,
  });

  const { data: eventTypes = [] } = useQuery<EventType[]>({
    queryKey: [QueryKeys.EVENT_TYPES],
    queryFn: getEventTypes,
  });

  // Activity type options
  const activityTypeOptions = useMemo(
    () => [
      { value: ActivityType.DEPOSIT, label: "Deposit", searchValue: "Deposit Income" },
      { value: ActivityType.WITHDRAWAL, label: "Withdrawal", searchValue: "Withdrawal Expense" },
      { value: ActivityType.TRANSFER_IN, label: "Transfer In", searchValue: "Transfer In" },
      { value: ActivityType.TRANSFER_OUT, label: "Transfer Out", searchValue: "Transfer Out" },
    ],
    [],
  );

  // Category options with colored +/- indicator for income/expense
  const categoryOptions = useMemo(
    () =>
      categories.map((cat) => ({
        value: cat.id,
        label: cat.name,
        searchValue: cat.name,
        isIncome: !!cat.isIncome,
      })),
    [categories],
  );

  // Category lookup
  const categoryLookup = useMemo(
    () => new Map(categories.map((cat) => [cat.id, cat])),
    [categories],
  );

  // Subcategory lookup
  const subcategoryLookup = useMemo(() => {
    const map = new Map<string, { name: string; parentId: string }>();
    categories.forEach((cat) => {
      cat.children?.forEach((sub) => {
        map.set(sub.id, { name: sub.name, parentId: cat.id });
      });
    });
    return map;
  }, [categories]);

  // Get subcategory options filtered by category
  const getSubcategoryOptions = useCallback(
    (categoryId: string | undefined) => {
      if (!categoryId) return [];
      const category = categoryLookup.get(categoryId);
      return (category?.children ?? []).map((sub) => ({
        value: sub.id,
        label: sub.name,
        searchValue: sub.name,
      }));
    },
    [categoryLookup],
  );

  // Event options
  const eventOptions = useMemo(
    () =>
      events.map((event) => ({
        value: event.id,
        label: event.name,
        searchValue: event.name,
      })),
    [events],
  );

  // Event lookup
  const eventLookup = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);

  // Account options
  const accountOptions = useMemo(
    () =>
      accounts.map((acc) => ({
        value: acc.id,
        label: acc.name,
        searchValue: acc.name,
      })),
    [accounts],
  );

  // Account lookup
  const accountLookup = useMemo(() => new Map(accounts.map((acc) => [acc.id, acc])), [accounts]);

  // Stats
  const categorizedCount = localTransactions.filter((t) => t.categoryId).length;
  const uncategorizedCount = localTransactions.filter((t) => !t.categoryId).length;
  const withEventsCount = localTransactions.filter((t) => t.eventId).length;
  const withoutEventsCount = localTransactions.filter((t) => !t.eventId).length;

  // Helper function to compute filtered transactions based on filter settings
  const computeFilteredTransactions = useCallback(
    (transactions: CashImportRow[], filterType: FilterType, query: string) => {
      let result = transactions;

      // Apply filter
      switch (filterType) {
        case "categorized":
          result = result.filter((t) => t.categoryId);
          break;
        case "uncategorized":
          result = result.filter((t) => !t.categoryId);
          break;
        case "with-events":
          result = result.filter((t) => t.eventId);
          break;
        case "without-events":
          result = result.filter((t) => !t.eventId);
          break;
      }

      // Apply search
      if (query.trim()) {
        const q = query.toLowerCase();
        result = result.filter(
          (t) => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
        );
      }

      return result;
    },
    [],
  );

  // Apply filter refresh - called on initial load and when user clicks refresh
  const applyFilterRefresh = useCallback(() => {
    const newDisplayed = computeFilteredTransactions(localTransactions, filter, searchQuery);
    setDisplayedTransactions(newDisplayed);
    setLastAppliedFilter({ filter, searchQuery });
    setPendingFilterChanges(0);
  }, [localTransactions, filter, searchQuery, computeFilteredTransactions]);

  // Initialize displayed transactions on first load
  useEffect(() => {
    if (displayedTransactions.length === 0 && localTransactions.length > 0) {
      applyFilterRefresh();
    }
  }, [localTransactions, displayedTransactions.length, applyFilterRefresh]);

  // Track when filter settings change (but don't auto-apply)
  useEffect(() => {
    if (filter !== lastAppliedFilter.filter || searchQuery !== lastAppliedFilter.searchQuery) {
      // Immediately apply filter changes
      applyFilterRefresh();
    }
  }, [filter, searchQuery, lastAppliedFilter, applyFilterRefresh]);

  // Track pending changes when transactions are modified (rows that would be filtered out)
  useEffect(() => {
    // Count how many displayed transactions no longer match the current filter
    const wouldBeFilteredOut = displayedTransactions.filter((displayed) => {
      const current = localTransactions.find((t) => t.lineNumber === displayed.lineNumber);
      if (!current) return true; // Deleted

      // Check if it would pass the current filter
      switch (lastAppliedFilter.filter) {
        case "categorized":
          return !current.categoryId;
        case "uncategorized":
          return !!current.categoryId;
        case "with-events":
          return !current.eventId;
        case "without-events":
          return !!current.eventId;
        default:
          return false;
      }
    }).length;

    setPendingFilterChanges(wouldBeFilteredOut);
  }, [localTransactions, displayedTransactions, lastAppliedFilter.filter]);

  // Update displayed transactions in place when underlying data changes (preserving visibility)
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

  // For navigation purposes, use displayed transactions
  const filteredTransactionsRef = useRef(displayedTransactions);
  useEffect(() => {
    filteredTransactionsRef.current = displayedTransactions;
  }, [displayedTransactions]);

  // Navigation
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

  // Update transaction
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
          } else if (field === "categoryId") {
            updated.categoryId = value || undefined;
            // Clear subcategory when category changes
            updated.subCategoryId = undefined;
            // Mark as manual override
            updated.isManualOverride = true;
            updated.matchedRuleId = undefined;
            updated.matchedRuleName = undefined;
          } else if (field === "subCategoryId") {
            updated.subCategoryId = value || undefined;
            updated.isManualOverride = true;
          } else if (field === "eventId") {
            updated.eventId = value || undefined;
          } else if (field === "description") {
            updated.description = value;
          }

          return updated;
        }),
      );
    },
    [],
  );

  // Selection handlers
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

  // Delete row
  const deleteRow = useCallback((lineNumber: number) => {
    setLocalTransactions((prev) => prev.filter((t) => t.lineNumber !== lineNumber));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(lineNumber);
      return next;
    });
  }, []);

  // Delete selected
  const deleteSelected = useCallback(() => {
    setLocalTransactions((prev) => prev.filter((t) => !selectedIds.has(t.lineNumber)));
    setSelectedIds(new Set());
    toast.success(`Deleted ${selectedIds.size} transaction(s)`);
  }, [selectedIds]);

  // Apply rules
  const applyRules = useCallback(async () => {
    setIsApplyingRules(true);
    try {
      // Build list of transactions to apply rules to (exclude manual overrides)
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

      // Call bulk apply
      const results = await bulkApplyCategoryRules(
        transactionsToApply.map((t) => ({ name: t.name, accountId: t.accountId })),
      );

      // Create a map of lineNumber -> result for correct lookup
      const resultMap = new Map<number, (typeof results)[number]>();
      transactionsToApply.forEach((t, index) => {
        if (results[index]) {
          resultMap.set(t.lineNumber, results[index]);
        }
      });

      // Update transactions with results
      let appliedCount = 0;
      setLocalTransactions((prev) =>
        prev.map((t) => {
          if (t.isManualOverride) return t;

          const result = resultMap.get(t.lineNumber);
          if (result && result.categoryId) {
            appliedCount++;
            return {
              ...t,
              categoryId: result.categoryId,
              subCategoryId: result.subCategoryId || undefined,
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

  // Bulk assign category
  const bulkAssignCategory = useCallback(
    (categoryId: string, subCategoryId?: string) => {
      setLocalTransactions((prev) =>
        prev.map((t) =>
          selectedIds.has(t.lineNumber)
            ? {
                ...t,
                categoryId,
                subCategoryId,
                matchedRuleId: undefined,
                matchedRuleName: undefined,
                isManualOverride: true,
              }
            : t,
        ),
      );
      setSelectedIds(new Set());
      setBulkCategoryModalOpen(false);
      toast.success(`Category assigned to ${selectedIds.size} transaction(s)`);
    },
    [selectedIds],
  );

  // Bulk assign event
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

  // Clear all categories
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

  // Clear all events
  const clearAllEvents = useCallback(() => {
    setLocalTransactions((prev) =>
      prev.map((t) => (selectedIds.has(t.lineNumber) ? { ...t, eventId: undefined } : t)),
    );
    setSelectedIds(new Set());
    toast.success(`Cleared events from ${selectedIds.size} transaction(s)`);
  }, [selectedIds]);

  // Handle category save (from CategoryEditModal)
  const handleCategorySave = useCallback(
    (data: NewCategory | { id: string; update: UpdateCategory }) => {
      // Only handle create since we're not editing existing categories
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

  // Handle subcategory save
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

  // Handle rule save
  const handleRuleSave = useCallback(
    (data: NewCategoryRule | { id: string; update: UpdateCategoryRule }) => {
      if ("pattern" in data && !("id" in data)) {
        createRuleMutation.mutate(data as NewCategoryRule, {
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

  // Handle next
  const handleNext = useCallback(() => {
    onNext(localTransactions);
  }, [localTransactions, onNext]);

  const selectedCount = selectedIds.size;

  return (
    <div className="flex h-full flex-col">
      {/* Stats Bar */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
      </div>

      {/* Action Bar */}
      <div className="bg-muted/20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Icons.Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-[180px] pl-7 text-xs"
            />
          </div>

          {/* Filter */}
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
            <SelectTrigger className="h-7 w-[150px] text-xs">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({localTransactions.length})</SelectItem>
              <SelectItem value="categorized">Categorized ({categorizedCount})</SelectItem>
              <SelectItem value="uncategorized">Uncategorized ({uncategorizedCount})</SelectItem>
              <SelectItem value="with-events">With Events ({withEventsCount})</SelectItem>
              <SelectItem value="without-events">Without Events ({withoutEventsCount})</SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh Filter Button */}
          <Button
            onClick={applyFilterRefresh}
            variant="outline"
            size="xs"
            className="relative shrink-0"
          >
            <Icons.Refresh className="mr-1 h-3.5 w-3.5" />
            Refresh
            {pendingFilterChanges > 0 && (
              <Badge
                variant="secondary"
                className="bg-primary text-primary-foreground absolute -top-2 -right-2 h-5 min-w-5 px-1 text-xs"
              >
                {pendingFilterChanges}
              </Badge>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {/* Apply Rules */}
          <Button
            onClick={applyRules}
            variant="outline"
            size="xs"
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

          <div className="bg-border mx-1 h-4 w-px" />

          {/* Create/Manage dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="xs" className="shrink-0">
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

      {/* Selection Actions */}
      {selectedCount > 0 && (
        <div className="bg-primary/5 mb-3 flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5">
          <Badge variant="secondary" className="text-xs">
            {selectedCount} selected
          </Badge>

          <div className="bg-border mx-1 h-4 w-px" />

          <Button onClick={() => setBulkCategoryModalOpen(true)} variant="outline" size="xs">
            <Icons.Tag className="mr-1 h-3.5 w-3.5" />
            Assign Category
          </Button>
          <Button onClick={() => setBulkEventModalOpen(true)} variant="outline" size="xs">
            <Icons.Calendar className="mr-1 h-3.5 w-3.5" />
            Assign Event
          </Button>

          <div className="bg-border mx-1 h-4 w-px" />

          <Button onClick={clearAllCategories} variant="ghost" size="xs">
            <Icons.XCircle className="mr-1 h-3.5 w-3.5" />
            Clear Categories
          </Button>
          <Button onClick={clearAllEvents} variant="ghost" size="xs">
            <Icons.XCircle className="mr-1 h-3.5 w-3.5" />
            Clear Events
          </Button>

          <div className="bg-border mx-1 h-4 w-px" />

          <Button onClick={deleteSelected} variant="destructive" size="xs">
            <Icons.Trash className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>

          <Button onClick={clearSelection} variant="ghost" size="xs" className="ml-auto">
            Clear Selection
          </Button>
        </div>
      )}

      {/* Table */}
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
              <TableHead className="bg-muted/30 h-9 w-[100px] border-r px-2 py-1.5 text-xs font-semibold">
                Applied Rule
              </TableHead>
              <TableHead className="bg-muted/30 h-9 w-[120px] border-r px-2 py-1.5 text-xs font-semibold">
                Event
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
                <TableCell colSpan={11} className="text-muted-foreground h-32 text-center">
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
                  categoryOptions={categoryOptions}
                  categoryLookup={categoryLookup}
                  subcategoryLookup={subcategoryLookup}
                  getSubcategoryOptions={getSubcategoryOptions}
                  eventOptions={eventOptions}
                  eventLookup={eventLookup}
                  accountOptions={accountOptions}
                  accountLookup={accountLookup}
                  isSelected={selectedIds.has(transaction.lineNumber)}
                  focusedField={
                    focusedCell?.rowId === transaction.lineNumber ? focusedCell.field : null
                  }
                  onToggleSelect={toggleSelect}
                  onUpdateTransaction={updateTransaction}
                  onDelete={deleteRow}
                  onNavigate={handleCellNavigation}
                  setFocusedCell={setFocusedCell}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Navigation */}
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

      {/* Bulk Category Modal */}
      <BulkCategoryAssignModal
        open={bulkCategoryModalOpen}
        onClose={() => setBulkCategoryModalOpen(false)}
        categories={categories}
        onAssign={bulkAssignCategory}
        selectedCount={selectedCount}
      />

      {/* Bulk Event Modal */}
      <BulkEventAssignModal
        open={bulkEventModalOpen}
        onClose={() => setBulkEventModalOpen(false)}
        events={events}
        onAssign={bulkAssignEvent}
        selectedCount={selectedCount}
      />

      {/* Create Category Dialog */}
      <CategoryEditModal
        open={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        onSave={handleCategorySave}
        isLoading={createCategoryMutation.isPending}
      />

      {/* Create Event Dialog */}
      <EventFormDialog
        eventTypes={eventTypes}
        open={createEventOpen}
        onOpenChange={(open: boolean) => {
          setCreateEventOpen(open);
          if (!open) handleEventCreated();
        }}
      />

      {/* Select Parent Category Dialog (for subcategory creation) */}
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

      {/* Create Subcategory Dialog */}
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

      {/* Create Rule Dialog */}
      <RuleEditModal
        open={createRuleOpen}
        onClose={() => setCreateRuleOpen(false)}
        categories={categories}
        onSave={handleRuleSave}
        isLoading={createRuleMutation.isPending}
      />

      {/* Manage Categories Dialog */}
      <ManageCategoriesDialog
        open={manageCategoriesOpen}
        onClose={() => setManageCategoriesOpen(false)}
      />

      {/* Manage Rules Dialog */}
      <ManageRulesDialog
        open={manageRulesOpen}
        onClose={() => setManageRulesOpen(false)}
      />

      {/* Manage Events Dialog */}
      <ManageEventsDialog
        open={manageEventsOpen}
        onClose={() => setManageEventsOpen(false)}
      />
    </div>
  );
}

// Transaction Row Component
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
  accountOptions: { value: string; label: string; searchValue?: string }[];
  accountLookup: Map<string, Account>;
  isSelected: boolean;
  focusedField: EditableField | null;
  onToggleSelect: (lineNumber: number) => void;
  onUpdateTransaction: (lineNumber: number, field: EditableField, value: string) => void;
  onDelete: (lineNumber: number) => void;
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
    accountOptions,
    accountLookup,
    isSelected,
    focusedField,
    onToggleSelect,
    onUpdateTransaction,
    onDelete,
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

    // Get effective account ID (transaction's accountId or fall back to default)
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
      prev.focusedField === next.focusedField &&
      prev.accountCurrency === next.accountCurrency &&
      prev.activityTypeOptions === next.activityTypeOptions &&
      prev.categoryOptions === next.categoryOptions &&
      prev.categoryLookup === next.categoryLookup &&
      prev.subcategoryLookup === next.subcategoryLookup &&
      prev.getSubcategoryOptions === next.getSubcategoryOptions &&
      prev.eventOptions === next.eventOptions &&
      prev.eventLookup === next.eventLookup
    );
  },
);

// Bulk Category Assign Modal
interface BulkCategoryAssignModalProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryWithChildren[];
  onAssign: (categoryId: string, subCategoryId?: string) => void;
  selectedCount: number;
}

function BulkCategoryAssignModal({
  open,
  onClose,
  categories,
  onAssign,
  selectedCount,
}: BulkCategoryAssignModalProps) {
  const [selectedCat, setSelectedCat] = useState("");
  const [selectedSub, setSelectedSub] = useState("");

  const selectedCategory = categories.find((c) => c.id === selectedCat);
  const subCategories = selectedCategory?.children || [];

  const handleAssign = () => {
    if (selectedCat) {
      onAssign(selectedCat, selectedSub || undefined);
      setSelectedCat("");
      setSelectedSub("");
    }
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
            Select a category and optionally a subcategory to assign.
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
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    <span className="flex items-center gap-2">
                      <span className={`font-semibold ${cat.isIncome ? "text-success" : "text-destructive"}`}>
                        {cat.isIncome ? "+" : "−"}
                      </span>
                      {cat.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {subCategories.length > 0 && (
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

// Bulk Event Assign Modal
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

// Select Parent Category Modal (for subcategory creation)
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
                    <span className={`font-semibold ${cat.isIncome ? "text-success" : "text-destructive"}`}>
                      {cat.isIncome ? "+" : "−"}
                    </span>
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

