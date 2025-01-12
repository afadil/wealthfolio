import React, { useMemo } from 'react';

import { debounce } from 'lodash';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { formatDateTime, formatAmount } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Account, ActivityDetails, ActivitySearchResponse } from '@/lib/types';
import { ActivityOperations } from './activity-operations';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useInfiniteQuery } from '@tanstack/react-query';
import { searchActivities } from '@/commands/activity';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Icons } from '@/components/icons';
import { Link } from 'react-router-dom';

const fetchSize = 25;

const activityTypeOptions = [
  { label: 'Buy', value: 'BUY' },
  { label: 'Sell', value: 'SELL' },
  { label: 'Deposit', value: 'DEPOSIT' },
  { label: 'Withdrawal', value: 'WITHDRAWAL' },
  { label: 'Dividend', value: 'DIVIDEND' },
  { label: 'Transfer In', value: 'TRANSFER_IN' },
  { label: 'Transfer Out', value: 'TRANSFER_OUT' },
  { label: 'Conversion In', value: 'CONVERSION_IN' },
  { label: 'Conversion Out', value: 'CONVERSION_OUT' },
  { label: 'Fee', value: 'FEE' },
  { label: 'Tax', value: 'TAX' },
  { label: 'Interest', value: 'INTEREST' },
];

const CASH_ACTIVITY_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST'];

