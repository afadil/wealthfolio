import { searchActivities } from "@/commands/activity";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isFeeActivity,
  isIncomeActivity,
  isSplitActivity,
} from "@/lib/activity-utils";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { ActivityDetails, ActivitySearchResponse } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import type {
  ColumnFiltersState,
  ColumnSizingState,
  PaginationState,
  SortingState,
  Row as TanStackRow,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { formatAmount } from "@wealthfolio/ui";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import {
  baseActivitySchema,
  cashActivitySchema,
  NewActivityFormValues,
  tradeActivitySchema,
} from "../forms/schemas";

import {
  Button,
  Checkbox,
  DeleteConfirm,
  Icons,
  toast,
  ToggleGroup,
  ToggleGroupItem,
} from "@wealthfolio/ui";

// New imports for data table enhancements
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";
import { DataTableToolbar } from "@/components/ui/data-table/data-table-toolbar";

// Import types and cell editors
import {
  AccountSelectEditor,
  ActivityTypeSelectEditor,
  AssetSymbolSearchEditor,
  CurrencySelectEditor,
  DateCellEditor,
  MoneyCellEditor,
  QuantityCellEditor,
  TextCellEditor,
} from "./cell-editors";
import type {
  CellEditingState,
  EditableActivityTableProps,
  ExtendedColumnDef,
  LocalActivityDetails,
} from "./types";

// Simple Skeleton component (can be replaced with shadcn/ui Skeleton if available)
const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("bg-muted animate-pulse rounded-md", className)} {...props} />;
};

interface ActivitySkeletonRowProps {
  columns: ExtendedColumnDef<LocalActivityDetails>[];
  columnSizing: ColumnSizingState;
  enableColumnSizing: boolean;
}

const ActivitySkeletonRow: React.FC<ActivitySkeletonRowProps> = ({
  columns,
  columnSizing,
  enableColumnSizing,
}) => {
  return (
    <TableRow>
      {columns.map((colDef) => {
        const colKey = getColumnKey(colDef);
        const style: React.CSSProperties = {};
        if (enableColumnSizing) {
          const size = colDef.size ?? columnSizing[colKey] ?? colDef.minSize ?? 100; // Default to a reasonable size
          if (size) style.width = `${size}px`;
          if (colDef.minSize) style.minWidth = `${colDef.minSize}px`;
          if (colDef.maxSize) style.maxWidth = `${colDef.maxSize}px`;
        }
        return (
          <TableCell key={colKey} style={style} className="py-2">
            <Skeleton className="h-5 w-full" />
          </TableCell>
        );
      })}
    </TableRow>
  );
};

import {
  getColumnKey,
  handleKeyDown,
  handlePaste,
  isRowDisabled,
  parseAndValidate,
} from "./editable-activity-table-helpers";

const fetchSize = 15;

// Helper function to determine if a cell is programmatically blocked from editing
const isCellProgrammaticallyBlocked = (
  colKey: string,
  activityType: ActivityType,
  assetSymbol: string | null | undefined,
): boolean => {
  if (colKey === "assetSymbol" && assetSymbol?.startsWith("$CASH-")) return true;
  if (colKey === "value") return true;
  if (
    colKey === "quantity" &&
    (isCashActivity(activityType) ||
      isIncomeActivity(activityType) ||
      isSplitActivity(activityType) ||
      isFeeActivity(activityType))
  )
    return true;
  if (
    colKey === "unitPrice" &&
    (isCashActivity(activityType) ||
      isIncomeActivity(activityType) ||
      isFeeActivity(activityType) ||
      isSplitActivity(activityType) ||
      isCashTransfer(activityType, assetSymbol ?? ""))
  )
    return true;
  if (colKey === "amount") {
    if (activityType === ActivityType.SPLIT) return true;
    if (
      !(
        isCashActivity(activityType) ||
        isCashTransfer(activityType, assetSymbol ?? "") ||
        isIncomeActivity(activityType) ||
        activityType === ActivityType.FEE
      )
    )
      return true;
  }
  if (colKey === "fee" && activityType === ActivityType.SPLIT) return true;
  return false;
};

// Helper to determine if a cell type should use contentEditable directly
const usesDirectContentEditable = (metaType: string | undefined): boolean => {
  return metaType === undefined || metaType === "string";
};

