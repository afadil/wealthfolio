import { TickerAvatar } from "@/components/ticker-avatar";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";
import { DataTableToolbar } from "@/components/ui/data-table/data-table-toolbar";
import { Icons } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OpenPosition } from "@/pages/trading/types";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Badge, GainAmount, GainPercent } from "@wealthvn/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface OpenTradesTableProps {
  positions: OpenPosition[];
  showFilters?: boolean;
  showSearch?: boolean;
}

export function OpenTradesTable({
  positions,
  showFilters = true,
  showSearch = true,
}: OpenTradesTableProps) {
  const { t } = useTranslation("trading");

  // Get unique accounts for filter
  const uniqueAccounts = useMemo(() => {
    const accountMap = new Map<string, string>();
    positions.forEach((pos) => {
      if (!accountMap.has(pos.accountId)) {
        accountMap.set(pos.accountId, pos.accountName);
      }
    });
    return Array.from(accountMap.entries()).map(([id, name]) => ({
      value: id,
      label: name,
    }));
  }, [positions]);

  const columns: ColumnDef<OpenPosition>[] = useMemo(
    () => [
      {
        id: "avatar",
        cell: ({ row }) => <TickerAvatar symbol={row.original.symbol} className="h-8 w-8" />,
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "symbol",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("components.openTrades.table.symbol")} />
        ),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.symbol}</div>
            {row.original.assetName && (
              <div
                className="text-muted-foreground max-w-[120px] truncate text-xs"
                title={row.original.assetName}
              >
                {row.original.assetName}
              </div>
            )}
          </div>
        ),
        enableHiding: false,
      },
      {
        id: "account",
        accessorFn: (row) => row.accountId,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("components.openTrades.table.account")} />
        ),
        cell: ({ row }) => row.original.accountName,
        filterFn: "arrIncludesSome",
        enableHiding: true,
      },
      {
        accessorKey: "quantity",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-center"
            column={column}
            title={t("components.openTrades.table.quantity")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.quantity.toLocaleString()}</div>
        ),
      },
      {
        accessorKey: "averageCost",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-center"
            column={column}
            title={t("components.openTrades.table.avgCost")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">
            {row.original.averageCost.toLocaleString("en-US", {
              style: "currency",
              currency: row.original.currency,
            })}
          </div>
        ),
      },
      {
        accessorKey: "currentPrice",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-center"
            column={column}
            title={t("components.openTrades.table.current")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">
            {row.original.currentPrice.toLocaleString("en-US", {
              style: "currency",
              currency: row.original.currency,
            })}
          </div>
        ),
      },
      {
        accessorKey: "unrealizedPL",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-center"
            column={column}
            title={t("components.openTrades.table.pl")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <GainAmount value={row.original.unrealizedPL} currency={row.original.currency} />
          </div>
        ),
      },
      {
        accessorKey: "unrealizedReturnPercent",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-center"
            column={column}
            title={t("components.openTrades.table.returnPercent")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <GainPercent value={row.original.unrealizedReturnPercent} />
          </div>
        ),
      },
      {
        accessorKey: "daysOpen",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-center w-full text-center"
            column={column}
            title={t("components.openTrades.table.days")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Badge variant="outline" className="text-xs">
              {row.original.daysOpen}
            </Badge>
          </div>
        ),
      },
    ],
    [t],
  );

  const filters = useMemo(
    () => [
      {
        id: "account",
        title: t("components.openTrades.filter.account"),
        options: uniqueAccounts,
      },
    ],
    [t, uniqueAccounts],
  );

  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    currentPrice: false,
  });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "daysOpen", desc: false }]);

  const table = useReactTable({
    data: positions,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="shrink-0">
        <DataTableToolbar
          table={table}
          searchBy={showSearch ? "symbol" : undefined}
          filters={showFilters ? filters : undefined}
          showColumnToggle={true}
        />
      </div>
      <div className="min-h-0 flex-1 rounded-md border">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <Icons.FileText className="text-muted-foreground mb-2 h-10 w-10" />
                    <p className="text-muted-foreground text-sm">No results found.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
