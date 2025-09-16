import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import {
  isCashActivity,
  isCashTransfer,
  calculateActivityValue,
  isIncomeActivity,
  isFeeActivity,
  isSplitActivity,
} from "@/lib/activity-utils";
import type {
  Row as TanStackRow,
  ColumnSizingState,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  PaginationState,
} from "@tanstack/react-table";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchActivities } from "@/commands/activity";
import { QueryKeys } from "@/lib/query-keys";
import { useActivityMutations } from "../hooks/use-activity-mutations";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActivityDetails, Account, ActivitySearchResponse } from "@/lib/types";
import {
  tradeActivitySchema,
  cashActivitySchema,
  baseActivitySchema,
  NewActivityFormValues,
} from "./forms/schemas";
import { formatAmount } from "@wealthfolio/ui";
import { formatDateTime, cn } from "@/lib/utils";

import {
  SearchableSelect,
  CurrencyInput,
  MoneyInput,
  QuantityInput,
  DatePickerInput,
  ToggleGroup,
  ToggleGroupItem,
  Button,
  Icons,
  DeleteConfirm,
  toast,
} from "@wealthfolio/ui";
import TickerSearchInput from "@/components/ticker-search";
import { AccountSelector } from "@/components/account-selector";

// New imports for data table enhancements
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/ui/data-table/data-table-toolbar";
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";

type LocalActivityDetails = ActivityDetails & { isNew?: boolean };

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

import type { ExtendedColumnDef } from "./editable-activity-table-helpers";
import {
  getColumnKey,
  parseAndValidate,
  handleKeyDown,
  handlePaste,
  isRowDisabled,
} from "./editable-activity-table-helpers";

interface EditableActivityTableProps {
  accounts: Account[];
  disabledColumns?: string[];
  disabledRows?: number[] | Record<string, number[]>;
  isEditable: boolean;
  onToggleEditable: (value: boolean) => void;
}

const fetchSize = 15;

