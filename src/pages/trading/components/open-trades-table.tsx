import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  EmptyPlaceholder,
  GainAmount,
  GainPercent,
  Icons,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui";
import { debounce } from "lodash";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpenPosition } from "../types";
import { TickerAvatar } from "./ticker-avatar";

interface OpenTradesTableProps {
  positions: OpenPosition[];
}

export function OpenTradesTable({ positions }: OpenTradesTableProps) {
  const { t } = useTranslation("trading");
  const [sorting, setSorting] = useState<SortingState>([{ id: "daysOpen", desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  // Debounced search
  const debouncedSearch = useMemo(
    () => debounce((value: string) => setGlobalFilter(value), 200),
    [],
  );

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  // Get unique accounts
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
      },
      {
        accessorKey: "symbol",
        header: t("components.openTrades.table.symbol"),
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
      },
      {
        accessorKey: "accountName",
        header: t("components.openTrades.table.account"),
        cell: ({ row }) => row.original.accountName,
      },
      {
        accessorKey: "quantity",
        header: () => <div className="text-right">{t("components.openTrades.table.quantity")}</div>,
        cell: ({ row }) => (
          <div className="text-right">{row.original.quantity.toLocaleString()}</div>
        ),
      },
      {
        accessorKey: "averageCost",
        header: () => <div className="text-right">{t("components.openTrades.table.avgCost")}</div>,
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.averageCost.toLocaleString("en-US", {
              style: "currency",
              currency: row.original.currency,
            })}
          </div>
        ),
      },
      {
        accessorKey: "currentPrice",
        header: () => <div className="text-right">{t("components.openTrades.table.current")}</div>,
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.currentPrice.toLocaleString("en-US", {
              style: "currency",
              currency: row.original.currency,
            })}
          </div>
        ),
      },
      {
        accessorKey: "unrealizedPL",
        header: () => <div className="text-right">{t("components.openTrades.table.pl")}</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <GainAmount value={row.original.unrealizedPL} currency={row.original.currency} />
          </div>
        ),
      },
      {
        accessorKey: "unrealizedReturnPercent",
        header: () => (
          <div className="text-right">{t("components.openTrades.table.returnPercent")}</div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <GainPercent value={row.original.unrealizedReturnPercent} />
          </div>
        ),
      },
      {
        accessorKey: "daysOpen",
        header: () => <div className="text-center">{t("components.openTrades.table.days")}</div>,
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

  const table = useReactTable({
    data: positions,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const symbol = row.original.symbol.toLowerCase();
      const assetName = row.original.assetName?.toLowerCase() || "";
      const search = filterValue.toLowerCase();
      return symbol.includes(search) || assetName.includes(search);
    },
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  // Apply account filter
  useEffect(() => {
    if (selectedAccounts.size > 0) {
      table
        .getColumn("accountName")
        ?.setFilterValue((value: string) =>
          selectedAccounts.has(positions.find((p) => p.accountName === value)?.accountId || ""),
        );
    } else {
      table.getColumn("accountName")?.setFilterValue(undefined);
    }
  }, [selectedAccounts, table, positions]);

  const hasFilters = globalFilter || selectedAccounts.size > 0;

  if (positions.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center">
        <EmptyPlaceholder
          className="mx-auto flex max-w-[400px] items-center justify-center"
          icon={<Icons.TrendingUp className="h-10 w-10" />}
          title={t("components.openTrades.emptyState.title")}
          description={t("components.openTrades.emptyState.description")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Input
              value={localSearch}
              onChange={(e) => {
                const value = e.target.value;
                setLocalSearch(value);
                debouncedSearch(value);
              }}
              placeholder={t("components.openTrades.search.placeholder", {})}
              className="h-8 w-[200px] pr-8 lg:w-[260px]"
            />
            {localSearch && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-0 right-0 h-8 w-8 p-0 hover:bg-transparent"
                onClick={() => {
                  setLocalSearch("");
                  debouncedSearch("");
                }}
              >
                <Icons.Close className="h-4 w-4" />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>

          {/* Account Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 border-dashed">
                <Icons.ListFilter className="mr-2 h-4 w-4" />
                {t("components.openTrades.filter.account")}
                {selectedAccounts.size > 0 && (
                  <Badge variant="secondary" className="ml-2 rounded-sm px-1 font-normal">
                    {selectedAccounts.size}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search account..." />
                <CommandList>
                  <CommandEmpty>No accounts found.</CommandEmpty>
                  <CommandGroup>
                    {uniqueAccounts.map((account) => {
                      const isSelected = selectedAccounts.has(account.value);
                      return (
                        <CommandItem
                          key={account.value}
                          onSelect={() => {
                            const newSelected = new Set(selectedAccounts);
                            if (isSelected) {
                              newSelected.delete(account.value);
                            } else {
                              newSelected.add(account.value);
                            }
                            setSelectedAccounts(newSelected);
                          }}
                        >
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border ${
                              isSelected ? "bg-primary border-primary text-primary-foreground" : ""
                            }`}
                          >
                            {isSelected && <Icons.Check className="h-3 w-3" />}
                          </div>
                          <span>{account.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  {selectedAccounts.size > 0 && (
                    <>
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => setSelectedAccounts(new Set())}
                          className="justify-center text-center"
                        >
                          Clear filters
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Reset Filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setLocalSearch("");
                setGlobalFilter("");
                setSelectedAccounts(new Set());
              }}
            >
              {t("components.openTrades.filter.reset")}
              <Icons.Close className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
                  {t("components.openTrades.noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-muted-foreground flex-1 text-sm">
            {t("components.openTrades.pagination.info", {
              defaultValue: `${table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-${Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)} of ${table.getFilteredRowModel().rows.length}`,
              from:
                table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1,
              to: Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length,
              ),
              total: table.getFilteredRowModel().rows.length,
            })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {t("components.openTrades.pagination.previous")}
            </Button>
            <div className="text-sm">
              {t("components.openTrades.pagination.page", {
                current: table.getState().pagination.pageIndex + 1,
                total: table.getPageCount(),
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {t("components.openTrades.pagination.next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