export const ActivityTable = ({
  accounts,
  handleEdit,
  handleDelete,
}: {
  accounts: Account[];
  handleEdit: (activity?: ActivityDetails) => void;
  handleDelete: (activity: ActivityDetails) => void;
}) => {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns: ColumnDef<ActivityDetails>[] = useMemo(
    () => [
      {
        id: 'date',
        accessorKey: 'date',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => {
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const formattedDate = formatDateTime(row.getValue('date'), userTimezone);
          return (
            <div className="ml-2 flex flex-col">
              <span>{formattedDate.date}</span>
              <span className="text-xs font-light">{formattedDate.time}</span>
            </div>
          );
        },
      },
      {
        id: 'activityType',
        accessorKey: 'activityType',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => {
          const activityType = row.getValue('activityType') as string;
          const badgeVariant =
            activityType === 'BUY' ||
            activityType === 'DEPOSIT' ||
            activityType === 'DIVIDEND' ||
            activityType === 'INTEREST' ||
            activityType === 'CONVERSION_IN' ||
            activityType === 'TRANSFER_IN'
              ? 'success'
              : activityType === 'SPLIT'
                ? 'secondary'
                : 'destructive';
          return (
            <div className="flex items-center text-sm">
              <Badge className="text-xs font-normal" variant={badgeVariant}>
                {activityType}
              </Badge>
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          return value.includes(row.getValue(id));
        },
      },

      {
        id: 'assetSymbol',
        accessorKey: 'assetSymbol',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => {
          let ogSymbol = row.getValue('assetSymbol') as string;
          let symbol = ogSymbol.split('.')[0];
          if (symbol.startsWith('$CASH')) {
            symbol = symbol.split('-')[0];
          }
          return (
            <div className="w-3/3 flex items-center">
              <Link to={`/holdings/${ogSymbol}`}>
                <Badge className="flex min-w-[50px] cursor-pointer items-center justify-center rounded-sm">
                  {symbol}
                </Badge>
              </Link>

              <span className="ml-2 text-xs">{row.getValue('assetName')}</span>
            </div>
          );
        },
        enableHiding: false,
      },
      {
        id: 'quantity',
        accessorKey: 'quantity',
        enableHiding: false,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title="Shares"
          />
        ),
        cell: ({ row }) => {
          const activityType = row.getValue('activityType') as string;
          const quantity = row.getValue('quantity') as number;

          if (CASH_ACTIVITY_TYPES.includes(activityType) || activityType === 'SPLIT') {
            return <div className="pr-4 text-right">-</div>;
          }

          return <div className="pr-4 text-right">{quantity}</div>;
        },
      },
      {
        id: 'unitPrice',
        accessorKey: 'unitPrice',
        enableHiding: false,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title="Price/Amount"
          />
        ),
        cell: ({ row }) => {
          const activityType = row.getValue('activityType') as string;
          const unitPrice = row.getValue('unitPrice') as number;
          const currency = (row.getValue('currency') as string) || 'USD';

          if (activityType === 'SPLIT') {
            return <div className="text-right">{unitPrice.toFixed(0)} : 1</div>;
          }
          if (activityType === 'FEE') {
            return <div className="pr-4 text-right">-</div>;
          }
          return <div className="text-right">{formatAmount(unitPrice, currency)}</div>;
        },
      },
      {
        id: 'fee',
        accessorKey: 'fee',
        enableHiding: false,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader className="justify-end text-right" column={column} title="Fee" />
        ),
        cell: ({ row }) => {
          const activityType = row.getValue('activityType') as string;
          const fee = row.getValue('fee') as number;
          const currency = (row.getValue('currency') as string) || 'USD';

          return (
            <div className="text-right">
              {activityType === 'SPLIT' ? '-' : formatAmount(fee, currency)}
            </div>
          );
        },
      },
      {
        id: 'value',
        accessorKey: 'value',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader className="justify-end text-right" column={column} title="Value" />
        ),
        cell: ({ row }) => {
          const activityType = row.getValue('activityType') as string;
          const unitPrice = row.getValue('unitPrice') as number;
          const quantity = row.getValue('quantity') as number;
          const currency = (row.getValue('currency') as string) || 'USD';
          const fee = row.getValue('fee') as number;

          if (activityType === 'SPLIT') {
            return <div className="pr-4 text-right">-</div>;
          }

          if (activityType === 'FEE') {
            return <div className="pr-4 text-right">{formatAmount(fee, currency)}</div>;
          }

          return (
            <div className="pr-4 text-right">{formatAmount(unitPrice * quantity, currency)}</div>
          );
        },
      },
      {
        id: 'currency',
        accessorKey: 'currency',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
        cell: ({ row }) => <div>{row.getValue('currency')}</div>,
      },
      {
        id: 'accountName',
        accessorKey: 'accountName',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => {
          return (
            <div className="ml-2 flex min-w-[150px] flex-col">
              <span>{row.getValue('accountName')}</span>
              <span className="text-xs font-light">{row.getValue('accountCurrency')}</span>
            </div>
          );
        },
      },
      {
        id: 'assetName',
        accessorKey: 'assetName',
      },
      {
        id: 'accountCurrency',
        accessorKey: 'accountCurrency',
      },
      {
        id: 'accountId',
        accessorKey: 'accountId',
        filterFn: (row, id, value: string) => {
          return value.includes(row.getValue(id));
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          return <ActivityOperations row={row} onEdit={handleEdit} onDelete={handleDelete} />;
        },
      },
    ],
    [handleEdit, handleDelete],
  );

  const accountOptions =
    accounts?.map((account) => ({
      label: account.name + '-(' + account.currency + ')',
      value: account.id,
      currency: account.currency,
    })) || [];

  const filtersOptions = [
    {
      id: 'accountId',
      title: 'Account',
      options: accountOptions,
    },
    {
      id: 'activityType',
      title: 'Activity Type',
      options: activityTypeOptions,
    },
  ];

  const { data, fetchNextPage, isFetching, isLoading } = useInfiniteQuery<
    ActivitySearchResponse,
    Error
  >({
    queryKey: ['activity-data', columnFilters, globalFilter, sorting],
    queryFn: async ({ pageParam = 0 }: { pageParam?: any }) => {
      // convert columnFilters to an object
      const columnFiltersObj = columnFilters.reduce((acc, curr) => {
        acc[curr.id] = curr.value;
        return acc;
      }, {} as any);

      // get sorting first element if exists
      const sortingObj = sorting.length > 0 ? sorting[0] : undefined;

      const fetchedData = searchActivities(
        pageParam,
        fetchSize,
        columnFiltersObj,
        globalFilter,
        sortingObj as any,
      );
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    initialPageParam: 0,
  });

  const flatData = React.useMemo(() => data?.pages?.flatMap((page) => page.data) ?? [], [data]);
  const totalDBRowCount = data?.pages?.[0]?.meta?.totalRowCount ?? 0;
  const totalFetched = flatData.length;

  const fetchMoreOnBottomReached = React.useCallback(
    (containerRefElement?: HTMLDivElement | null) => {
      if (containerRefElement) {
        const { scrollHeight, scrollTop, clientHeight } = containerRefElement;
        //once the user has scrolled within 300px of the bottom of the table, fetch more data if there is any
        if (
          scrollHeight - scrollTop - clientHeight < 300 &&
          !isFetching &&
          !isLoading &&
          totalFetched < totalDBRowCount
        ) {
          fetchNextPage();
        }
      }
    },
    [fetchNextPage, isFetching, totalFetched, totalDBRowCount],
  );

  const fetchMoreOnBottomReachedDebounced = React.useMemo(
    () => debounce(fetchMoreOnBottomReached, 300),
    [fetchMoreOnBottomReached],
  );

  React.useEffect(() => {
    fetchMoreOnBottomReachedDebounced();
    return () => fetchMoreOnBottomReachedDebounced.cancel();
  }, [fetchMoreOnBottomReachedDebounced]);

  const table = useReactTable({
    data: flatData,
    columns,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility: {
        accountId: false,
        accountCurrency: false,
        assetName: false,
        currency: false,
      },
    },

    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  });

  if (isLoading) {
    return <>Loading...</>;
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} searchBy="assetSymbol" filters={filtersOptions} />

      <div
        className="h-[700px] overflow-y-auto rounded-md border"
        onScroll={(e) => fetchMoreOnBottomReachedDebounced(e.target as HTMLDivElement)}
      >
        <Table>
          <TableHeader className="bg-muted-foreground/5">
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
      <div className="flex pl-2 text-xs text-muted-foreground">
        {isFetching ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
        {totalFetched} / {totalDBRowCount} activities
      </div>
    </div>
  );
};

export default ActivityTable;
