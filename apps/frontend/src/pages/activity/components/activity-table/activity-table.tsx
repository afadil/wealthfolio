import React from "react";

import { TickerAvatar } from "@/components/ticker-avatar";
import { DataTableColumnHeader } from "@wealthfolio/ui/components/ui/data-table/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isFeeActivity,
  isIncomeActivity,
  isSplitActivity,
} from "@/lib/activity-utils";
import { ActivityType, isCashAssetId } from "@/lib/constants";
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
import { Link } from "react-router-dom";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";

interface ActivityTableProps {
  activities: ActivityDetails[];
  isLoading: boolean;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  handleEdit: (activity?: ActivityDetails) => void;
  handleDelete: (activity: ActivityDetails) => void;
}

export const ActivityTable = ({
  activities,
  isLoading,
  sorting,
  onSortingChange,
  handleEdit,
  handleDelete,
}: ActivityTableProps) => {
  const { duplicateActivityMutation } = useActivityMutations();

  const handleDuplicate = React.useCallback(
    async (activity: ActivityDetails) => duplicateActivityMutation.mutateAsync(activity),
    [duplicateActivityMutation],
  );

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    accountId: false,
    accountCurrency: false,
    assetName: false,
    currency: false,
  });

  const columns: ColumnDef<ActivityDetails>[] = React.useMemo(
    () => [
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
                className="whitespace-nowrap text-xs font-normal"
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
      {
        id: "assetSymbol",
        accessorKey: "assetSymbol",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Symbol" />,
        cell: ({ row }) => {
          const symbol = String(row.getValue("assetSymbol"));
          const assetId = row.original.assetId;
          const isCash = isCashAssetId(assetId);
          const displaySymbol = isCash ? "Cash" : symbol;
          const avatarSymbol = isCash ? "$CASH" : symbol;

          const assetName = row.getValue("assetName");
          const currency = row.getValue("currency");

          const content = (
            <div className="flex max-w-[200px] items-center gap-2">
              <TickerAvatar symbol={avatarSymbol} className="h-8 w-8 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{displaySymbol}</span>
                <span className="text-muted-foreground truncate text-xs font-light">
                  {isCash ? String(currency) : String(assetName ?? currency)}
                </span>
              </div>
            </div>
          );

          if (isCash) {
            return content;
          }
          return (
            <Link to={`/holdings/${encodeURIComponent(assetId)}`} className="-m-1 block p-1">
              {content}
            </Link>
          );
        },
        enableHiding: false,
      },
      {
        id: "quantity",
        accessorKey: "quantity",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: "Quantity",
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title="Quantity"
          />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue("activityType"));
          const quantity = row.getValue("quantity");

          if (
            isCashActivity(activityType) ||
            isIncomeActivity(activityType) ||
            isSplitActivity(activityType) ||
            isFeeActivity(activityType)
          ) {
            return <div className="pr-4 text-right">-</div>;
          }

          return <div className="pr-4 text-right">{String(quantity)}</div>;
        },
      },
      {
        id: "unitPrice",
        accessorKey: "unitPrice",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: "Price / Amount",
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title="Price/Amount"
          />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue("activityType"));
          const unitPrice = Number(row.getValue("unitPrice"));
          const amount = row.original.amount;
          const currencyVal = row.getValue("currency");
          const currency =
            typeof currencyVal === "string" && currencyVal
              ? currencyVal
              : row.original.accountCurrency || "USD";
          const assetSymbol = String(row.getValue("assetSymbol"));

          if (activityType === "FEE") {
            return <div className="pr-4 text-right">-</div>;
          }
          if (activityType === "SPLIT") {
            return <div className="text-right">{Number(amount).toFixed(0)} : 1</div>;
          }
          if (
            isCashActivity(activityType) ||
            isCashTransfer(activityType, assetSymbol) ||
            isIncomeActivity(activityType)
          ) {
            return <div className="text-right">{formatAmount(Number(amount), currency)}</div>;
          }

          return <div className="text-right">{formatAmount(unitPrice, currency)}</div>;
        },
      },
      {
        id: "fee",
        accessorKey: "fee",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: "Fee",
        },
        header: ({ column }) => (
          <DataTableColumnHeader className="justify-end text-right" column={column} title="Fee" />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue("activityType"));
          const fee = Number(row.getValue("fee"));
          const currencyVal = row.getValue("currency");
          const currency =
            typeof currencyVal === "string" && currencyVal
              ? currencyVal
              : row.original.accountCurrency || "USD";

          return (
            <div className="text-right">
              {activityType === "SPLIT" ? "-" : formatAmount(fee, currency)}
            </div>
          );
        },
      },
      {
        id: "value",
        accessorKey: "value",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: "Total",
        },
        header: ({ column }) => (
          <DataTableColumnHeader className="justify-end text-right" column={column} title="Total" />
        ),
        cell: ({ row }) => {
          const activity = row.original;
          const activityType = activity.activityType;
          const currency = activity.currency || activity.accountCurrency || "USD";

          if (activityType === "SPLIT") {
            return <div className="pr-4 text-right">-</div>;
          }

          const displayValue = calculateActivityValue(activity);
          return <div className="pr-4 text-right">{formatAmount(displayValue, currency)}</div>;
        },
      },
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
          const accountName = row.getValue("account");
          const accountCurrency = row.getValue("accountCurrency");
          return (
            <div className="ml-2 flex min-w-[150px] flex-col">
              <span>{String(accountName)}</span>
              <span className="text-muted-foreground text-xs font-light">
                {String(accountCurrency)}
              </span>
            </div>
          );
        },
      },
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
      {
        id: "assetName",
        accessorKey: "assetName",
        enableHiding: false,
      },
      {
        id: "accountCurrency",
        accessorKey: "accountCurrency",
        enableHiding: false,
      },
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
          return (
            <ActivityOperations
              row={row}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
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
    debugTable: true,
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
                  No activity found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ActivityTable;
