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
import { DataTableFacetedFilterProps } from "@/components/ui/data-table/data-table-faceted-filter";
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";
import { DataTableToolbar } from "@/components/ui/data-table/data-table-toolbar";
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
import type { ActivityImport, CashImportRow, Category, CategoryWithChildren, Event } from "@/lib/types";
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

  // Client-side amount filtering
  const filteredActivities = useMemo(() => {
    const minAmount = amountRange.min ? parseFloat(amountRange.min) : null;
    const maxAmount = amountRange.max ? parseFloat(amountRange.max) : null;

    if (minAmount === null && maxAmount === null) {
      return activities;
    }

    return activities.filter((activity) => {
      const amount = Math.abs(activity.amount || 0);
      if (minAmount !== null && amount < minAmount) return false;
      if (maxAmount !== null && amount > maxAmount) return false;
      return true;
    });
  }, [activities, amountRange]);

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

  const activitiesType = useMemo(() => {
    const uniqueTypesSet = new Set();
    return activities.reduce(
      (result, activity) => {
        const type = activity?.activityType;
        if (type && !uniqueTypesSet.has(type)) {
          uniqueTypesSet.add(type);
          result.push({ label: toPascalCase(type), value: type });
        }
        return result;
      },
      [] as { label: string; value: string }[],
    );
  }, [activities]);

  const filters = [
    {
      id: "isValid",
      title: "Status",
      options: [
        { label: "Error", value: "false" },
        { label: "Valid", value: "true" },
      ],
    },
    {
      id: "activityType",
      title: "Type",
      options: activitiesType,
    },
  ] satisfies DataTableFacetedFilterProps<ActivityImport, string>[];

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

      // Category column (always shown)
      cols.push({
        id: "category",
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
      });

      // Event column (always shown)
      cols.push({
        id: "event",
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
    [editable, categories, categoryMap, events, eventMap, onRowChange, selectable],
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
        <DataTableToolbar
          table={table}
          searchBy="name"
          filters={filters}
          actions={
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
          }
        />
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
