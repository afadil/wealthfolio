import {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { DataTableFacetedFilter } from "@/pages/activity/components/activity-datagrid/data-table-faceted-filter";
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";
import { Icons } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import type { Account, ActivityImport, CashImportRow, Category, CategoryWithChildren, Event } from "@/lib/types";
import { cn, formatDateTime, toPascalCase } from "@/lib/utils";
import { formatAmount } from "@wealthfolio/ui";
import { motion } from "motion/react";

// Helper function to check if a field has errors
const hasFieldError = (activity: ActivityImport | CashImportRow, fieldName: string): boolean => {
  return !!activity.errors && !!activity.errors[fieldName] && activity.errors[fieldName].length > 0;
};

// Helper function to get error message for a field
const getFieldErrorMessage = (activity: ActivityImport | CashImportRow, fieldName: string): string[] => {
  if (activity.errors?.[fieldName]) {
    return activity.errors[fieldName];
  }
  return [];
};

// Helper function to safely format numbers, handling NaN/null/undefined values
const safeFormatAmount = (value: number | null | undefined, currency: string): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return "-";
  }
  return formatAmount(value, currency);
};

// Enhanced error cell with improved tooltip behavior
const ErrorCell = ({
  hasError,
  errorMessages,
  children,
}: {
  hasError: boolean;
  errorMessages: string[];
  children: React.ReactNode;
}) => {
  if (!hasError) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={30}>
        <TooltipTrigger asChild>
          <div className="bg-destructive/10 absolute inset-0 cursor-help">
            <div className="relative flex h-full w-full items-center justify-between px-4 py-2">
              <div className="mr-2 flex-1">{children}</div>
              <Icons.AlertCircle className="text-destructive h-3.5 w-3.5 shrink-0" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-destructive text-destructive-foreground dark:border-destructive max-w-[400px] space-y-2 border-none p-3 shadow-lg">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {errorMessages.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Get activity type badge variant
const getTypeBadgeVariant = (type: ActivityType) => {
  switch (type) {
    case ActivityType.DEPOSIT:
    case ActivityType.TRANSFER_IN:
    case ActivityType.INTEREST:
      return "success";
    case ActivityType.WITHDRAWAL:
    case ActivityType.TRANSFER_OUT:
    case ActivityType.FEE:
    case ActivityType.TAX:
      return "destructive";
    default:
      return "secondary";
  }
};

// Props for the preview table
interface CashImportPreviewTableProps {
  activities: ActivityImport[];
  // Account data for filtering
  accounts?: Account[];
  // Optional props for editable mode (used in preview step)
  editable?: boolean;
  categories?: CategoryWithChildren[];
  categoryMap?: Map<string, Category>;
  events?: Event[];
  eventMap?: Map<string, Event>;
  onRowChange?: (lineNumber: number, updates: Partial<CashImportRow>) => void;
  // Optional selection props
  selectable?: boolean;
  selectedRows?: Set<number>;
  onSelectionChange?: (selectedRows: Set<number>) => void;
}

export const CashImportPreviewTable = ({
  activities,
  accounts = [],
  editable = false,
  categories = [],
  categoryMap,
  events = [],
  eventMap,
  onRowChange,
  selectable = false,
  selectedRows: externalSelectedRows,
  onSelectionChange,
}: CashImportPreviewTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: "lineNumber",
      desc: false,
    },
  ]);

  // Determine initial column filters based on whether activities have errors
  const initialColumnFilters = useMemo<ColumnFiltersState>(() => {
    const hasActivitiesWithErrors = activities.some((activity) => !activity.isValid);
    return hasActivitiesWithErrors ? [{ id: "isValid", value: ["false"] }] : [];
  }, [activities]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    lineNumber: false,
    validationErrors: false,
  });

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const [amountRange, setAmountRange] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusValues, setSelectedStatusValues] = useState<Set<string>>(new Set());
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<Set<string>>(new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState<Set<string>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [selectedCategorizationStatuses, setSelectedCategorizationStatuses] = useState<Set<string>>(new Set());

  // Status values for category and event filters (like Step 3)
  const CATEGORY_STATUS_VALUES = ["uncategorized", "categorized"] as const;
  const EVENT_STATUS_VALUES = ["with-events", "without-events"] as const;
  type CategorizationStatus = "categorized" | "uncategorized" | "with-events" | "without-events";

  // Client-side filtering (search, amount, and all filter states) - matching Step 3 logic
  const filteredActivities = useMemo(() => {
    const minAmount = amountRange.min ? parseFloat(amountRange.min) : null;
    const maxAmount = amountRange.max ? parseFloat(amountRange.max) : null;
    const searchLower = searchQuery.toLowerCase().trim();

    return activities.filter((activity) => {
      // Search filter
      if (searchLower) {
        const name = (activity.name || "").toLowerCase();
        const comment = (activity.comment || "").toLowerCase();
        if (!name.includes(searchLower) && !comment.includes(searchLower)) return false;
      }

      // Amount filter
      if (minAmount !== null || maxAmount !== null) {
        const amount = Math.abs(activity.amount || 0);
        if (minAmount !== null && amount < minAmount) return false;
        if (maxAmount !== null && amount > maxAmount) return false;
      }

      // Status filter (valid/error)
      if (selectedStatusValues.size > 0) {
        const isError = !activity.isValid;
        const matchesStatus =
          (selectedStatusValues.has("error") && isError) ||
          (selectedStatusValues.has("valid") && !isError);
        if (!matchesStatus) return false;
      }

      // Activity type filter
      if (selectedActivityTypes.size > 0) {
        if (!activity.activityType || !selectedActivityTypes.has(activity.activityType)) return false;
      }

      // Account filter
      if (selectedAccountIds.size > 0) {
        if (!activity.accountId || !selectedAccountIds.has(activity.accountId)) return false;
      }

      // Category filter (only actual category IDs, not statuses)
      if (selectedCategoryIds.size > 0) {
        if (!activity.categoryId || !selectedCategoryIds.has(activity.categoryId)) return false;
      }

      // Subcategory filter
      if (selectedSubCategoryIds.size > 0) {
        if (!activity.subCategoryId || !selectedSubCategoryIds.has(activity.subCategoryId)) return false;
      }

      // Event filter (only actual event IDs, not statuses)
      if (selectedEventIds.size > 0) {
        if (!activity.eventId || !selectedEventIds.has(activity.eventId)) return false;
      }

      // Categorization status filter (like Step 3)
      if (selectedCategorizationStatuses.size > 0) {
        const matchesStatus = Array.from(selectedCategorizationStatuses).some((status) => {
          switch (status) {
            case "categorized":
              return !!activity.categoryId;
            case "uncategorized":
              return !activity.categoryId;
            case "with-events":
              return !!activity.eventId;
            case "without-events":
              return !activity.eventId;
            default:
              return true;
          }
        });
        if (!matchesStatus) return false;
      }

      return true;
    });
  }, [activities, amountRange, searchQuery, selectedStatusValues, selectedActivityTypes, selectedAccountIds, selectedCategoryIds, selectedSubCategoryIds, selectedEventIds, selectedCategorizationStatuses]);

  const hasAmountFilter = amountRange.min !== "" || amountRange.max !== "";

  const handleClearAmountFilter = useCallback(() => {
    setAmountRange({ min: "", max: "" });
  }, []);

  // Internal row selection state (used when external not provided)
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});

  // Convert external Set to RowSelectionState format
  const rowSelection = useMemo(() => {
    if (externalSelectedRows) {
      const selection: RowSelectionState = {};
      activities.forEach((activity, index) => {
        const lineNum = activity.lineNumber;
        if (lineNum !== undefined && externalSelectedRows.has(lineNum)) {
          selection[index] = true;
        }
      });
      return selection;
    }
    return internalRowSelection;
  }, [externalSelectedRows, activities, internalRowSelection]);

  // Handle row selection changes
  const handleRowSelectionChange = (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
    const newSelection = typeof updater === "function" ? updater(rowSelection) : updater;

    if (onSelectionChange) {
      const selectedLineNumbers = new Set<number>();
      Object.keys(newSelection).forEach((key) => {
        if (newSelection[key]) {
          const index = parseInt(key);
          const lineNum = activities[index]?.lineNumber;
          if (lineNum !== undefined) {
            selectedLineNumbers.add(lineNum);
          }
        }
      });
      onSelectionChange(selectedLineNumbers);
    } else {
      setInternalRowSelection(newSelection);
    }
  };

  // Count valid/error and categorized/uncategorized/with-events/without-events
  const errorCount = activities.filter((a) => !a.isValid).length;
  const validCount = activities.filter((a) => a.isValid).length;
  const categorizedCount = activities.filter((a) => a.categoryId).length;
  const uncategorizedCount = activities.filter((a) => !a.categoryId).length;
  const withEventsCount = activities.filter((a) => a.eventId).length;
  const withoutEventsCount = activities.filter((a) => !a.eventId).length;

  // Status filter options (valid/error)
  const filterStatusOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    if (errorCount > 0) {
      options.push({ value: "error", label: `Error (${errorCount})` });
    }
    if (validCount > 0) {
      options.push({ value: "valid", label: `Valid (${validCount})` });
    }
    return options;
  }, [errorCount, validCount]);

  // Filter options - only show options that have at least one activity (like Step 3 but filtered to present activities)
  const filterActivityTypeOptions = useMemo(() => {
    const typeCounts = new Map<string, number>();
    activities.forEach((activity) => {
      const type = activity?.activityType;
      if (type) {
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
    });
    // Only show activity types that have at least one activity
    return Array.from(typeCounts.entries()).map(([type, count]) => ({
      label: `${toPascalCase(type)} (${count})`,
      value: type,
    }));
  }, [activities]);

  const filterAccountOptions = useMemo(() => {
    const accountCounts = new Map<string, number>();
    activities.forEach((activity) => {
      const accountId = activity?.accountId;
      if (accountId) {
        accountCounts.set(accountId, (accountCounts.get(accountId) || 0) + 1);
      }
    });
    // Only show accounts that have at least one activity
    return Array.from(accountCounts.entries())
      .map(([accountId, count]) => {
        const account = accounts.find((acc) => acc.id === accountId);
        if (account) {
          return { label: `${account.name} (${account.currency}) (${count})`, value: accountId };
        }
        return null;
      })
      .filter((opt): opt is { label: string; value: string } => opt !== null);
  }, [activities, accounts]);

  // Category filter options - like Step 3: include status options + categories with activities
  const filterCategoryOptions = useMemo(() => {
    const options: { value: string; label: string; color?: string }[] = [];

    // Add status options only if there are activities matching them
    if (uncategorizedCount > 0) {
      options.push({ value: "uncategorized", label: `Uncategorized (${uncategorizedCount})` });
    }
    if (categorizedCount > 0) {
      options.push({ value: "categorized", label: `Categorized (${categorizedCount})` });
    }

    // Add categories that have at least one activity assigned
    const categoryCounts = new Map<string, number>();
    activities.forEach((activity) => {
      const categoryId = activity?.categoryId;
      if (categoryId) {
        categoryCounts.set(categoryId, (categoryCounts.get(categoryId) || 0) + 1);
      }
    });

    categories.forEach((category) => {
      const count = categoryCounts.get(category.id);
      if (count && count > 0) {
        options.push({
          value: category.id,
          label: `${category.name} (${count})`,
          color: category.color,
        });
      }
    });

    return options;
  }, [activities, categories, categorizedCount, uncategorizedCount]);

  // Subcategory filter options - like Step 3: only show when categories are selected
  const filterSubCategoryOptions = useMemo(() => {
    if (selectedCategoryIds.size === 0) return [];

    const subCategoryCounts = new Map<string, number>();
    activities.forEach((activity) => {
      const subCategoryId = activity?.subCategoryId;
      if (subCategoryId) {
        subCategoryCounts.set(subCategoryId, (subCategoryCounts.get(subCategoryId) || 0) + 1);
      }
    });

    const options: { value: string; label: string; color?: string }[] = [];
    categories
      .filter((cat) => selectedCategoryIds.has(cat.id))
      .forEach((category) => {
        if (category.children && category.children.length > 0) {
          category.children.forEach((sub) => {
            const count = subCategoryCounts.get(sub.id);
            if (count && count > 0) {
              options.push({
                value: sub.id,
                label: `${sub.name} (${count})`,
                color: category.color,
              });
            }
          });
        }
      });
    return options;
  }, [categories, selectedCategoryIds, activities]);

  // Event filter options - like Step 3: include status options + events with activities
  const filterEventOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];

    // Add status options only if there are activities matching them
    if (withEventsCount > 0) {
      options.push({ value: "with-events", label: `With Events (${withEventsCount})` });
    }
    if (withoutEventsCount > 0) {
      options.push({ value: "without-events", label: `Without Events (${withoutEventsCount})` });
    }

    // Add events that have at least one activity assigned
    const eventCounts = new Map<string, number>();
    activities.forEach((activity) => {
      const eventId = activity?.eventId;
      if (eventId) {
        eventCounts.set(eventId, (eventCounts.get(eventId) || 0) + 1);
      }
    });

    events.forEach((event) => {
      const count = eventCounts.get(event.id);
      if (count && count > 0) {
        options.push({
          value: event.id,
          label: `${event.name} (${count})`,
        });
      }
    });

    return options;
  }, [activities, events, withEventsCount, withoutEventsCount]);

  const hasActiveFilters = searchQuery.trim().length > 0 ||
    hasAmountFilter ||
    selectedStatusValues.size > 0 ||
    selectedActivityTypes.size > 0 ||
    selectedAccountIds.size > 0 ||
    selectedCategoryIds.size > 0 ||
    selectedSubCategoryIds.size > 0 ||
    selectedEventIds.size > 0 ||
    selectedCategorizationStatuses.size > 0;

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setAmountRange({ min: "", max: "" });
    setSelectedStatusValues(new Set());
    setSelectedActivityTypes(new Set());
    setSelectedAccountIds(new Set());
    setSelectedCategoryIds(new Set());
    setSelectedSubCategoryIds(new Set());
    setSelectedEventIds(new Set());
    setSelectedCategorizationStatuses(new Set());
  }, []);

  const columns = useMemo<ColumnDef<ActivityImport>[]>(
    () => {
      const cols: ColumnDef<ActivityImport>[] = [];

      // Selection column (if selectable)
      if (selectable) {
        cols.push({
          id: "select",
          header: ({ table }) => (
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        });
      }

      // Standard columns
      cols.push(
        {
          id: "lineNumber",
          accessorKey: "lineNumber",
        },
        {
          id: "isValid",
          accessorKey: "isValid",
          header: () => <span className="sr-only">Status</span>,
          cell: ({ row }) => {
            const isValid = row.getValue("isValid");
            const errors = row.original.errors || {};
            const lineNumber = row.original.lineNumber;

            // Format all errors for tooltip display
            const allErrors = Object.entries(errors).flatMap(([field, fieldErrors]) =>
              fieldErrors.map((err) => `${field}: ${err}`),
            );

            return isValid ? (
              <div className="flex w-[60px] items-center gap-1 text-xs">
                <div className="bg-success/20 text-success flex h-5 w-5 items-center justify-center rounded-full">
                  <Icons.CheckCircle className="h-3.5 w-3.5" />
                </div>
                <span className="text-muted-foreground text-xs">
                  {String(lineNumber).padStart(2, "0")}
                </span>
              </div>
            ) : (
              <TooltipProvider>
                <Tooltip delayDuration={30}>
                  <TooltipTrigger asChild>
                    <div className="flex w-[60px] cursor-help items-center gap-1 text-xs">
                      <div className="bg-destructive/20 text-destructive flex h-5 w-5 items-center justify-center rounded-full">
                        <Icons.XCircle className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {String(lineNumber).padStart(2, "0")}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    sideOffset={10}
                    className="bg-destructive text-destructive-foreground max-w-xs border-none p-3"
                  >
                    <h4 className="mb-2 font-medium">Validation Errors</h4>
                    <ul className="max-h-[300px] list-disc space-y-1 overflow-y-auto pl-5 text-sm">
                      {allErrors.length > 0 ? (
                        allErrors.map((error, index) => <li key={index}>{error}</li>)
                      ) : (
                        <li>Invalid activity</li>
                      )}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          },
          filterFn: (row, id, filterValue: string[]) => {
            const isValid = row.getValue(id);
            const filterBoolean = filterValue[0] === "true";
            return isValid === filterBoolean;
          },
          sortingFn: (rowA, rowB, id) => {
            const statusA = rowA.getValue(id);
            const statusB = rowB.getValue(id);
            return statusA === statusB ? 0 : statusA ? -1 : 1;
          },
        },
        {
          id: "date",
          accessorKey: "date",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
          cell: ({ row }) => {
            const formattedDate = formatDateTime(row.getValue("date"));
            const hasError = hasFieldError(row.original, "date");
            const errorMessages = getFieldErrorMessage(row.original, "date");

            return (
              <ErrorCell hasError={hasError} errorMessages={errorMessages}>
                <div className="flex flex-col">
                  <span className="text-xs">{formattedDate.date}</span>
                  <span className="text-muted-foreground text-xs">{formattedDate.time}</span>
                </div>
              </ErrorCell>
            );
          },
        },
        {
          id: "name",
          accessorKey: "name",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
          cell: ({ row }) => {
            const name = row.original.name;
            return (
              <div className="max-w-[150px] truncate text-sm font-medium" title={name || ""}>
                {name || "-"}
              </div>
            );
          },
        },
        {
          id: "activityType",
          accessorKey: "activityType",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
          cell: ({ row }) => {
            const type = row.getValue("activityType") as ActivityType;
            const hasError = hasFieldError(row.original, "activityType");
            const errorMessages = getFieldErrorMessage(row.original, "activityType");
            return (
              <ErrorCell hasError={hasError} errorMessages={errorMessages}>
                <Badge variant={getTypeBadgeVariant(type)}>
                  {ActivityTypeNames[type] || String(type)}
                </Badge>
              </ErrorCell>
            );
          },
          filterFn: (row, id, value: string) => {
            return value.includes(row.getValue(id));
          },
        },
      );

      // Account column (used for filtering, hidden in view)
      cols.push({
        id: "accountId",
        accessorKey: "accountId",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => {
          const accountId = row.original.accountId;
          const account = accountId ? accounts.find((acc) => acc.id === accountId) : null;
          return (
            <div className="text-sm">
              {account ? (
                <Badge variant="outline" className="text-xs">
                  {account.name}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          return value.includes(row.getValue(id));
        },
      });

      // Category column (always shown)
      cols.push({
        id: "categoryId",
        accessorKey: "categoryId",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => {
          const categoryId = row.original.categoryId;
          const subCategoryId = row.original.subCategoryId;
          const category = categoryId && categoryMap ? categoryMap.get(categoryId) : null;
          const subCategory = subCategoryId && categoryMap ? categoryMap.get(subCategoryId) : null;
          const lineNumber = row.original.lineNumber;

          if (editable && onRowChange && lineNumber !== undefined && categories.length > 0) {
            return (
              <EditableCategoryCell
                categoryId={categoryId}
                subCategoryId={subCategoryId}
                categories={categories}
                categoryMap={categoryMap}
                onChange={(catId, subId) => {
                  onRowChange(lineNumber, {
                    categoryId: catId,
                    subCategoryId: subId,
                    isManualOverride: true,
                    matchedRuleId: undefined,
                    matchedRuleName: undefined,
                  });
                }}
              />
            );
          }

          return (
            <div className="text-sm">
              {category ? (
                <div className="flex flex-col">
                  <span>{category.name}</span>
                  {subCategory && (
                    <span className="text-muted-foreground text-xs">{subCategory.name}</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Uncategorized</span>
              )}
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          return value.includes(row.getValue(id));
        },
      });

      // Subcategory column
      cols.push({
        id: "subCategoryId",
        accessorKey: "subCategoryId",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Subcategory" />,
        cell: ({ row }) => {
          const subCategoryId = row.original.subCategoryId;
          const subCategory = subCategoryId && categoryMap ? categoryMap.get(subCategoryId) : null;
          return (
            <div className="text-sm">
              {subCategory ? (
                <span>{subCategory.name}</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          return value.includes(row.getValue(id));
        },
      });

      // Event column (always shown)
      cols.push({
        id: "eventId",
        accessorKey: "eventId",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
        cell: ({ row }) => {
          const eventId = row.original.eventId;
          const event = eventId && eventMap ? eventMap.get(eventId) : null;

          return (
            <div className="text-sm">
              {event ? (
                <Badge variant="outline" className="text-xs">
                  {event.name}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          return value.includes(row.getValue(id));
        },
      });

      // Description column
      cols.push({
        id: "description",
        accessorKey: "comment",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => {
          const comment = row.original.comment;
          return (
            <div className="max-w-[150px] truncate text-sm" title={comment || ""}>
              {comment || "-"}
            </div>
          );
        },
      });

      // Amount column
      cols.push({
        id: "amount",
        accessorKey: "amount",
        header: ({ column }) => (
          <DataTableColumnHeader className="justify-end text-right" column={column} title="Amount" />
        ),
        cell: ({ row }) => {
          const amount = row.getValue("amount");
          const currency = row.getValue("currency") || "USD";
          const hasError = hasFieldError(row.original, "amount");
          const errorMessages = getFieldErrorMessage(row.original, "amount");

          return (
            <ErrorCell hasError={hasError} errorMessages={errorMessages}>
              <div className="text-right font-medium tabular-nums">
                {safeFormatAmount(Number(amount), typeof currency === "string" ? currency : "USD")}
              </div>
            </ErrorCell>
          );
        },
      });

      // Currency column
      cols.push({
        id: "currency",
        accessorKey: "currency",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
        cell: ({ row }) => {
          const hasError = hasFieldError(row.original, "currency");
          const errorMessages = getFieldErrorMessage(row.original, "currency");
          const currency = row.getValue("currency") || "-";

          return (
            <ErrorCell hasError={hasError} errorMessages={errorMessages}>
              <Badge variant="outline" className="font-medium">
                {typeof currency === "string" ? currency : "-"}
              </Badge>
            </ErrorCell>
          );
        },
      });

      return cols;
    },
    [accounts, editable, categories, categoryMap, events, eventMap, onRowChange, selectable],
  );

  const table = useReactTable({
    data: filteredActivities,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: handleRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableRowSelection: selectable,
  });

  return (
    <div className="pt-0">
      <div className="space-y-2">
        {/* Search row */}
        <div className="flex items-center justify-between">
          <div className="relative">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-muted/40 border-border/50 h-8 w-[150px] shadow-[inset_0_0.5px_0.5px_rgba(0,0,0,0.06)] lg:w-[250px]"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-0 right-0 h-8 w-8 p-0 hover:bg-transparent"
                onClick={() => setSearchQuery("")}
              >
                <Icons.Close className="h-4 w-4" />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filters row - matching Step 3 behavior */}
        <div className="flex flex-wrap items-center gap-2">
          <DataTableFacetedFilter
            title="Status"
            options={filterStatusOptions}
            selectedValues={selectedStatusValues}
            onFilterChange={setSelectedStatusValues}
          />

          {filterAccountOptions.length > 0 && (
            <DataTableFacetedFilter
              title="Account"
              options={filterAccountOptions}
              selectedValues={selectedAccountIds}
              onFilterChange={setSelectedAccountIds}
            />
          )}

          {filterActivityTypeOptions.length > 0 && (
            <DataTableFacetedFilter
              title="Type"
              options={filterActivityTypeOptions}
              selectedValues={selectedActivityTypes}
              onFilterChange={setSelectedActivityTypes}
            />
          )}

          {filterCategoryOptions.length > 0 && (
            <DataTableFacetedFilter
              title="Category"
              options={filterCategoryOptions}
              selectedValues={new Set([
                ...selectedCategoryIds,
                ...Array.from(selectedCategorizationStatuses).filter((s) =>
                  CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number])
                ),
              ])}
              onFilterChange={(values) => {
                const allValues = Array.from(values);
                const statusValues = allValues.filter((v) =>
                  CATEGORY_STATUS_VALUES.includes(v as (typeof CATEGORY_STATUS_VALUES)[number])
                ) as CategorizationStatus[];
                const newCategoryIds = allValues.filter(
                  (v) => !CATEGORY_STATUS_VALUES.includes(v as (typeof CATEGORY_STATUS_VALUES)[number])
                );

                setSelectedCategoryIds(new Set(newCategoryIds));

                const eventStatuses = Array.from(selectedCategorizationStatuses).filter((s) =>
                  EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number])
                );
                setSelectedCategorizationStatuses(new Set([...statusValues, ...eventStatuses]));

                // Clear subcategory selection if no categories are selected (like Step 3)
                if (newCategoryIds.length === 0) {
                  setSelectedSubCategoryIds(new Set());
                } else {
                  // Keep only subcategories that belong to still-selected categories
                  const validSubCategories = new Set<string>();
                  selectedSubCategoryIds.forEach((subId) => {
                    categories.some((cat) => {
                      if (newCategoryIds.includes(cat.id) && cat.children?.some((child) => child.id === subId)) {
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
          )}

          <DataTableFacetedFilter
            title="Subcategory"
            options={filterSubCategoryOptions}
            selectedValues={selectedSubCategoryIds}
            onFilterChange={setSelectedSubCategoryIds}
            disabled={selectedCategoryIds.size === 0}
          />

          {filterEventOptions.length > 0 && (
            <DataTableFacetedFilter
              title="Event"
              options={filterEventOptions}
              selectedValues={new Set([
                ...selectedEventIds,
                ...Array.from(selectedCategorizationStatuses).filter((s) =>
                  EVENT_STATUS_VALUES.includes(s as (typeof EVENT_STATUS_VALUES)[number])
                ),
              ])}
              onFilterChange={(values) => {
                const allValues = Array.from(values);
                const statusValues = allValues.filter((v) =>
                  EVENT_STATUS_VALUES.includes(v as (typeof EVENT_STATUS_VALUES)[number])
                ) as CategorizationStatus[];
                const newEventIds = allValues.filter(
                  (v) => !EVENT_STATUS_VALUES.includes(v as (typeof EVENT_STATUS_VALUES)[number])
                );

                setSelectedEventIds(new Set(newEventIds));

                const categoryStatuses = Array.from(selectedCategorizationStatuses).filter((s) =>
                  CATEGORY_STATUS_VALUES.includes(s as (typeof CATEGORY_STATUS_VALUES)[number])
                );
                setSelectedCategorizationStatuses(new Set([...categoryStatuses, ...statusValues]));
              }}
            />
          )}

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
                    onChange={(e) =>
                      setAmountRange((prev) => ({ ...prev, min: e.target.value }))
                    }
                    className="h-8"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={amountRange.max}
                    onChange={(e) =>
                      setAmountRange((prev) => ({ ...prev, max: e.target.value }))
                    }
                    className="h-8"
                  />
                </div>
                {hasAmountFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={handleClearAmountFilter}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={handleResetFilters}
            >
              Reset
              <Icons.Close className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader className="bg-muted/40">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="font-medium">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="text-xs">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row, index) => (
                  <motion.tr
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.5) }}
                    key={row.id}
                    className={cn(
                      "group hover:bg-muted/50 dark:hover:bg-muted/10 transition-colors",
                      row.getValue("isValid")
                        ? index % 2 === 0
                          ? "bg-background"
                          : "bg-muted/20"
                        : "bg-destructive/5 dark:bg-destructive/10",
                      row.getIsSelected() && "bg-muted/50",
                    )}
                    data-state={row.getValue("isValid") ? "valid" : "invalid"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "relative px-4 py-2",
                          cell.column.id === "isValid" &&
                            "border-border bg-muted/30 sticky left-0 z-20 w-[60px] border-r p-2",
                          cell.column.id === "select" && "w-[40px] px-2",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </motion.tr>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 py-8">
                      <Icons.FileText className="text-muted-foreground h-10 w-10 opacity-40" />
                      <p className="text-muted-foreground text-sm">No activities found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
};

// Editable Category Cell Component
interface EditableCategoryCellProps {
  categoryId?: string;
  subCategoryId?: string;
  categories: CategoryWithChildren[];
  categoryMap?: Map<string, Category>;
  onChange: (categoryId: string, subCategoryId?: string) => void;
}

function EditableCategoryCell({
  categoryId,
  subCategoryId,
  categories,
  categoryMap,
  onChange,
}: EditableCategoryCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCat, setSelectedCat] = useState(categoryId || "");
  const [selectedSub, setSelectedSub] = useState(subCategoryId || "");

  const category = categoryId && categoryMap ? categoryMap.get(categoryId) : null;
  const subCategory = subCategoryId && categoryMap ? categoryMap.get(subCategoryId) : null;
  const selectedCategory = categories.find((c) => c.id === selectedCat);
  const subCategories = selectedCategory?.children || [];

  if (!isEditing) {
    return (
      <button
        className="hover:bg-muted/50 flex items-center gap-1 rounded px-1 py-0.5 text-left text-sm"
        onClick={() => setIsEditing(true)}
      >
        {category ? (
          <>
            <span>{category.name}</span>
            {subCategory && <span className="text-muted-foreground">/ {subCategory.name}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">Uncategorized</span>
        )}
        <Icons.Pencil className="ml-1 h-3 w-3 opacity-50" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Select
        value={selectedCat}
        onValueChange={(v) => {
          setSelectedCat(v);
          setSelectedSub("");
        }}
      >
        <SelectTrigger className="h-7 w-[100px] text-xs">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {subCategories.length > 0 && (
        <Select value={selectedSub} onValueChange={setSelectedSub}>
          <SelectTrigger className="h-7 w-[80px] text-xs">
            <SelectValue placeholder="Sub" />
          </SelectTrigger>
          <SelectContent>
            {subCategories.map((sub) => (
              <SelectItem key={sub.id} value={sub.id}>
                {sub.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <button
        className="hover:bg-muted rounded p-1"
        onClick={() => {
          if (selectedCat) {
            onChange(selectedCat, selectedSub || undefined);
          }
          setIsEditing(false);
        }}
      >
        <Icons.Check className="h-3 w-3" />
      </button>
      <button
        className="hover:bg-muted rounded p-1"
        onClick={() => {
          setSelectedCat(categoryId || "");
          setSelectedSub(subCategoryId || "");
          setIsEditing(false);
        }}
      >
        <Icons.XCircle className="h-3 w-3" />
      </button>
    </div>
  );
}

export default CashImportPreviewTable;
