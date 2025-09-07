import { useMemo, useState } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
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
} from '@tanstack/react-table';

import { Icons } from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { DataTableFacetedFilterProps } from '@/components/ui/data-table/data-table-faceted-filter';
import type { Account, ActivityImport } from '@/lib/types';
import { formatAmount } from '@wealthfolio/ui';
import { formatDateTime, toPascalCase, cn } from '@/lib/utils';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

// Helper function to check if a field has errors
const hasFieldError = (activity: ActivityImport, fieldName: string): boolean => {
  return !!activity.errors && !!activity.errors[fieldName] && activity.errors[fieldName].length > 0;
};

// Helper function to get error message for a field
const getFieldErrorMessage = (activity: ActivityImport, fieldName: string): string[] => {
  if (activity.errors && activity.errors[fieldName]) {
    return activity.errors[fieldName];
  }
  return [];
};

// Helper function to safely format numbers, handling NaN/null/undefined values
const safeFormatAmount = (value: number | null | undefined, currency: string): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return formatAmount(value, currency);
};

// Helper function to safely display number values
const safeDisplayNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return value.toString();
};

export const ImportPreviewTable = ({ activities, accounts }: { activities: ActivityImport[], accounts: Account[] }) => {
  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'lineNumber',
      desc: false,
    },
  ]);
  
  // Determine initial column filters based on whether activities have errors
  const initialColumnFilters = useMemo<ColumnFiltersState>(() => {
    const hasActivitiesWithErrors = activities.some(activity => !activity.isValid);
    return hasActivitiesWithErrors ? [{ id: 'isValid', value: ['false'] }] : [];
  }, [activities]);
  
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    symbolName: false,
    accountName: false,
    lineNumber: false,
    validationErrors: false,
  });

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

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
      [] as Array<{ label: string; value: string }>,
    );
  }, [activities]);

  const filters = [
    {
      id: 'isValid',
      title: 'Status',
      options: [
        { label: 'Error', value: 'false' },
        { label: 'Valid', value: 'true' },
      ],
    },
    {
      id: 'activityType',
      title: 'Type',
      options: activitiesType,
    },
  ] satisfies DataTableFacetedFilterProps<ActivityImport, string>[];

  const table = useReactTable({
    data: activities,
    columns: getColumns(accounts),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <div className="pt-0">
      <div className="space-y-2">
        <DataTableToolbar table={table} searchBy="symbol" filters={filters} />
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
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    key={row.id}
                    className={cn(
                      'group transition-colors hover:bg-muted/50 dark:hover:bg-muted/10',
                      row.getValue('isValid')
                        ? index % 2 === 0
                          ? 'bg-background'
                          : 'bg-muted/20'
                        : 'bg-destructive/5 dark:bg-destructive/10',
                    )}
                    data-state={row.getValue('isValid') ? 'valid' : 'invalid'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'relative py-2 px-4',
                          cell.column.id === 'isValid' &&
                            'sticky left-0 z-20 border-r border-border bg-muted/30 p-2 w-[60px]',
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
                      <Icons.FileText className="h-10 w-10 text-muted-foreground opacity-40" />
                      <p className="text-sm text-muted-foreground">No activities found</p>
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

export default ImportPreviewTable;

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
          <div className="absolute inset-0 cursor-help bg-destructive/10">
            <div className="relative h-full w-full flex items-center justify-between px-4 py-2">
              <div className="flex-1 mr-2">{children}</div>
              <Icons.AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-[400px] space-y-2 border-none bg-destructive p-3 text-destructive-foreground shadow-lg dark:border-destructive"
        >
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


function getColumns(accounts: Account[]): ColumnDef<ActivityImport>[] {
  return [
    {
      id: 'lineNumber',
      accessorKey: 'lineNumber',
    },
    {
      id: 'isValid',
      accessorKey: 'isValid',
      header: () => <span className="sr-only">Status</span>,
      cell: ({ row }) => {
        const isValid = row.getValue('isValid') as boolean;
        const errors = row.original.errors || {};
        const lineNumber = row.original.lineNumber;

        // Format all errors for tooltip display
        const allErrors = Object.entries(errors).flatMap(([field, fieldErrors]) =>
          fieldErrors.map((err) => `${field}: ${err}`),
        );

        return isValid ? (
          <div className="flex items-center gap-1 text-xs w-[60px]">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success">
              <Icons.CheckCircle className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs text-muted-foreground">{String(lineNumber).padStart(2, '0')}</span>
          </div>
        ) : (
          <TooltipProvider>
            <Tooltip delayDuration={30}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-xs w-[60px] cursor-help">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                    <Icons.XCircle className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs text-muted-foreground">{String(lineNumber).padStart(2, '0')}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent 
                side="right"
                sideOffset={10}
                className="max-w-xs border-none bg-destructive p-3 text-destructive-foreground"
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
        const isValid = row.getValue(id) as boolean;
        const filterBoolean = filterValue[0] === 'true';
        return isValid === filterBoolean;
      },
      sortingFn: (rowA, rowB, id) => {
        const statusA = rowA.getValue(id) as boolean;
        const statusB = rowB.getValue(id) as boolean;
        return statusA === statusB ? 0 : statusA ? -1 : 1;
      },
    },
    {
      id: 'account',
      accessorKey: 'account',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
      cell: ({ row }) => {
        const accountId = row.original.accountId as string;
        const hasError = hasFieldError(row.original, 'accountId');
        const errorMessages = getFieldErrorMessage(row.original, 'accountId');
        const account = accounts.find((acc) => acc.id === accountId);

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <Badge variant="outline" className="font-medium">
              {account?.name || '-'}
            </Badge>
          </ErrorCell>
        );
      },
    },
    {
      id: 'date',
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => {
        const formattedDate = formatDateTime(row.getValue('date'));
        const hasError = hasFieldError(row.original, 'date');
        const errorMessages = getFieldErrorMessage(row.original, 'date');

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <div className="flex flex-col">
              <span className="text-xs">{formattedDate.date}</span>
              <span className="text-xs text-muted-foreground">{formattedDate.time}</span>
            </div>
          </ErrorCell>
        );
      },
    },
    {
      id: 'activityType',
      accessorKey: 'activityType',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => {
        const type = row.getValue('activityType') as string;
        const hasError = hasFieldError(row.original, 'activityType');
        const errorMessages = getFieldErrorMessage(row.original, 'activityType');
        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <Badge variant="outline">{type}</Badge>
          </ErrorCell>
        );
      },
      filterFn: (row, id, value: string) => {
        return value.includes(row.getValue(id));
      },
    },
    {
      id: 'symbol',
      accessorKey: 'symbol',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Symbol" />,
      cell: ({ row }) => {
        const hasError = hasFieldError(row.original, 'symbol');
        const errorMessages = getFieldErrorMessage(row.original, 'symbol');
        const symbol = row.getValue('symbol') as String;

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            {symbol && symbol.length > 0 ? (
              <Badge variant="secondary" className="min-w-[50px] rounded-sm text-xs font-medium">
                {symbol}
              </Badge>
            ) : (
              '-'
            )}
          </ErrorCell>
        );
      },
      sortingFn: (rowA, rowB, id) => {
        const profileA = rowA.getValue(id) as string;
        const profileB = rowB.getValue(id) as string;
        return profileA.localeCompare(profileB);
      },
      enableHiding: false,
    },
    {
      id: 'quantity',
      accessorKey: 'quantity',
      enableHiding: false,
      header: ({ column }) => (
        <DataTableColumnHeader className="justify-end text-right" column={column} title="Shares" />
      ),
      cell: ({ row }) => {
        const activityType = row.getValue('activityType') as string;
        const quantity = row.getValue('quantity') as number;
        const hasError = hasFieldError(row.original, 'quantity');
        const errorMessages = getFieldErrorMessage(row.original, 'quantity');

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <div className="text-right font-medium tabular-nums">
              {activityType === 'SPLIT' ? '-' : safeDisplayNumber(quantity)}
            </div>
          </ErrorCell>
        );
      },
    },
    {
      id: 'unitPrice',
      accessorKey: 'unitPrice',
      enableHiding: false,
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader className="justify-end text-right" column={column} title="Price" />
      ),
      cell: ({ row }) => {
        const activityType = row.getValue('activityType') as string;
        const unitPrice = row.getValue('unitPrice') as number;
        const currency = (row.getValue('currency') as string) || 'USD';
        const hasError = hasFieldError(row.original, 'unitPrice');
        const errorMessages = getFieldErrorMessage(row.original, 'unitPrice');

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <div className="text-right font-medium tabular-nums">
              {activityType === 'SPLIT'
                ? (isNaN(unitPrice) ? '-' : unitPrice.toFixed(0)) + ' : 1'
                : safeFormatAmount(unitPrice, currency)}
            </div>
          </ErrorCell>
        );
      },
    },
    {
      id: 'amount',
      accessorKey: 'amount',
      header: ({ column }) => (
        <DataTableColumnHeader className="justify-end text-right" column={column} title="Amount" />
      ),
      cell: ({ row }) => {
        const activityType = row.getValue('activityType') as string;
        const amount = row.getValue('amount') as number;
        const currency = (row.getValue('currency') as string) || 'USD';

        // Check if amount field has errors directly
        const hasError = hasFieldError(row.original, 'amount');
        const errorMessages = getFieldErrorMessage(row.original, 'amount');

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <div className="text-right font-medium tabular-nums">
              {activityType === 'SPLIT'
                ? '-'
                : safeFormatAmount(amount, currency)}
            </div>
          </ErrorCell>
        );
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
        const hasError = hasFieldError(row.original, 'fee');
        const errorMessages = getFieldErrorMessage(row.original, 'fee');

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <div className="text-right tabular-nums text-muted-foreground">
              {activityType === 'SPLIT' ? '-' : safeFormatAmount(fee, currency)}
            </div>
          </ErrorCell>
        );
      },
    },

    {
      id: 'currency',
      accessorKey: 'currency',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
      cell: ({ row }) => {
        const hasError = hasFieldError(row.original, 'currency');
        const errorMessages = getFieldErrorMessage(row.original, 'currency');
        const currency = (row.getValue('currency') as string) || '-';

        return (
          <ErrorCell hasError={hasError} errorMessages={errorMessages}>
            <Badge variant="outline" className="font-medium">
              {currency}
            </Badge>
          </ErrorCell>
        );
      },
    },
  ];
}