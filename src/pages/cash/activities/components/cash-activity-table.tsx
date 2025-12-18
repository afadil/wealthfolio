import React from "react";

import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActivityType } from "@/lib/constants";
import { ActivityDetails } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import {
  type OnChangeFn,
  type VisibilityState,
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button, formatAmount } from "@wealthfolio/ui";
import { ActivityTypeBadge } from "@/pages/activity/components/activity-type-badge";
import { usePersistentState } from "@/hooks/use-persistent-state";

interface CashActivityTableProps {
  activities: ActivityDetails[];
  isLoading: boolean;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  handleEdit: (activity?: ActivityDetails) => void;
  handleDelete: (activity: ActivityDetails) => void;
  handleDuplicate: (activity: ActivityDetails) => void;
}

export const CashActivityTable = ({
  activities,
  isLoading,
  sorting,
  onSortingChange,
  handleEdit,
  handleDelete,
  handleDuplicate,
}: CashActivityTableProps) => {
  const [columnVisibility, setColumnVisibility] = usePersistentState<VisibilityState>(
    "cash-activity-table-column-visibility",
    {
      accountId: false,
      accountCurrency: false,
      event: false,
      recurrence: false,
      currency: false,
      comment: false,
    },
  );

  const columns: ColumnDef<ActivityDetails>[] = React.useMemo(
    () => [
      // 1. Date
      {
        id: "date",
        accessorKey: "date",
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => {
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const dateVal = row.getValue("date");
          const formattedDate =
            typeof dateVal === "string" || dateVal instanceof Date
              ? formatDateTime(dateVal, userTimezone)
              : formatDateTime(String(dateVal), userTimezone);
          return (
            <div className="ml-2 flex flex-col">
              <span>{formattedDate.date}</span>
              <span className="text-muted-foreground text-xs font-light">{formattedDate.time}</span>
            </div>
          );
        },
      },
      // 2. Type
      {
        id: "activityType",
        accessorKey: "activityType",
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => {
          const activityType = row.getValue("activityType");
          return (
            <div className="flex items-center text-sm">
              <ActivityTypeBadge
                type={activityType as ActivityType}
                className="text-xs font-normal whitespace-nowrap"
              />
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          const cellValue = row.getValue(id);
          if (!cellValue) {
            return false;
          }
          return value.includes(cellValue as string);
        },
      },
      // 3. Account (with transfer account as subtitle for transfers)
      {
        id: "account",
        accessorKey: "accountName",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: "Account",
        },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => {
          const accountName = row.original.accountName;
          const accountCurrency = row.original.accountCurrency;

          return (
            <div className="flex min-w-[150px] flex-col">
              <span>{String(accountName)}</span>
              <span className="text-muted-foreground text-xs font-light">
                {String(accountCurrency)}
              </span>
            </div>
          );
        },
      },
      // 4. Name
      {
        id: "name",
        accessorKey: "name",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: "Name",
        },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => {
          const name = row.getValue("name") as string | undefined;
          return (
            <div className="max-w-[350px] truncate">
              {name || <span className="text-muted-foreground">-</span>}
            </div>
          );
        },
      },
      // 5. Amount
      {
        id: "amount",
        accessorKey: "amount",
        enableSorting: false,
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title="Amount"
          />
        ),
        cell: ({ row }) => {
          const amount = Number(row.getValue("amount"));
          const currencyVal = row.getValue("currency");
          const currency = typeof currencyVal === "string" ? currencyVal : "USD";
          const activityType = String(row.getValue("activityType"));

          // Show + or - sign based on activity type
          const isPositive = ["DEPOSIT", "TRANSFER_IN"].includes(activityType);
          const displayAmount = Math.abs(amount);

          return (
            <div
              className={`text-right font-medium ${isPositive ? "text-success" : "text-destructive"}`}
            >
              {isPositive ? "+" : "-"}
              {formatAmount(displayAmount, currency)}
            </div>
          );
        },
      },
      // 6. Category (with subcategory as subtitle)
      {
        id: "category",
        accessorKey: "categoryName",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: "Category",
        },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => {
          const categoryName = row.original.categoryName;
          const categoryColor = row.original.categoryColor;
          const subCategoryName = row.original.subCategoryName;

          if (!categoryName) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <div className="flex items-center gap-2">
              {categoryColor && (
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor }}
                />
              )}
              <div className="flex flex-col">
                <span className="max-w-[150px] truncate">{categoryName}</span>
                {subCategoryName && (
                  <span className="text-muted-foreground max-w-[150px] truncate text-xs font-light">
                    {subCategoryName}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      // 7. Event (hidden by default)
      {
        id: "event",
        accessorKey: "eventName",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: "Event",
        },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
        cell: ({ row }) => {
          const eventName = row.original.eventName;
          return (
            <div className="max-w-[150px] truncate">
              {eventName || <span className="text-muted-foreground">-</span>}
            </div>
          );
        },
      },
      // 8. Recurrence (hidden by default)
      {
        id: "recurrence",
        accessorKey: "recurrence",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: "Recurrence",
        },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Recurrence" />,
        cell: ({ row }) => {
          const recurrence = row.original.recurrence;
          if (!recurrence) {
            return <span className="text-muted-foreground">-</span>;
          }
          return <span className="capitalize">{recurrence}</span>;
        },
      },
      // 9. Description (hidden by default)
      {
        id: "comment",
        accessorKey: "comment",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: "Description",
        },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => {
          const comment = row.getValue("comment") as string | undefined;
          return (
            <div className="max-w-[200px] truncate">
              {comment || <span className="text-muted-foreground">-</span>}
            </div>
          );
        },
      },
      // 10. Currency (hidden by default)
      {
        id: "currency",
        accessorKey: "currency",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: "Currency",
        },
        header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
        cell: ({ row }) => <div>{row.getValue("currency")}</div>,
      },
      // Hidden columns for internal use
      {
        id: "accountId",
        accessorKey: "accountId",
        filterFn: (row, id, value: string) => {
          const cellValue = row.getValue(id);
          if (!cellValue) {
            return false;
          }
          return value.includes(cellValue as string);
        },
        enableHiding: false,
      },
      {
        id: "accountCurrency",
        accessorKey: "accountCurrency",
        enableHiding: false,
      },
      // Actions column
      {
        id: "actions",
        header: ({ table }) => {
          const hideableColumns = table.getAllColumns().filter((column) => column.getCanHide());
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    title="Toggle columns"
                  >
                    <Icons.ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {hideableColumns.map((column) => {
                    const meta = column.columnDef.meta as { label?: string } | undefined;
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {meta?.label ?? column.id}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        cell: ({ row }) => {
          const activity = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Icons.MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(activity)}>
                  <Icons.Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDuplicate(activity)}>
                  <Icons.Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleDelete(activity)}
                  className="text-destructive focus:text-destructive"
                >
                  <Icons.Trash className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableHiding: false,
      },
    ],
    [handleEdit, handleDelete, handleDuplicate],
  );

  const handleSortingChange = React.useCallback<OnChangeFn<SortingState>>(
    (updaterOrValue) => {
      const nextSorting =
        typeof updaterOrValue === "function" ? updaterOrValue(sorting) : updaterOrValue;
      onSortingChange(nextSorting);
    },
    [onSortingChange, sorting],
  );

  const table = useReactTable({
    data: activities,
    columns,
    manualSorting: true,
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnVisibility,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="bg-muted-foreground/5 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows?.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                return (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No transactions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CashActivityTable;