const EditableActivityTable = ({
  accounts,
  disabledColumns = [],
  disabledRows = [],
  isEditable,
  onToggleEditable,
}: EditableActivityTableProps) => {
  const {
    deleteActivityMutation,
    addActivityMutation,
    updateActivityMutation,
    duplicateActivityMutation,
  } = useActivityMutations();

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: fetchSize,
  });

  const {
    data: activitiesPage,
    isLoading,
    isError,
  } = useQuery<ActivitySearchResponse, Error>({
    queryKey: [
      QueryKeys.ACTIVITY_DATA,
      columnFilters,
      globalFilter,
      sorting,
      sorting[0], // Explicitly include sorting[0] for lint
      pagination.pageIndex,
      pagination.pageSize,
      "editableTableScope",
    ],
    queryFn: () => {
      const columnFiltersObj = columnFilters.reduce<Record<string, unknown>>(
        (acc, curr) => {
          acc[curr.id] = curr.value;
          return acc;
        },
        {} as Record<string, unknown>,
      );
      const sortingObj: { id: string; desc: boolean } | undefined =
        sorting.length > 0 ? (sorting[0] as { id: string; desc: boolean }) : undefined;
      return searchActivities(
        pagination.pageIndex,
        pagination.pageSize,
        columnFiltersObj,
        globalFilter,
        sortingObj as { id: string; desc: boolean },
      );
    },
  });

  const [localActivities, setLocalActivities] = useState<LocalActivityDetails[]>([]);
  const [dirtyActivityIds, setDirtyActivityIds] = useState<Set<string>>(new Set());
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const enableColumnSizing = true;
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [cellErrors, setCellErrors] = useState<Record<string, Record<string, string | null>>>({});
  const [cellOriginalContent, setCellOriginalContent] = useState<
    Record<string, Record<string, string>>
  >({});
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<CellEditingState | null>(null);

  useEffect(() => {
    const serverPageData = activitiesPage?.data ?? [];
    setLocalActivities((prevLocalActivities) => {
      const newPageActivities: LocalActivityDetails[] = [];

      serverPageData.forEach((serverActivity) => {
        const dirtyVersion = prevLocalActivities.find(
          (pAct) => pAct.id === serverActivity.id && dirtyActivityIds.has(pAct.id),
        );
        newPageActivities.push(dirtyVersion ?? serverActivity);
      });

      prevLocalActivities.forEach((localActivity) => {
        if (localActivity.isNew) {
          if (!newPageActivities.some((npa) => npa.id === localActivity.id)) {
            newPageActivities.unshift(localActivity);
          }
        }
      });
      return newPageActivities;
    });
  }, [activitiesPage?.data, dirtyActivityIds]);

  const handleSheetCellEdit = useCallback(
    (rowId: string, columnId: keyof ActivityDetails, value: unknown) => {
      let updatedActivity: LocalActivityDetails | undefined;
      setLocalActivities((prevActivities) =>
        prevActivities.map((act) => {
          if (act.id === rowId) {
            updatedActivity = { ...act, [columnId]: value };
            return updatedActivity;
          }
          return act;
        }),
      );
      setDirtyActivityIds((prevDirtyIds) => {
        const newDirtyIds = new Set(prevDirtyIds);
        newDirtyIds.add(rowId);
        return newDirtyIds;
      });
    },
    [],
  );

  const handleDuplicateRowInternal = useCallback(
    (activity: LocalActivityDetails) => duplicateActivityMutation.mutateAsync(activity),
    [duplicateActivityMutation],
  );

  // Bulk save all dirty activities
  const handleBulkSave = useCallback(async () => {
    const dirtyActivities = localActivities.filter((act) => dirtyActivityIds.has(act.id));

    if (dirtyActivities.length === 0) {
      toast({
        title: "No Changes",
        description: "There are no unsaved changes to save.",
        variant: "default",
      });
      return;
    }

    const errors: string[] = [];
    const successes: string[] = [];

    for (const activity of dirtyActivities) {
      try {
        const {
          id,
          activityType,
          date,
          quantity,
          unitPrice,
          amount,
          fee,
          currency,
          isDraft,
          comment,
          assetId,
          accountId,
          isNew,
        } = activity;

        const payloadForBackend: Record<string, unknown> = {
          accountId,
          activityType,
          activityDate: date,
          isDraft,
          comment,
          assetId,
          currency,
        };

        if (Object.prototype.hasOwnProperty.call(activity, "quantity"))
          payloadForBackend.quantity = quantity;
        if (Object.prototype.hasOwnProperty.call(activity, "unitPrice"))
          payloadForBackend.unitPrice = unitPrice;
        if (Object.prototype.hasOwnProperty.call(activity, "amount"))
          payloadForBackend.amount = amount;
        if (Object.prototype.hasOwnProperty.call(activity, "fee")) payloadForBackend.fee = fee;

        if (isNew) {
          await addActivityMutation.mutateAsync(payloadForBackend as NewActivityFormValues);
        } else {
          await updateActivityMutation.mutateAsync({
            ...payloadForBackend,
            id,
          } as NewActivityFormValues & { id: string });
        }

        successes.push(id);
      } catch (error) {
        errors.push((error as Error)?.message || "Unknown error");
      }
    }

    // Clear dirty state and errors for successfully saved activities
    setDirtyActivityIds((prev) => {
      const newSet = new Set(prev);
      successes.forEach((id) => newSet.delete(id));
      return newSet;
    });

    setCellErrors((prev) => {
      const newErrors = { ...prev };
      successes.forEach((id) => {
        if (newErrors[id]) delete newErrors[id];
      });
      return newErrors;
    });

    if (errors.length === 0) {
      toast({
        title: "Success",
        description: `Saved ${successes.length} ${successes.length === 1 ? "activity" : "activities"} successfully.`,
        variant: "success",
      });
    } else {
      toast({
        title: "Partial Success",
        description: `Saved ${successes.length} out of ${dirtyActivities.length} activities. ${errors.length} failed.`,
        variant: "destructive",
      });
    }
  }, [localActivities, dirtyActivityIds, addActivityMutation, updateActivityMutation]);

  // Bulk cancel all changes
  const handleBulkCancel = useCallback(() => {
    if (dirtyActivityIds.size === 0) {
      toast({
        title: "No Changes",
        description: "There are no unsaved changes to cancel.",
        variant: "default",
      });
      return;
    }

    // Remove new activities and revert existing ones
    setLocalActivities((prev) => {
      return prev
        .filter((act) => !act.isNew) // Remove new activities
        .map((act) => {
          if (dirtyActivityIds.has(act.id)) {
            // Revert to original from server
            const original = activitiesPage?.data?.find((serverAct) => serverAct.id === act.id);
            return original ?? act;
          }
          return act;
        });
    });

    setDirtyActivityIds(new Set());
    setCellErrors({});

    toast({
      title: "Changes Cancelled",
      description: "All unsaved changes have been reverted.",
      variant: "default",
    });
  }, [dirtyActivityIds, activitiesPage?.data]);

  // Bulk delete selected activities
  const handleBulkDelete = useCallback(async () => {
    if (selectedRowIds.size === 0) {
      toast({
        title: "No Selection",
        description: "Please select activities to delete.",
        variant: "default",
      });
      return;
    }

    const errors: string[] = [];
    const successes: string[] = [];

    for (const rowId of Array.from(selectedRowIds)) {
      try {
        await deleteActivityMutation.mutateAsync(rowId);
        successes.push(rowId);
      } catch (error) {
        errors.push((error as Error)?.message || "Unknown error");
      }
    }

    // Clear selection
    setSelectedRowIds(new Set());

    if (errors.length === 0) {
      toast({
        title: "Success",
        description: `Deleted ${successes.length} ${successes.length === 1 ? "activity" : "activities"} successfully.`,
        variant: "success",
      });
    } else {
      toast({
        title: "Partial Success",
        description: `Deleted ${successes.length} out of ${selectedRowIds.size} activities. ${errors.length} failed.`,
        variant: "destructive",
      });
    }
  }, [selectedRowIds, deleteActivityMutation]);

  // Toggle single row selection
  const toggleRowSelection = useCallback((rowId: string) => {
    setSelectedRowIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  }, []);

  // Toggle all rows selection
  const toggleAllRowsSelection = useCallback(() => {
    if (selectedRowIds.size === localActivities.length) {
      // Deselect all
      setSelectedRowIds(new Set());
    } else {
      // Select all
      setSelectedRowIds(new Set(localActivities.map((act) => act.id)));
    }
  }, [selectedRowIds.size, localActivities]);

  const columnsDefinition = useMemo(
    (): ExtendedColumnDef<LocalActivityDetails>[] => [
      {
        id: "select",
        header: () => (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={selectedRowIds.size > 0 && selectedRowIds.size === localActivities.length}
              onCheckedChange={toggleAllRowsSelection}
              aria-label="Select all"
            />
          </div>
        ),
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={selectedRowIds.has(row.id)}
              onCheckedChange={() => toggleRowSelection(row.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label="Select row"
            />
          </div>
        ),
        size: 50,
        enableSorting: false,
      },
      {
        accessorKey: "assetSymbol",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Symbol" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          let symbol = row.original.assetSymbol || "";
          if (symbol.startsWith("$CASH")) symbol = symbol.split("-")[0];
          return (
            <div className="flex min-w-[120px] items-center">
              <Link to={`/holdings/${encodeURIComponent(symbol)}`}>
                <Badge className="flex min-w-[60px] cursor-pointer items-center justify-center rounded-sm">
                  {symbol || "-"}
                </Badge>
              </Link>
            </div>
          );
        },
        meta: { type: "assetSymbolSearch" },
        size: 150,
      },
      {
        accessorKey: "date",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const formattedDate = formatDateTime(row.original.date, userTimezone);
          return <span className="whitespace-nowrap">{formattedDate.date}</span>;
        },
        meta: { type: "date" },
        validationSchema: baseActivitySchema.shape.activityDate,
        size: 120,
      },
      {
        accessorKey: "activityType",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const activityType = row.original.activityType;
          const badgeVariant =
            activityType === ActivityType.BUY ||
            activityType === ActivityType.DEPOSIT ||
            activityType === ActivityType.DIVIDEND ||
            activityType === ActivityType.INTEREST ||
            activityType === ActivityType.TRANSFER_IN ||
            activityType === ActivityType.ADD_HOLDING
              ? "success"
              : activityType === ActivityType.SPLIT
                ? "secondary"
                : "destructive";
          return (
            <Badge
              className="flex justify-center text-xs font-normal text-nowrap"
              variant={badgeVariant}
            >
              {ActivityTypeNames[activityType]}
            </Badge>
          );
        },
        meta: {
          type: "activityTypeSelect",
          options: Object.entries(ActivityTypeNames).map(([value, label]) => ({
            label,
            value: value as ActivityType,
          })),
        },
        validationSchema: tradeActivitySchema.shape.activityType,
        size: 10,
      },
      {
        accessorKey: "quantity",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Shares" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const { activityType, quantity } = row.original;
          if (
            isCashActivity(activityType) ||
            isIncomeActivity(activityType) ||
            isSplitActivity(activityType) ||
            isFeeActivity(activityType)
          ) {
            return <div className="pr-4 text-right"></div>;
          }
          return <div className="pr-4 text-right">{quantity ?? ""}</div>;
        },
        meta: { type: "quantityInput" },
        validationSchema: tradeActivitySchema.shape.quantity,
        size: 100,
      },
      {
        accessorKey: "unitPrice",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const { activityType, unitPrice, currency, assetSymbol } = row.original;
          const displayCurrency = currency || "USD";
          // unitPrice is mainly for trade activities.
          if (
            isCashActivity(activityType) ||
            isIncomeActivity(activityType) ||
            isFeeActivity(activityType) ||
            isSplitActivity(activityType) ||
            isCashTransfer(activityType, assetSymbol ?? "")
          ) {
            return <div className="pr-4 text-right"></div>;
          }
          return (
            <div className="text-right">{formatAmount(unitPrice || 0, displayCurrency, false)}</div>
          );
        },
        meta: { type: "moneyInput" },
        validationSchema: tradeActivitySchema.shape.unitPrice,
        size: 100,
      },
      {
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const { activityType, amount, currency, assetSymbol } = row.original;
          const displayCurrency = currency || "USD";

          if (activityType === ActivityType.SPLIT) {
            return <div className="text-right">{Number(amount || 0).toFixed(0)} : 1</div>;
          }
          if (
            isCashActivity(activityType) ||
            isCashTransfer(activityType, assetSymbol ?? "") ||
            isCashTransfer(activityType, assetSymbol) ||
            isIncomeActivity(activityType) ||
            activityType === ActivityType.FEE
          ) {
            return (
              <div className="text-right">{formatAmount(amount || 0, displayCurrency, false)}</div>
            );
          }
          return <div className="pr-4 text-right"></div>;
        },
        meta: { type: "moneyInput" },
        validationSchema: cashActivitySchema.shape.amount,
        size: 100,
      },
      {
        accessorKey: "fee",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Fee" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const { activityType, fee, currency } = row.original;
          return (
            <div className="text-right">
              {activityType === ActivityType.SPLIT
                ? ""
                : formatAmount(fee || 0, currency || "USD", false)}
            </div>
          );
        },
        meta: { type: "moneyInput" },
        validationSchema: tradeActivitySchema.shape.fee,
        size: 80,
      },
      {
        id: "value",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
        accessorFn: (row: LocalActivityDetails) => calculateActivityValue(row),
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const activity = row.original;
          if (activity.activityType === ActivityType.SPLIT)
            return <div className="pr-4 text-right"></div>;
          return (
            <div className="pr-4 text-right">
              {formatAmount(calculateActivityValue(activity), activity.currency || "USD", false)}
            </div>
          );
        },
        size: 120,
      },
      {
        accessorKey: "accountId",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          const account = accounts.find((acc) => acc.id === row.original.accountId);
          return (
            <div className="ml-2 flex min-w-[150px] flex-col">
              <span>{account?.name ?? "N/A"}</span>
            </div>
          );
        },
        meta: {
          type: "accountSelect",
        },
        validationSchema: baseActivitySchema.shape.accountId,
        size: 180,
      },
      {
        accessorKey: "currency",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => (
          <div>{String(row.getValue("currency") ?? "N/A")}</div>
        ),
        meta: { type: "currencySelect" },
        validationSchema: baseActivitySchema.shape.currency,
        size: 80,
      },
      {
        accessorKey: "comment",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Comment" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          return <div>{String(row.original.comment ?? "")}</div>;
        },
        meta: { type: "text" },
        validationSchema: baseActivitySchema.shape.comment,
        size: 200,
      },
      {
        id: "actions",
        header: () => <div className="w-full text-center">Actions</div>,
        cell: () => null, // We'll render actions separately in the row
        size: 80,
        enableSorting: false,
      },
    ],
    [accounts, localActivities.length, selectedRowIds, toggleAllRowsSelection, toggleRowSelection],
  );

  const table = useReactTable<LocalActivityDetails>({
    data: localActivities,
    columns: columnsDefinition,
    getRowId: (row) => row.id ?? String(Math.random()),
    getCoreRowModel: getCoreRowModel(),
    enableExpanding: false,

    // New models for toolbar, pagination, column headers
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),

    state: {
      columnFilters,
      globalFilter,
      sorting,
      columnVisibility,
      pagination,
      ...(enableColumnSizing ? { columnSizing } : {}),
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,

    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    pageCount: activitiesPage
      ? Math.ceil(activitiesPage.meta.totalRowCount / pagination.pageSize)
      : -1,

    ...(enableColumnSizing
      ? {
          onColumnSizingChange: setColumnSizing,
          columnResizeMode: "onChange",
        }
      : {}),
  });

  const findTableRow = useCallback(
    (rowData: LocalActivityDetails): TanStackRow<LocalActivityDetails> | undefined => {
      if (!rowData.id) return undefined;
      return table.getRowModel().flatRows.find((r) => r.original.id === rowData.id);
    },
    [table],
  );

  const handleCellFocus = useCallback(
    (
      e: React.FocusEvent<HTMLTableCellElement | HTMLDivElement>,
      rowData: LocalActivityDetails,
      colDef: ExtendedColumnDef<LocalActivityDetails>,
    ) => {
      const tanStackRow = findTableRow(rowData);
      if (!tanStackRow) return;

      const rowId = tanStackRow.id;
      const colKey = getColumnKey(colDef);
      const initialText = e.currentTarget.textContent ?? "";

      setCellOriginalContent((prev) => {
        const rowContent = { ...(prev[rowId] || {}), [colKey]: initialText };
        return { ...prev, [rowId]: rowContent };
      });
    },
    [findTableRow],
  );

  const handleCellInput = useCallback(
    (
      e: React.FormEvent<HTMLTableCellElement | HTMLDivElement>,
      rowData: LocalActivityDetails,
      colDef: ExtendedColumnDef<LocalActivityDetails>,
    ) => {
      const tanStackRow = findTableRow(rowData);
      if (!tanStackRow) return;

      const rowId = tanStackRow.id;
      const rowIndex = tanStackRow.index;
      const colKey = getColumnKey(colDef);

      if (isRowDisabled(disabledRows, "ungrouped", rowIndex) || disabledColumns.includes(colKey)) {
        return;
      }

      const rawValue = e.currentTarget.textContent ?? "";
      const originalValue = cellOriginalContent[rowId]?.[colKey] ?? "";
      const { errorMessage } = parseAndValidate(rawValue, colDef);

      setCellErrors((prev) => {
        const rowErrors = { ...(prev[rowId] || {}), [colKey]: errorMessage };
        return { ...prev, [rowId]: rowErrors };
      });

      // Mark row as dirty if content has changed
      if (rawValue !== originalValue) {
        setDirtyActivityIds((prevDirtyIds) => {
          const newDirtyIds = new Set(prevDirtyIds);
          newDirtyIds.add(rowId);
          return newDirtyIds;
        });
      }
    },
    [disabledColumns, disabledRows, findTableRow, cellOriginalContent],
  );

  const renderRow = (row: TanStackRow<LocalActivityDetails>) => {
    const rowId = row.id;
    const rowIndex = row.index;
    const rowData = row.original;

    const disabled = isRowDisabled(disabledRows, "ungrouped", rowIndex);
    const showHoverActions = hoveredRowId === rowId && !dirtyActivityIds.has(rowId);
    const isDirty = dirtyActivityIds.has(rowId);

    return (
      <React.Fragment key={rowId}>
        <TableRow
          className={cn(
            "border-border/40 border-b transition-none",
            disabled ? "bg-muted/30" : "",
            isDirty ? "bg-blue-50 dark:bg-blue-950/20" : "",
            !disabled && !isDirty && "hover:bg-muted/50",
          )}
          onMouseEnter={() => setHoveredRowId(rowId)}
          onMouseLeave={() => setHoveredRowId((prev) => (prev === rowId ? null : prev))}
        >
          {row.getVisibleCells().map((cell, cellIndex) => {
            const colDef = cell.column.columnDef as ExtendedColumnDef<LocalActivityDetails>;
            const colKey = getColumnKey(colDef);
            const isDisabled = disabled || disabledColumns.includes(colKey);
            const errorMsg = cellErrors[rowId]?.[colKey] ?? null;
            const isCurrentlyEditing =
              editingCell?.rowId === rowId && editingCell?.columnId === colKey;
            const cellValue = cell.getValue();

            // New logic for determining cell editability
            const activityType = rowData.activityType;
            const assetSymbol = rowData.assetSymbol; // Needed for isCashTransfer

            const isProgrammaticallyBlockedFromEditing = isCellProgrammaticallyBlocked(
              colKey,
              activityType,
              assetSymbol,
            );

            const overallCellCannotBeEdited = isDisabled || isProgrammaticallyBlockedFromEditing;
            const cellCanBeInteractedWithForEditing = isEditable && !overallCellCannotBeEdited;

            const currentCellIsContentEditable =
              cellCanBeInteractedWithForEditing &&
              !isCurrentlyEditing &&
              usesDirectContentEditable(colDef.meta?.type);

            const currentCellRequiresCustomEditorActivation =
              cellCanBeInteractedWithForEditing &&
              !isCurrentlyEditing &&
              colDef.meta?.type &&
              !usesDirectContentEditable(colDef.meta?.type);
            // End of new logic

            const style: React.CSSProperties = {};
            if (enableColumnSizing) {
              const size = cell.column.getSize();
              if (size) style.width = `${size}px`;
              if (colDef.minSize) style.minWidth = `${colDef.minSize}px`;
              if (colDef.maxSize) style.maxWidth = `${colDef.maxSize}px`;
            }

            const rawCellContent = flexRender(cell.column.columnDef.cell, cell.getContext());
            let cellContent: React.ReactNode = rawCellContent;
            const isActionsColumn = colKey === "actions";

            if (isCurrentlyEditing && cellCanBeInteractedWithForEditing) {
              if (colDef.meta?.type === "date") {
                cellContent = (
                  <DateCellEditor
                    value={cell.getValue()}
                    onChange={(newDate: unknown) => {
                      handleSheetCellEdit(
                        rowId,
                        colKey as keyof ActivityDetails,
                        newDate as ActivityDetails[keyof ActivityDetails],
                      );
                    }}
                    onComplete={() => {
                      setEditingCell(null);
                    }}
                    autoFocus={true}
                  />
                );
              } else if (colDef.meta?.type === "activityTypeSelect" && colDef.meta.options) {
                cellContent = (
                  <ActivityTypeSelectEditor
                    value={cellValue}
                    onChange={(newValue: unknown) => {
                      if (newValue !== undefined) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          newValue as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                    }}
                    onComplete={() => {
                      setEditingCell(null);
                    }}
                    options={colDef.meta.options as { label: string; value: ActivityType }[]}
                  />
                );
              } else if (colDef.meta?.type === "assetSymbolSearch") {
                cellContent = (
                  <AssetSymbolSearchEditor
                    value={cellValue}
                    onChange={(selectedSymbol: unknown) => {
                      if (selectedSymbol) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          selectedSymbol as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                    }}
                    onComplete={() => {
                      setEditingCell(null);
                    }}
                  />
                );
              } else if (colDef.meta?.type === "quantityInput") {
                cellContent = (
                  <QuantityCellEditor
                    value={cellValue}
                    onChange={(newValue: unknown) => {
                      handleSheetCellEdit(
                        rowId,
                        colKey as keyof ActivityDetails,
                        newValue as ActivityDetails[keyof ActivityDetails],
                      );
                    }}
                    onComplete={() => setEditingCell(null)}
                    autoFocus={true}
                  />
                );
              } else if (colDef.meta?.type === "moneyInput") {
                cellContent = (
                  <MoneyCellEditor
                    value={cellValue}
                    onChange={(newValue: unknown) => {
                      handleSheetCellEdit(
                        rowId,
                        colKey as keyof ActivityDetails,
                        newValue as ActivityDetails[keyof ActivityDetails],
                      );
                    }}
                    onComplete={() => setEditingCell(null)}
                    autoFocus={true}
                  />
                );
              } else if (colDef.meta?.type === "accountSelect") {
                cellContent = (
                  <AccountSelectEditor
                    value={cellValue}
                    onChange={(accountId: unknown) => {
                      if (accountId) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          accountId as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                    }}
                    onComplete={() => {
                      setEditingCell(null);
                    }}
                    accounts={accounts}
                  />
                );
              } else if (colDef.meta?.type === "currencySelect") {
                cellContent = (
                  <CurrencySelectEditor
                    value={cellValue}
                    onChange={(newValue: unknown) => {
                      if (newValue !== undefined) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          newValue as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                    }}
                    onComplete={() => {
                      setEditingCell(null);
                    }}
                  />
                );
              } else if (colDef.meta?.type === "text") {
                cellContent = (
                  <TextCellEditor
                    value={cellValue}
                    onChange={(newValue: unknown) => {
                      handleSheetCellEdit(
                        rowId,
                        colKey as keyof ActivityDetails,
                        newValue as ActivityDetails[keyof ActivityDetails],
                      );
                    }}
                    onComplete={() => {
                      setEditingCell(null);
                    }}
                    autoFocus={true}
                  />
                );
              }
            }

            // Render actions column with duplicate and delete buttons
            if (isActionsColumn) {
              cellContent = (
                <div className="flex h-7 w-full items-center justify-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 transition-opacity duration-0",
                      !showHoverActions && "pointer-events-none opacity-0",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateRowInternal(rowData);
                    }}
                    title="Duplicate activity"
                  >
                    <Icons.Copy size={14} />
                  </Button>
                  <DeleteConfirm
                    deleteConfirmTitle="Delete Activity"
                    deleteConfirmMessage="Are you sure you want to delete this item? This action cannot be undone."
                    handleDeleteConfirm={() => {
                      deleteActivityMutation.mutateAsync(rowId);
                    }}
                    isPending={deleteActivityMutation.isPending}
                    button={
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "text-destructive hover:text-destructive h-7 w-7 transition-opacity duration-0",
                          !showHoverActions && "pointer-events-none opacity-0",
                        )}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Delete row"
                        title="Delete activity"
                      >
                        <Icons.Trash size={14} />
                      </Button>
                    }
                  />
                </div>
              );
            }

            return (
              <TableCell
                key={cell.id}
                data-row-id={rowId}
                data-col-id={colKey}
                className={cn(
                  "relative px-2 py-1.5",
                  "border-border/40 border-r border-b",
                  {
                    "ring-ring ring-2 ring-inset":
                      isCurrentlyEditing && cellCanBeInteractedWithForEditing && !isActionsColumn,
                    "bg-muted": overallCellCannotBeEdited,
                    "bg-destructive/20 ring-destructive ring-1 ring-inset": errorMsg,
                    "hover:bg-muted/50":
                      cellCanBeInteractedWithForEditing && !isCurrentlyEditing && !isActionsColumn,
                    "cursor-pointer": currentCellRequiresCustomEditorActivation,
                  },
                  typeof colDef.className === "function"
                    ? colDef.className(rowData)
                    : colDef.className,
                )}
                style={style}
                contentEditable={!isActionsColumn && currentCellIsContentEditable}
                suppressContentEditableWarning
                onClick={() => {
                  if (currentCellRequiresCustomEditorActivation && !isActionsColumn) {
                    setEditingCell({ rowId, columnId: colKey });
                  }
                }}
                onFocus={(e) => {
                  if (cellIndex > 0 && !isActionsColumn) {
                    if (!isCurrentlyEditing) {
                      handleCellFocus(e, rowData, colDef);
                      if (currentCellRequiresCustomEditorActivation) {
                        setEditingCell({ rowId, columnId: colKey });
                      }
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (isActionsColumn) return; // Skip keyboard handling for actions column

                  // Handle Enter key to move to next row same column
                  if (e.key === "Enter" && !e.shiftKey && currentCellIsContentEditable) {
                    e.preventDefault();

                    const allRows = table.getRowModel().flatRows;
                    const currentRowIndex = allRows.findIndex((r) => r.id === rowId);

                    if (currentRowIndex >= 0 && currentRowIndex < allRows.length - 1) {
                      const nextRow = allRows[currentRowIndex + 1];
                      const nextRowOriginalData = nextRow.original;
                      const nextRowDisabled = isRowDisabled(
                        disabledRows,
                        "ungrouped",
                        nextRow.index,
                      );
                      const nextCellDisabled = disabledColumns.includes(colKey);
                      const nextProgBlocked = isCellProgrammaticallyBlocked(
                        colKey,
                        nextRowOriginalData.activityType,
                        nextRowOriginalData.assetSymbol,
                      );

                      if (!nextRowDisabled && !nextCellDisabled && !nextProgBlocked) {
                        setEditingCell({ rowId: nextRow.id, columnId: colKey });

                        setTimeout(() => {
                          const targetElement = document.querySelector(
                            `[data-row-id="${nextRow.id}"][data-col-id="${colKey}"]`,
                          );
                          if (targetElement instanceof HTMLElement) {
                            targetElement.focus();
                          }
                        }, 0);
                      }
                    }
                    return;
                  }

                  if (e.key === "Tab") {
                    e.preventDefault();

                    const allRows = table.getRowModel().flatRows;
                    const editableCellsFlat: {
                      rowId: string;
                      columnId: string;
                      isDirectEditType: boolean;
                    }[] = [];

                    allRows.forEach((r) => {
                      const currentRowOriginalData = r.original;
                      const currentRowDisabledByProp = isRowDisabled(
                        disabledRows,
                        "ungrouped",
                        r.index,
                      );

                      r.getVisibleCells().forEach((c) => {
                        const currentCellColDef = c.column
                          .columnDef as ExtendedColumnDef<LocalActivityDetails>;
                        const currentCellColKey = getColumnKey(currentCellColDef);

                        // Skip actions column in tab navigation
                        if (currentCellColKey === "actions") return;

                        const currentCellDisabledByProp =
                          disabledColumns.includes(currentCellColKey);
                        const progBlocked = isCellProgrammaticallyBlocked(
                          currentCellColKey,
                          currentRowOriginalData.activityType,
                          currentRowOriginalData.assetSymbol,
                        );

                        const overallCannotCurrentlyBeEdited =
                          currentRowDisabledByProp || currentCellDisabledByProp || progBlocked;
                        const canCurrentlyInteract = isEditable && !overallCannotCurrentlyBeEdited;

                        if (canCurrentlyInteract) {
                          editableCellsFlat.push({
                            rowId: r.id,
                            columnId: currentCellColKey,
                            isDirectEditType: usesDirectContentEditable(
                              currentCellColDef.meta?.type,
                            ),
                          });
                        }
                      });
                    });

                    const currentEditingCellIndexInFlatList = editableCellsFlat.findIndex(
                      (item) => item.rowId === rowId && item.columnId === colKey,
                    );

                    if (currentEditingCellIndexInFlatList !== -1 && editableCellsFlat.length > 0) {
                      let nextFlatIndex: number;
                      if (!e.shiftKey) {
                        // Tab
                        nextFlatIndex = currentEditingCellIndexInFlatList + 1;
                        if (nextFlatIndex >= editableCellsFlat.length) nextFlatIndex = 0; // Wrap around
                      } else {
                        // Shift + Tab
                        nextFlatIndex = currentEditingCellIndexInFlatList - 1;
                        if (nextFlatIndex < 0) nextFlatIndex = editableCellsFlat.length - 1; // Wrap around
                      }

                      const nextCellToFocusData = editableCellsFlat[nextFlatIndex];

                      if (nextCellToFocusData) {
                        setEditingCell({
                          rowId: nextCellToFocusData.rowId,
                          columnId: nextCellToFocusData.columnId,
                        });

                        setTimeout(() => {
                          const targetElement = document.querySelector(
                            `[data-row-id="${nextCellToFocusData.rowId}"][data-col-id="${nextCellToFocusData.columnId}"]`,
                          );
                          if (targetElement instanceof HTMLElement) {
                            if (nextCellToFocusData.isDirectEditType) {
                              targetElement.focus();
                            } else {
                              const inputElement = targetElement.querySelector(
                                'input, select, textarea, button, [contenteditable="true"]',
                              );
                              if (inputElement instanceof HTMLElement) {
                                let isDisabled = false;
                                if (
                                  inputElement instanceof HTMLInputElement ||
                                  inputElement instanceof HTMLSelectElement ||
                                  inputElement instanceof HTMLTextAreaElement ||
                                  inputElement instanceof HTMLButtonElement
                                ) {
                                  isDisabled = inputElement.disabled;
                                }

                                if (!isDisabled) {
                                  inputElement.focus();
                                } else {
                                  targetElement.focus(); // Fallback if found element is disabled
                                }
                              } else {
                                targetElement.focus(); // Fallback if no inputElement found
                              }
                            }
                          }
                        }, 0);
                      }
                    }
                    return; // Tab handled
                  }

                  // If not Tab, and cell is directly contentEditable, call original validation keydown
                  // This applies to cells with index > 0, as index 0 has its own div for contentEditable
                  if (cellIndex > 0 && currentCellIsContentEditable) {
                    if (
                      (e.ctrlKey || e.metaKey) &&
                      ["a", "c", "x", "z", "v"].includes(e.key.toLowerCase())
                    ) {
                      return;
                    }
                    handleKeyDown(e, colDef);
                  }
                }}
                onPaste={(e) => {
                  if (cellIndex > 0 && currentCellIsContentEditable && !isActionsColumn)
                    handlePaste(e, colDef);
                }}
                onInput={(e) => {
                  if (cellIndex > 0 && currentCellIsContentEditable && !isActionsColumn)
                    handleCellInput(e, rowData, colDef);
                }}
                onBlur={(e) => {
                  if (isActionsColumn) return; // Skip blur handling for actions column

                  // Improved blur detection for better reliability
                  const cellElement = e.currentTarget;
                  const relatedTarget = e.relatedTarget;

                  // Check if focus moved to a popover or select menu
                  const activePopover = document.querySelector(
                    "[data-radix-popper-content-wrapper], [data-react-aria-dialog], [role='dialog'], [role='listbox']",
                  );

                  if (activePopover?.contains(relatedTarget as Node)) {
                    // Focus moved to a popover, don't blur
                    return;
                  }

                  // Check if focus is still within the cell
                  if (relatedTarget && cellElement.contains(relatedTarget as Node)) {
                    return;
                  }

                  // True blur - handle content editable cells
                  // Capture the event properties before deferring to avoid null reference
                  if (
                    cellIndex > 0 &&
                    (!editingCell ||
                      editingCell.rowId !== rowId ||
                      editingCell.columnId !== colKey) &&
                    !cellElement.contains(document.activeElement)
                  ) {
                    const isDirectEditTypeForThisCellBlur = usesDirectContentEditable(
                      colDef.meta?.type,
                    );
                    if (isDirectEditTypeForThisCellBlur) {
                      // Capture the text content synchronously before deferring
                      const textContent = cellElement.textContent;
                      const originalValue = cellOriginalContent[rowId]?.[colKey] ?? "";

                      // Only process if content changed
                      if (textContent !== originalValue) {
                        // Defer the state update to avoid React DOM conflicts with contentEditable
                        requestAnimationFrame(() => {
                          const { parsedValue, errorMessage } = parseAndValidate(
                            textContent || "",
                            colDef,
                          );

                          setCellErrors((prev) => {
                            const rowErrors = { ...(prev[rowId] || {}), [colKey]: errorMessage };
                            return { ...prev, [rowId]: rowErrors };
                          });

                          if (errorMessage) {
                            console.error(`Row "${rowId}", Col "${colKey}" error: ${errorMessage}`);
                          } else {
                            handleSheetCellEdit(
                              rowId,
                              colKey as keyof ActivityDetails,
                              parsedValue as ActivityDetails[keyof ActivityDetails],
                            );
                          }
                        });
                      }
                    }
                  }
                }}
              >
                {cellContent}
              </TableCell>
            );
          })}
        </TableRow>
      </React.Fragment>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        {/* First row: Filters and Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-2">
            <DataTableToolbar
              table={table}
              searchBy="assetSymbol"
              filters={[
                {
                  id: "activityType",
                  title: "Type",
                  options: Object.entries(ActivityTypeNames).map(([value, label]) => ({
                    label,
                    value: value as ActivityType,
                  })),
                },
                {
                  id: "accountId",
                  title: "Account",
                  options: accounts.map((acc) => ({
                    label: acc.name,
                    value: acc.id,
                  })),
                },
              ]}
              showColumnToggle={false}
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-muted-foreground text-xs font-light">
              click on the cell to edit
            </span>
            <ToggleGroup
              type="single"
              size="sm"
              value={isEditable ? "edit" : "view"}
              onValueChange={(value: string) => {
                if (value === "edit") {
                  onToggleEditable(true);
                } else if (value === "view") {
                  onToggleEditable(false);
                }
              }}
              aria-label="Table view mode"
              className="bg-muted rounded-md p-0.5"
            >
              <ToggleGroupItem
                value="view"
                aria-label="View mode"
                className="hover:bg-muted/50 hover:text-accent-foreground data-[state=on]:bg-background data-[state=off]:text-muted-foreground data-[state=on]:text-accent-foreground rounded-md px-2.5 py-1.5 text-xs transition-colors data-[state=off]:bg-transparent"
              >
                <Icons.Rows3 className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="edit"
                aria-label="Edit mode"
                className="hover:bg-muted/50 hover:text-accent-foreground data-[state=on]:bg-background data-[state=off]:text-muted-foreground data-[state=on]:text-accent-foreground rounded-md px-2.5 py-1.5 text-xs transition-colors data-[state=off]:bg-transparent"
              >
                <Icons.Grid3x3 className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Second row: Action Buttons */}
        {(dirtyActivityIds.size > 0 || selectedRowIds.size > 0) && (
          <div className="flex items-center justify-end gap-2">
            {/* Bulk Save/Cancel Buttons */}
            {dirtyActivityIds.size > 0 && (
              <div className="border-border bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-1.5">
                <span className="text-muted-foreground text-sm">
                  {dirtyActivityIds.size} unsaved{" "}
                  {dirtyActivityIds.size === 1 ? "change" : "changes"}
                </span>
                <Button variant="outline" size="sm" onClick={handleBulkCancel} className="h-7">
                  <Icons.Close className="mr-1 h-4 w-4" />
                  Cancel All
                </Button>
                <Button variant="default" size="sm" onClick={handleBulkSave} className="h-7">
                  <Icons.Check className="mr-1 h-4 w-4" />
                  Save All
                </Button>
              </div>
            )}

            {/* Bulk Delete Button */}
            {selectedRowIds.size > 0 && (
              <div className="border-destructive/30 bg-destructive/10 flex items-center gap-2 rounded-md border px-3 py-1.5">
                <span className="text-muted-foreground text-sm">
                  {selectedRowIds.size} selected
                </span>
                <DeleteConfirm
                  deleteConfirmTitle="Delete Selected Activities"
                  deleteConfirmMessage={`Are you sure you want to delete ${selectedRowIds.size} ${selectedRowIds.size === 1 ? "activity" : "activities"}? This action cannot be undone.`}
                  handleDeleteConfirm={handleBulkDelete}
                  isPending={deleteActivityMutation.isPending}
                  button={
                    <Button variant="destructive" size="sm" className="h-7">
                      <Icons.Trash className="mr-1 h-4 w-4" />
                      Delete Selected
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        {isLoading && <div className="p-4 text-center">Loading activities...</div>}
        {isError && (
          <div className="text-destructive p-4 text-center">Error loading activities.</div>
        )}
        {!isLoading && !isError && localActivities.length === 0 && (
          <div className="p-4 text-center">No activities found.</div>
        )}

        {(localActivities.length > 0 || (isLoading && localActivities.length === 0)) && (
          <Table>
            <TableHeader className="bg-background sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/50 border-border border-b-2">
                  {headerGroup.headers.map((header) => {
                    const colDef = header.column
                      .columnDef as ExtendedColumnDef<LocalActivityDetails>;
                    const style: React.CSSProperties = {};
                    if (enableColumnSizing) {
                      const size = header.getSize();
                      if (size) style.width = `${size}px`;
                      if (colDef.minSize) style.minWidth = `${colDef.minSize}px`;
                      if (colDef.maxSize) style.maxWidth = `${colDef.maxSize}px`;
                    }
                    return (
                      <TableHead
                        key={header.id}
                        className="border-border/40 border-r px-2 py-2 text-left font-medium"
                        style={style}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading && localActivities.length === 0
                ? Array.from({ length: 10 }).map((_, index) => (
                    <ActivitySkeletonRow
                      key={`skeleton-${index}`}
                      columns={columnsDefinition}
                      columnSizing={columnSizing}
                      enableColumnSizing={enableColumnSizing}
                    />
                  ))
                : table.getRowModel().flatRows.map((row) => {
                    return renderRow(row);
                  })}
            </TableBody>
          </Table>
        )}
      </div>
      {localActivities.length > 0 && activitiesPage && activitiesPage.meta.totalRowCount > 0 && (
        <div className="mt-2 shrink-0">
          <DataTablePagination table={table} />
        </div>
      )}
    </div>
  );
};

export default EditableActivityTable;
