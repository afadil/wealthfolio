import React, { useMemo } from 'react';

import { searchActivities } from '@/commands/activity';
import { TickerAvatar } from '@/components/ticker-avatar';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { Icons } from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isFeeActivity,
  isIncomeActivity,
  isSplitActivity,
} from '@/lib/activity-utils';
import { ActivityType, ActivityTypeNames } from '@/lib/constants';
import { QueryKeys } from '@/lib/query-keys';
import { Account, ActivityDetails, ActivitySearchResponse } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { formatAmount } from '@wealthfolio/ui';
import { debounce } from 'lodash';
import { Link } from 'react-router-dom';
import { useActivityMutations } from '../hooks/use-activity-mutations';
import { ActivityOperations } from './activity-operations';

const fetchSize = 25;

const activityTypeOptions = Object.entries(ActivityTypeNames).map(([value, label]) => ({
  label,
  value: value as ActivityType,
}));

export const ActivityTable = ({
  accounts,
  handleEdit,
  handleDelete,
  isEditable,
  onToggleEditable,
}: {
  accounts: Account[];
  handleEdit: (activity?: ActivityDetails) => void;
  handleDelete: (activity: ActivityDetails) => void;
  isEditable: boolean;
  onToggleEditable: (value: boolean) => void;
}) => {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const { duplicateActivityMutation } = useActivityMutations();

  const handleDuplicate = React.useCallback(
    async (activity: ActivityDetails) => duplicateActivityMutation.mutateAsync(activity),
    [duplicateActivityMutation],
  );

  const columns: ColumnDef<ActivityDetails>[] = useMemo(
    () => [
      {
        id: 'assetSymbol',
        accessorKey: 'assetSymbol',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => {
          const symbol = String(row.getValue('assetSymbol'));
          const displaySymbol = symbol.startsWith('$CASH') ? symbol.split('-')[0] : symbol;
          // For TickerAvatar, use $CASH for all cash symbols to get the proper icon
          const avatarSymbol = symbol.startsWith('$CASH') ? '$CASH' : symbol;

          const isCash = symbol.startsWith('$CASH');
          const content = (
            <div className="flex items-center">
              <TickerAvatar symbol={avatarSymbol} className="mr-2 h-8 w-8" />
              <div className="flex flex-col">
                <span className="font-medium">{displaySymbol}</span>
                <span className="text-xs text-muted-foreground">
                  {isCash ? row.getValue('currency') : row.getValue('assetName')}
                </span>
              </div>
            </div>
          );

          if (isCash) {
            return content;
          }

          return (
            <Link to={`/holdings/${encodeURIComponent(symbol)}`} className="-m-1 block p-1">
              {content}
            </Link>
          );
        },
        enableHiding: false,
      },
      {
        id: 'date',
        accessorKey: 'date',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => {
          const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const dateVal = row.getValue('date');
          const formattedDate =
            typeof dateVal === 'string' || dateVal instanceof Date
              ? formatDateTime(dateVal, userTimezone)
              : formatDateTime(String(dateVal), userTimezone);
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
          const activityType = String(row.getValue('activityType'));
          const badgeVariant =
            activityType === 'BUY' ||
            activityType === 'DEPOSIT' ||
            activityType === 'DIVIDEND' ||
            activityType === 'INTEREST' ||
            activityType === 'TRANSFER_IN' ||
            activityType === 'ADD_HOLDING'
              ? 'success'
              : activityType === 'SPLIT'
                ? 'secondary'
                : 'destructive';
          return (
            <div className="flex items-center text-sm">
              <Badge className="whitespace-nowrap text-xs font-normal" variant={badgeVariant}>
                {ActivityTypeNames[activityType as ActivityType]}
              </Badge>
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          const cellValue = row.getValue(id) as string | undefined;
          if (!cellValue) {
            return false;
          }

          return value.includes(cellValue);
        },
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
          const activityType = String(row.getValue('activityType'));
          const quantity = row.getValue('quantity');

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
        id: 'unitPrice',
        accessorKey: 'unitPrice',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title="Price/Amount"
          />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue('activityType'));
          const unitPrice = Number(row.getValue('unitPrice'));
          const amount = row.original.amount;
          const currencyVal = row.getValue('currency');
          const currency = typeof currencyVal === 'string' ? currencyVal : 'USD';
          const assetSymbol = String(row.getValue('assetSymbol'));

          if (activityType === 'FEE') {
            return <div className="pr-4 text-right">-</div>;
          }
          if (activityType === 'SPLIT') {
            return <div className="text-right">{Number(amount).toFixed(0)} : 1</div>;
          }
          if (
            isCashActivity(activityType) ||
            isCashTransfer(activityType, assetSymbol) ||
            isIncomeActivity(activityType)
          ) {
            return <div className="text-right">{formatAmount(amount, currency)}</div>;
          }

          return <div className="text-right">{formatAmount(unitPrice, currency)}</div>;
        },
      },
      {
        id: 'fee',
        accessorKey: 'fee',
        enableHiding: true,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader className="justify-end text-right" column={column} title="Fee" />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue('activityType'));
          const fee = Number(row.getValue('fee'));
          const currencyVal = row.getValue('currency');
          const currency = typeof currencyVal === 'string' ? currencyVal : 'USD';

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
        enableHiding: true,
        header: ({ column }) => (
          <DataTableColumnHeader className="justify-end text-right" column={column} title="Value" />
        ),
        cell: ({ row }) => {
          const activity = row.original;
          const activityType = activity.activityType;
          const currency = activity.currency || 'USD';

          if (activityType === 'SPLIT') {
            return <div className="pr-4 text-right">-</div>;
          }

          const displayValue = calculateActivityValue(activity);
          return <div className="pr-4 text-right">{formatAmount(displayValue, currency)}</div>;
        },
      },
      {
        id: 'currency',
        accessorKey: 'currency',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
        cell: ({ row }) => <div>{row.getValue('currency')}</div>,
        enableHiding: false,
      },
      {
        id: 'account',
        accessorKey: 'accountName',
        enableSorting: false,
        enableHiding: true,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => {
          return (
            <div className="ml-2 flex min-w-[150px] flex-col">
              <span>{row.getValue('account')}</span>
              <span className="text-xs font-light">{row.getValue('accountCurrency')}</span>
            </div>
          );
        },
      },
      {
        id: 'assetName',
        accessorKey: 'assetName',
        enableHiding: false,
      },
      {
        id: 'accountCurrency',
        accessorKey: 'accountCurrency',
        enableHiding: false,
      },
      {
        id: 'accountId',
        accessorKey: 'accountId',
        filterFn: (row, id, value: string) => {
          const cellValue = row.getValue(id) as string | undefined;
          if (!cellValue) {
            return false;
          }

          return value.includes(cellValue);
        },
        enableHiding: false,
      },
      {
        id: 'actions',
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

  const accountOptions =
    accounts
      ?.filter((account) => account.isActive)
      .map((account) => ({
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
    queryKey: [QueryKeys.ACTIVITY_DATA, columnFilters, globalFilter, sorting[0], sorting.length],
    queryFn: async (context) => {
      const pageParam = (context.pageParam as number) ?? 0;
      // convert columnFilters to an object
      const columnFiltersObj = columnFilters.reduce<Record<string, unknown>>(
        (acc, curr) => {
          acc[curr.id] = curr.value;
          return acc;
        },
        {} as Record<string, unknown>,
      );

      // get sorting first element if exists
      const sortingObj: { id: string; desc: boolean } | undefined =
        sorting.length > 0 ? (sorting[0] as { id: string; desc: boolean }) : undefined;

      const fetchedData = searchActivities(
        pageParam,
        fetchSize,
        columnFiltersObj,
        globalFilter,
        sortingObj as { id: string; desc: boolean },
      );
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    initialPageParam: 0,
  });

  const { flatData, totalDBRowCount }: { flatData: ActivityDetails[]; totalDBRowCount: number } =
    React.useMemo(() => {
      const pages = data?.pages ?? [];
      return {
        flatData: pages.flatMap((page) => page.data),
        totalDBRowCount: pages[0]?.meta?.totalRowCount ?? 0,
      };
    }, [data]);
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
    [fetchNextPage, isFetching, isLoading, totalFetched, totalDBRowCount],
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
    initialState: {
      columnVisibility: {
        accountId: false,
        accountCurrency: false,
        assetName: false,
        currency: false,
      },
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },

    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  });

  if (isLoading) {
    return <>Loading...</>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <DataTableToolbar table={table} searchBy="assetSymbol" filters={filtersOptions} />
        <ToggleGroup
          type="single"
          size="sm"
          value={isEditable ? 'edit' : 'view'}
          onValueChange={(value: string) => {
            if (value === 'edit') {
              onToggleEditable(true);
            } else if (value === 'view') {
              onToggleEditable(false);
            }
          }}
          aria-label="Table view mode"
          className="rounded-md bg-muted p-0.5"
        >
          <ToggleGroupItem
            value="view"
            aria-label="View mode"
            className="rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50 hover:text-accent-foreground data-[state=off]:bg-transparent data-[state=on]:bg-background data-[state=off]:text-muted-foreground data-[state=on]:text-accent-foreground"
          >
            <Icons.Rows3 className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="edit"
            aria-label="Edit mode"
            className="rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50 hover:text-accent-foreground data-[state=off]:bg-transparent data-[state=on]:bg-background data-[state=off]:text-muted-foreground data-[state=on]:text-accent-foreground"
          >
            <Icons.Grid3x3 className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto rounded-md border"
        onScroll={(e) => fetchMoreOnBottomReachedDebounced(e.target as HTMLDivElement)}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted-foreground/5">
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
      <div className="mt-2 flex shrink-0 pl-2 text-xs text-muted-foreground">
        {isFetching ? <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
        {totalFetched} / {totalDBRowCount} activities
      </div>
    </div>
  );
};

export default ActivityTable;
