import { DataTable } from '@/components/ui/data-table';
import { useMemo } from 'react';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Account, ActivityImport } from '@/lib/types';
import { formatAmount, toPascalCase } from '@/lib/utils';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

export const ImportedActivitiesTable = ({
                                          activities,
                                        }: {
  accounts: Account[];
  activities: ActivityImport[];
  editModalVisible: boolean;
  toggleEditModal: () => void;
}) => {
  const activitiesType = useMemo(() => {
    const uniqueTypesSet = new Set();
    return activities.reduce(
        (result, activity) => {
          //@ts-ignore
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
  ];

  const defaultSorting: SortingState = [
    {
      id: 'isValid',
      desc: false,
    },
  ];

  return (
      <div className="pt-4">
        <DataTable
            data={activities}
            columns={columns}
            searchBy="symbol"
            filters={filters}
            defaultSorting={defaultSorting}
            defaultColumnVisibility={{
              symbolName: false,
              accountName: false,
              lineNumber: false,
              error: false,
            }}
        />
      </div>
  );
};

export default ImportedActivitiesTable;

// Update formatDate function to accept a timezone argument
export const formatDate = (date: string | Date, timezone?: string) => {
  if (!date) return '-';
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZone: timezone || 'UTC', // Default to UTC if timezone is not provided
  };
  return new Intl.DateTimeFormat('en-US', options).format(new Date(date));
};

export const columns: ColumnDef<ActivityImport>[] = [
  {
    id: 'isValid',
    accessorKey: 'isValid',
    header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
    cell: ({ row }) => {
      const isValid = row.getValue('isValid') as string;
      const error = row.getValue('error') as string;
      const lineNumber = row.getValue('lineNumber') as number;

      return (
          <div className="flex items-center">
            {isValid === 'true' ? (
                <Icons.CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Icons.XCircle className="h-4 w-4 cursor-help text-red-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-red-500">{error}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
            )}
            <div className="pl-2 text-gray-400">{lineNumber}</div>
          </div>
      );
    },
    filterFn: (row, id, value: string) => {
      const isValid = row.getValue(id) as any;
      return value.includes(isValid);
    },
    sortingFn: (rowA, rowB, id) => {
      const statusA = rowA.getValue(id) as any;
      const statusB = rowB.getValue(id) as any;
      return statusA.localeCompare(statusB);
    },
  },
  {
    id: 'date',
    accessorKey: 'date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // Get user timezone
      return <div>{formatDate(row.getValue('date'), userTimezone) || '-'}</div>;
    },
  },
  {
    id: 'activityType',
    accessorKey: 'activityType',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => {
      const type = row.getValue('activityType') as string;
      const badgeVariant = type === 'BUY' ? 'success' : 'error';
      return (
          <div className="flex items-center">
            <Badge variant={badgeVariant}>{type}</Badge>
          </div>
      );
    },
    filterFn: (row, id, value: string) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: 'symbolName',
    accessorKey: 'symbolName',
  },
  {
    id: 'accountName',
    accessorKey: 'accountName',
  },
  {
    id: 'lineNumber',
    accessorKey: 'lineNumber',
  },
  {
    id: 'error',
    accessorKey: 'error',
  },
  {
    id: 'symbol',
    accessorKey: 'symbol',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      return (
          <div className="flex items-center">
            <Badge className="flex min-w-[50px] items-center justify-center rounded-sm">
              {row.getValue('symbol')}
            </Badge>
            <span className="ml-2">{row.getValue('symbolName')}</span>
          </div>
      );
    },
    sortingFn: (rowA, rowB, id) => {
      const profileA = rowA.getValue(id) as any;
      const profileB = rowB.getValue(id) as any;
      return profileA.localeCompare(profileB);
    },

    enableHiding: false,
  },
  {
    id: 'quantity',
    accessorKey: 'quantity',
    enableHiding: false,
    header: ({ column }) => (
        <DataTableColumnHeader className="justify-end text-right" column={column} title="Quantity" />
    ),
    cell: ({ row }) => <div className="text-right">{row.getValue('quantity')}</div>,
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
            title="Unit Price"
        />
    ),
    cell: ({ row }) => {
      const unitPrice = row.getValue('unitPrice') as number;
      const currency = (row.getValue('currency') as string) || 'USD';
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
      const fee = row.getValue('fee') as number;
      const currency = (row.getValue('currency') as string) || 'USD';
      return <div className="text-right">{formatAmount(fee, currency)}</div>;
    },
  },
  {
    id: 'value',
    accessorKey: 'value',
    header: ({ column }) => (
        <DataTableColumnHeader className="justify-end text-right" column={column} title="Value" />
    ),
    cell: ({ row }) => {
      const unitPrice = row.getValue('unitPrice') as number;
      const quantity = row.getValue('quantity') as number;
      const currency = (row.getValue('currency') as string) || 'USD';

      return <div className="text-right">{formatAmount(unitPrice * quantity, currency)}</div>;
    },
  },
  {
    id: 'currency',
    accessorKey: 'currency',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
    cell: ({ row }) => <div>{row.getValue('currency')}</div>,
  },
  {
    id: 'account',
    accessorKey: 'account',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
    cell: ({ row }) => {
      return (
          <div className="ml-2 flex flex-col">
            <span>{row.getValue('accountName')}</span>
            <span className="text-xs font-light">{row.getValue('currency')}</span>
          </div>
      );
    },
  },
  {
    id: 'actions',
    cell: () => {
      return <div>...</div>;
    },
  },
];

