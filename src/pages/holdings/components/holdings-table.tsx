import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { formatAmount, formatStockQuantity } from '@/lib/utils';
import type { Row, ColumnDef, RowData } from '@tanstack/react-table';
import { GainAmount } from '@/components/gain-amount';
import { GainPercent } from '@/components/gain-percent';

import { Skeleton } from '@/components/ui/skeleton';
import { Holding } from '@/lib/types';
import { useNavigate } from 'react-router-dom';

 
const numericSortFunction = (rowA:Row<RowData>, rowB: Row<RowData>, columnId: string) => {
  const valueA = rowA.getValue(columnId) as number;
  const valueB = rowB.getValue(columnId) as number;
  return valueA - valueB
}


export const HoldingsTable = ({
  holdings,
  isLoading,
}: {
  holdings: Holding[];
  isLoading: boolean;
}) => {
  if (isLoading) {
    return (
      <div className="space-y-4 pt-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const uniqueTypesSet = new Set();
  const assetsTypes: { label: string; value: string }[] = holdings.reduce(
    (result: { label: string; value: string }[], asset) => {
      const type = asset?.holdingType;
      if (type && !uniqueTypesSet.has(type)) {
        uniqueTypesSet.add(type);
        result.push({ label: type.toUpperCase(), value: type });
      }
      return result;
    },
    [],
  );

  const filters = [
    {
      id: 'holdingType',
      title: 'Type',
      options: assetsTypes,
    },
  ];
  return (
    <div className="pt-6">
      <DataTable
        data={holdings}
        columns={columns}
        searchBy="symbol"
        filters={filters}
        defaultColumnVisibility={{ currency: false, symbolName: false, holdingType: false }}
        defaultSorting={[{ id: 'symbol', desc: false }]}
        scrollable={true}
      />
    </div>
  );
};

export default HoldingsTable;

export const columns: ColumnDef<Holding>[] = [
  {
    id: 'symbol',
    accessorKey: 'symbol',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => {
      const navigate = useNavigate();
      let ogSymbol = row.getValue('symbol') as string;
      const symbolName = row.getValue('symbolName') as string;
      let symbol = ogSymbol.split('.')[0];
      if (symbol.startsWith('$CASH')) {
        symbol = symbol.split('-')[0];
      }
      const handleNavigate = () => {
        navigate(`/holdings/${ogSymbol}`, { state: { holding: row.original } });
      };
      return (
        <div className="flex items-center">
          <Badge
            className="flex min-w-[50px] cursor-pointer items-center justify-center rounded-sm"
            onClick={handleNavigate}
          >
            {symbol}
          </Badge>

          <span className="ml-2">{symbolName}</span>
        </div>
      );
    },
    sortingFn: (rowA, rowB, id) => {
      const symbolA = rowA.getValue(id) as any;
      const symbolB = rowB.getValue(id) as any;
      return symbolA.localeCompare(symbolB);
    },
    filterFn: (row, _id, value) => {
      let symbol = row.getValue('symbol') as string;
      const symbolName = row.getValue('symbolName') as string;
      return (
        symbol.toLowerCase().includes(value.toLowerCase()) ||
        symbolName.toLowerCase().includes(value.toLowerCase())
      );
    },

    enableHiding: false,
  },
  {
    id: 'symbolName',
    accessorKey: 'symbolName',
  },
  {
    id: 'quantity',
    accessorKey: 'quantity',
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end text-right" column={column} title="Quantity" />
    ),
    cell: ({ row }) => {
      return <div className="text-right">{formatStockQuantity(row.getValue('quantity'))}</div>;
    },
    sortingFn: numericSortFunction
  },
  {
    id: 'marketPrice',
    accessorKey: 'marketPrice',
    enableHiding: false,
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end text-right"
        column={column}
        title="Market Price"
      />
    ),
    cell: ({ row }) => {
      const marketPrice = row.getValue('marketPrice') as number;
      const currency = row.getValue('currency') as string;
      return <div className="text-right">{formatAmount(marketPrice, currency)}</div>;
    },
    sortingFn: numericSortFunction
  },
  {
    id: 'bookValue',
    accessorKey: 'bookValue',
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Book Cost" />
    ),
    cell: ({ row }) => {
      const bookValue = row.getValue('bookValue') as number;
      const currency = row.getValue('currency') as string;

      return <div className="pr-4 text-right">{formatAmount(bookValue, currency)}</div>;
    },
    sortingFn: numericSortFunction
  },
  {
    id: 'marketValue',
    accessorKey: 'marketValue',
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Market Value" />
    ),
    cell: ({ row }) => {
      const performance = row.getValue('performance');
      // @ts-ignore
      const isLoading = performance?.isLoading || false;
      const marketValue = row.getValue('marketValue') as number;
      const currency = row.getValue('currency') as string;

      return (
        <div className="items-end pr-4 text-right font-semibold">
          {isLoading ? (
            <Icons.Spinner className="ml-auto h-4 w-4 animate-spin" />
          ) : (
            formatAmount(marketValue, currency)
          )}
        </div>
      );
    },
    sortingFn: numericSortFunction
  },

  {
    id: 'performance',
    accessorKey: 'performance',
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Performance" />
    ),
    cell: ({ row }) => {
      const performance = row.getValue('performance') as any;
      const currency = row.getValue('currency') as string;

      return (
        <div className="pr-4">
          <GainAmount
            className="text-sm"
            value={performance?.totalGainAmount}
            currency={currency}
          ></GainAmount>
          <GainPercent className="text-sm" value={performance?.totalGainPercent}></GainPercent>
        </div>
      );
    },
    filterFn: (row, id, value: string) => {
      const account = row.getValue(id) as any;
      return value.includes(account.id);
    },
    sortingFn: (rowA, rowB, id) => {
      const performanceA = rowA.getValue(id) as any;
      const performanceB = rowB.getValue(id) as any;
      return performanceA.totalGainPercent - performanceB.totalGainPercent;
    },
  },
  {
    id: 'holdingType',
    accessorKey: 'holdingType',
    // header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    // cell: ({ row }) => <div>{row.getValue('holdingType')}</div>,
    // filterFn: (row, id, value: string) => {
    //   return value.includes(row.getValue(id));
    // },
    // sortingFn: (rowA, rowB, id) => {
    //   const typeA = rowA.getValue(id) as any;
    //   const typeB = rowB.getValue(id) as any;
    //   return typeA.localeCompare(typeB);
    // },
  },
  {
    id: 'currency',
    accessorKey: 'currency',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
    cell: ({ row }) => <div>{row.getValue('currency')}</div>,
  },

  {
    id: 'actions',
    cell: ({ row }) => {
      const navigate = useNavigate();
      const symbol = row.getValue('symbol') as String;
      const handleNavigate = () => {
        navigate(`/holdings/${symbol}`, { state: { holding: row.original } });
      };

      return (
        <div>
          <Button variant="ghost" size="sm" onClick={handleNavigate}>
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      );
    },
  },
];