// Helper function to determine if a cell is programmatically blocked from editing
const isCellProgrammaticallyBlocked = (
  colKey: string,
  activityType: ActivityType,
  assetSymbol: string | null | undefined,
  // Pass helper functions if they are not available in this scope otherwise
  // For this case, they are top-level imports, so it's fine.
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
      pagination.pageIndex,
      pagination.pageSize,
      "editableTableScope",
    ],
    queryFn: () => {
      const columnFiltersObj = columnFilters.reduce((acc, curr) => {
        acc[curr.id] = curr.value;
        return acc;
      }, {} as any);
      const sortingObj = sorting.length > 0 ? sorting[0] : undefined;
      return searchActivities(
        pagination.pageIndex,
        pagination.pageSize,
        columnFiltersObj,
        globalFilter,
        sortingObj as any,
      );
    },
  });

  const [localActivities, setLocalActivities] = useState<LocalActivityDetails[]>([]);
  const [dirtyActivityIds, setDirtyActivityIds] = useState<Set<string>>(new Set());

  const enableColumnSizing = true;
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [cellErrors, setCellErrors] = useState<Record<string, Record<string, string | null>>>({});
  const [cellOriginalContent, setCellOriginalContent] = useState<
    Record<string, Record<string, string>>
  >({});
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);

  const directEditMetaTypes = useMemo(() => [undefined, "string", "number", "text"], []);

  useEffect(() => {
    const serverPageData = activitiesPage?.data || [];
    setLocalActivities((prevLocalActivities) => {
      const newPageActivities: LocalActivityDetails[] = [];

      serverPageData.forEach((serverActivity) => {
        const dirtyVersion = prevLocalActivities.find(
          (pAct) => pAct.id === serverActivity.id && dirtyActivityIds.has(pAct.id),
        );
        newPageActivities.push(dirtyVersion || serverActivity);
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
    (rowId: string, columnId: keyof ActivityDetails, value: any) => {
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

  const handleDeleteRowInternal = useCallback(
    (rowId: string) => deleteActivityMutation.mutateAsync(rowId),
    [deleteActivityMutation],
  );

  const handleDuplicateRowInternal = useCallback(
    (activity: LocalActivityDetails) => duplicateActivityMutation.mutateAsync(activity),
    [duplicateActivityMutation],
  );

  const handleSaveRowInternal = useCallback(
    async (rowId: string) => {
      const activityToSave = localActivities.find((act) => act.id === rowId);
      if (!activityToSave) {
        toast({
          title: "Error",
          description: "Activity not found to save.",
          variant: "destructive",
        });
        return;
      }

      const {
        id, // Used for update, excluded for add from payloadForBackend construction
        activityType,
        date, // Will be mapped to activityDate
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
        // Client-side derived properties (assetName, assetSymbol) are intentionally not destructured
        // as they are not part of the payload sent to the backend.
      } = activityToSave;

      // Construct the payload with fields expected by the backend API
      const payloadForBackend: any = {
        accountId,
        activityType,
        activityDate: date, // Map to activityDate
        isDraft,
        comment,
        assetId,
        currency,
      };

      // Conditionally add fields that might not always be present or applicable
      if (activityToSave.hasOwnProperty("quantity")) payloadForBackend.quantity = quantity;
      if (activityToSave.hasOwnProperty("unitPrice")) payloadForBackend.unitPrice = unitPrice;
      if (activityToSave.hasOwnProperty("amount")) payloadForBackend.amount = amount;
      if (activityToSave.hasOwnProperty("fee")) payloadForBackend.fee = fee;

      try {
        let mutationPromise;

        if (isNew) {
          // For new activities, payloadForBackend (which excludes client-id) is used directly.
          mutationPromise = addActivityMutation.mutateAsync(
            payloadForBackend as NewActivityFormValues,
          );
        } else {
          // For existing activities, include the original 'id'.
          mutationPromise = updateActivityMutation.mutateAsync({
            ...payloadForBackend,
            id,
          } as NewActivityFormValues & { id: string });
        }

        await mutationPromise;

        toast({ title: `Activity ${isNew ? "Added" : "Updated"}!`, variant: "success" });

        setDirtyActivityIds((prevDirtyIds) => {
          const newDirtyIds = new Set(prevDirtyIds);
          newDirtyIds.delete(rowId);
          return newDirtyIds;
        });
        setCellErrors((prev) => {
          const newErrors = { ...prev };
          if (newErrors[rowId]) {
            delete newErrors[rowId];
          }
          return newErrors;
        });
      } catch (error) {
        const action = isNew ? "adding" : "updating";
        toast({
          title: `Error ${action} activity`,
          description: (error as Error)?.message || "Please try again.",
          variant: "destructive",
        });
        console.error(`Error ${action} activity ${rowId}:`, error);
      }
    },
    [
      localActivities,
      addActivityMutation,
      updateActivityMutation,
      setDirtyActivityIds,
      setCellErrors,
    ],
  );

  const handleCancelRowChanges = useCallback(
    (rowId: string) => {
      const activityToCancel = localActivities.find((act) => act.id === rowId);

      if (activityToCancel?.isNew) {
        setLocalActivities((prev) => prev.filter((act) => act.id !== rowId));
      } else {
        const originalActivityFromServer = activitiesPage?.data?.find((act) => act.id === rowId);
        if (originalActivityFromServer) {
          setLocalActivities((prev) =>
            prev.map((act) => (act.id === rowId ? originalActivityFromServer : act)),
          );
        } else {
          console.warn(
            `Original server data for activity ${rowId} not found on current page. Only clearing dirty state.`,
          );
        }
      }

      setDirtyActivityIds((prevDirtyIds) => {
        const newDirtyIds = new Set(prevDirtyIds);
        newDirtyIds.delete(rowId);
        return newDirtyIds;
      });

      setCellErrors((prev) => {
        const newErrors = { ...prev };
        if (newErrors[rowId]) {
          delete newErrors[rowId];
        }
        return newErrors;
      });
    },
    [activitiesPage?.data, localActivities, setLocalActivities, setDirtyActivityIds, setCellErrors],
  );

  const columnsDefinition = useMemo(
    (): ExtendedColumnDef<LocalActivityDetails>[] => [
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
          return (
            <div className="pr-4 text-right">
              {quantity !== null && quantity !== undefined ? quantity : ""}
            </div>
          );
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
              <span>{account?.name || "N/A"}</span>
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
          <div>{String((row.getValue("currency")) || "N/A")}</div>
        ),
        meta: { type: "currencySelect" },
        validationSchema: baseActivitySchema.shape.currency,
        size: 80,
      },
      {
        accessorKey: "notes",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Comment" />,
        cell: ({ row }: { row: TanStackRow<LocalActivityDetails> }) => {
          return <div>{String((row.original.comment) || "")}</div>;
        },
        meta: { type: "string" },
        validationSchema: baseActivitySchema.shape.comment,
        size: 200,
      },
    ],
    [accounts, dirtyActivityIds],
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
      const { errorMessage } = parseAndValidate(rawValue, colDef);

      setCellErrors((prev) => {
        const rowErrors = { ...(prev[rowId] || {}), [colKey]: errorMessage };
        return { ...prev, [rowId]: rowErrors };
      });
    },
    [disabledColumns, disabledRows, findTableRow],
  );

  const handleCellBlur = useCallback(
    (
      e: React.FocusEvent<HTMLTableCellElement | HTMLDivElement>,
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

      if (rawValue === originalValue) {
        return;
      }

      const { parsedValue, errorMessage } = parseAndValidate(rawValue, colDef);

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
    },
    [disabledColumns, disabledRows, findTableRow, cellOriginalContent, handleSheetCellEdit],
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
          className={cn(disabled ? "bg-muted" : "", isDirty ? "bg-blue-500/10" : "")}
          onMouseEnter={() => setHoveredRowId(rowId)}
          onMouseLeave={() => setHoveredRowId((prev) => (prev === rowId ? null : prev))}
        >
          {row.getVisibleCells().map((cell, cellIndex) => {
            const colDef = cell.column.columnDef as ExtendedColumnDef<LocalActivityDetails>;
            const colKey = getColumnKey(colDef);
            const isDisabled = disabled || disabledColumns.includes(colKey);
            const errorMsg = cellErrors[rowId]?.[colKey] || null;
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
              directEditMetaTypes.includes(colDef.meta?.type);

            const currentCellRequiresCustomEditorActivation =
              cellCanBeInteractedWithForEditing &&
              !isCurrentlyEditing &&
              colDef.meta?.type &&
              !directEditMetaTypes.includes(colDef.meta?.type);
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
            const isLastCell = cellIndex === row.getVisibleCells().length - 1;
            const cellEditorSharedStyle =
              "w-full h-full p-1.5 border-transparent rounded-none bg-transparent outline-none focus-visible:ring-0 focus-visible:ring-offset-0";

            if (isCurrentlyEditing && cellCanBeInteractedWithForEditing) {
              if (colDef.meta?.type === "date") {
                let initialDateForPicker: Date | undefined = undefined;
                const currentValue = cell.getValue(); // This is row.original.date

                if (currentValue) {
                  if (typeof currentValue === "string") {
                    const parsedDate = new Date(currentValue);
                    if (!isNaN(parsedDate.getTime())) {
                      // Check if parsing was successful
                      initialDateForPicker = parsedDate;
                    }
                  } else if (currentValue instanceof Date) {
                    initialDateForPicker = currentValue;
                  }
                }

                cellContent = (
                  <DatePickerInput
                    value={initialDateForPicker} // Use processed Date object or undefined
                    onChange={(newDate: Date | undefined) => {
                      handleSheetCellEdit(
                        rowId,
                        colKey as keyof ActivityDetails,
                        newDate as ActivityDetails[keyof ActivityDetails], // Pass Date | undefined
                      );
                    }}
                    onInteractionEnd={() => {
                      setEditingCell(null);
                    }}
                    autoFocus={true}
                    className={cellEditorSharedStyle}
                    enableTime={true}
                    timeGranularity="minute"
                  />
                );
              } else if (colDef.meta?.type === "activityTypeSelect" && colDef.meta.options) {
                cellContent = (
                  <SearchableSelect
                    options={colDef.meta.options}
                    value={cellValue as string | undefined}
                    onValueChange={(newValue) => {
                      if (newValue !== undefined) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          newValue as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                      setEditingCell(null);
                    }}
                    placeholder="Select type..."
                    className={cn(
                      cellEditorSharedStyle,
                      "data-[state=open]:ring-ring min-w-[100px] data-[state=open]:ring-2",
                    )}
                  />
                );
              } else if (colDef.meta?.type === "assetSymbolSearch") {
                cellContent = (
                  <TickerSearchInput
                    value={cellValue as string | undefined}
                    onSelectResult={(selectedSymbol) => {
                      if (selectedSymbol) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          selectedSymbol as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                      setEditingCell(null);
                    }}
                    placeholder="Search symbol..."
                    className="h-full w-full justify-start rounded-none border-transparent bg-transparent p-0 text-left hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                );
              } else if (colDef.meta?.type === "quantityInput") {
                cellContent = (
                  <QuantityInput
                    value={cellValue as string | number | undefined}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newValueString = e.target.value;
                      if (newValueString !== undefined && newValueString.trim() !== "") {
                        const numericValue = parseFloat(newValueString);
                        if (!isNaN(numericValue)) {
                          handleSheetCellEdit(
                            rowId,
                            colKey as keyof ActivityDetails,
                            numericValue as ActivityDetails[keyof ActivityDetails],
                          );
                        }
                      } else if (newValueString === "" || newValueString === undefined) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          undefined as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                    }}
                    onBlur={() => setEditingCell(null)}
                    autoFocus={true}
                    className={cn(cellEditorSharedStyle, "text-right")}
                  />
                );
              } else if (colDef.meta?.type === "moneyInput") {
                cellContent = (
                  <MoneyInput
                    value={cellValue as string | number | undefined}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newValueString = e.target.value;
                      if (newValueString !== undefined && newValueString.trim() !== "") {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          newValueString as ActivityDetails[keyof ActivityDetails],
                        );
                      } else if (newValueString === "" || newValueString === undefined) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          undefined as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                    }}
                    onBlur={() => setEditingCell(null)}
                    autoFocus={true}
                    className={cn(cellEditorSharedStyle, "text-right")}
                  />
                );
              } else if (colDef.meta?.type === "accountSelect") {
                const currentAccountId = cellValue as string | undefined;
                const selectedAccountObj = accounts?.find((acc) => acc.id === currentAccountId);
                cellContent = (
                  <AccountSelector
                    selectedAccount={selectedAccountObj || null}
                    setSelectedAccount={(account: Account) => {
                      if (account) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          account.id as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                      setEditingCell(null);
                    }}
                    variant="dropdown"
                    className="h-full w-full justify-start rounded-none border-transparent bg-transparent p-0 text-left hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                );
              } else if (colDef.meta?.type === "currencySelect") {
                cellContent = (
                  <CurrencyInput
                    value={cellValue as string | undefined}
                    onChange={(newValue: string | undefined) => {
                      if (newValue !== undefined) {
                        handleSheetCellEdit(
                          rowId,
                          colKey as keyof ActivityDetails,
                          newValue as ActivityDetails[keyof ActivityDetails],
                        );
                      }
                      setEditingCell(null);
                    }}
                    className={cn(cellEditorSharedStyle, "min-w-[80px]")}
                  />
                );
              }
            }

            let finalCellPresentation = cellContent;

            if (isLastCell) {
              finalCellPresentation = (
                <div className="flex h-full w-full items-center justify-between">
                  <div className="h-full grow">{cellContent}</div>
                  <div
                    className={cn(
                      "mr-2 flex h-7 shrink-0 items-center space-x-1",
                      "transition-opacity duration-100 ease-in-out",
                      isDirty || showHoverActions ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                  >
                    {isDirty && (
                      <>
                        <Button
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelRowChanges(rowId);
                          }}
                          title="Revert changes to this row"
                          className="h-7 w-7 p-0"
                        >
                          <Icons.Close size={16} />
                        </Button>
                        <Button
                          variant="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveRowInternal(rowId);
                          }}
                          title="Unsaved changes. Click to save."
                          className="h-7 w-7 p-0"
                        >
                          <Icons.Check size={16} />
                        </Button>
                      </>
                    )}
                    {showHoverActions && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateRowInternal(rowData);
                          }}
                          title="Duplicate activity"
                        >
                          <Icons.Copy size={16} />
                        </Button>
                        <DeleteConfirm
                          deleteConfirmTitle="Delete Activity"
                          deleteConfirmMessage="Are you sure you want to delete this item? This action cannot be undone."
                          handleDeleteConfirm={() => handleDeleteRowInternal(rowId)}
                          isPending={deleteActivityMutation.isPending}
                          button={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive h-7 w-7"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Delete row"
                              title="Delete activity"
                            >
                              <Icons.Trash size={16} />
                            </Button>
                          }
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <TableCell
                key={cell.id}
                data-row-id={rowId}
                data-col-id={colKey}
                className={cn(
                  "relative py-2",
                  {
                    border: !isCurrentlyEditing,
                    "ring-ring ring-2 ring-offset-2":
                      isCurrentlyEditing && cellCanBeInteractedWithForEditing,
                    "bg-muted": overallCellCannotBeEdited,
                    "bg-destructive/25": errorMsg,
                  },
                  typeof colDef.className === "function"
                    ? colDef.className(rowData)
                    : colDef.className,
                )}
                style={style}
                contentEditable={currentCellIsContentEditable}
                suppressContentEditableWarning
                onClick={() => {
                  if (currentCellRequiresCustomEditorActivation) {
                    setEditingCell({ rowId, columnId: colKey });
                  }
                }}
                onFocus={(e) => {
                  if (cellIndex > 0) {
                    if (!isCurrentlyEditing) {
                      handleCellFocus(e, rowData, colDef);
                      if (currentCellRequiresCustomEditorActivation) {
                        setEditingCell({ rowId, columnId: colKey });
                      }
                    }
                  }
                }}
                onKeyDown={(e) => {
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
                            isDirectEditType: directEditMetaTypes.includes(
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
                  if (cellIndex > 0 && currentCellIsContentEditable) handlePaste(e, colDef);
                }}
                onInput={(e) => {
                  if (cellIndex > 0 && currentCellIsContentEditable)
                    handleCellInput(e, rowData, colDef);
                }}
                onBlur={(e) => {
                  // Check if the new focused element (e.relatedTarget) is outside the current cell.
                  // If relatedTarget is null (e.g., focus moved to another window or browser UI),
                  // or if it's not a child of the current cell's parent row, consider it a true blur.
                  const cellElement = e.currentTarget;
                  const rowElement = cellElement.closest("tr"); // Get the parent TableRow

                  let trulyBlurred = true;
                  if (e.relatedTarget instanceof Node && rowElement?.contains(e.relatedTarget)) {
                    // If the new focus is still within the same row, check if it's outside the current cell.
                    // A more precise check would be if e.relatedTarget is NOT within e.currentTarget (the cell itself)
                    // or its popover (if the editor uses one).
                    // For DatePickerInput, the popover is rendered outside the cell, so this might be tricky.
                    // A simpler check for now: if focus is still within the cell, it's not a true blur from the cell.
                    if (cellElement.contains(e.relatedTarget)) {
                      trulyBlurred = false;
                    }
                    // A more robust check: if the relatedTarget is part of a popover associated with this cell
                    // This requires knowing how popovers are structured. For react-aria, popovers are usually direct children of body
                    // but are positioned relative to the trigger. We can check if the relatedTarget is inside ANY react-aria popover.
                    const activePopover = document.querySelector(
                      "[data-radix-popper-content-wrapper], [data-react-aria-dialog]",
                    ); // Common popover selectors
                    if (activePopover && activePopover.contains(e.relatedTarget)) {
                      trulyBlurred = false;
                    }
                  }

                  if (trulyBlurred) {
                    if (
                      cellIndex > 0 &&
                      (!editingCell ||
                        editingCell.rowId !== rowId ||
                        editingCell.columnId !== colKey) &&
                      !cellElement.contains(document.activeElement) // Double check activeElement as well
                    ) {
                      const isDirectEditTypeForThisCellBlur = directEditMetaTypes.includes(
                        colDef.meta?.type,
                      );
                      const wasConfiguredForDirectEdit =
                        cellCanBeInteractedWithForEditing && isDirectEditTypeForThisCellBlur;
                      if (wasConfiguredForDirectEdit) {
                        handleCellBlur(e, rowData, colDef);
                      } else if (
                        colDef.meta?.type === "date" &&
                        cellCanBeInteractedWithForEditing
                      ) {
                        // For date cells, we need to ensure onBlur also calls handleCellBlur
                        // as the DatePickerInput itself calls setEditingCell(null) on its own change/blur.
                        // However, the DatePickerInput's internal onChange already calls handleSheetCellEdit,
                        // and then setEditingCell(null). The blur on TableCell might be redundant or cause issues if not handled well.
                        // If the DatePicker has already setEditingCell(null), this condition might not even be met.
                        // The critical part is that DatePickerInput itself should manage ending the edit.
                        // The TableCell onBlur should only act if the focus truly leaves the cell for good for *direct edit types*.
                        // For complex types like DatePicker, let its own logic (onChange -> setEditingCell(null)) handle it.
                      }
                    }
                  }
                }}
              >
                {finalCellPresentation}
              </TableCell>
            );
          })}
        </TableRow>
      </React.Fragment>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex shrink-0 items-center justify-between">
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
                <TableRow key={headerGroup.id} className="bg-muted-foreground/10 border-none">
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
                      <TableHead key={header.id} className="border py-2 text-left" style={style}>
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
