import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { formatAmount } from '@/lib/utils';
import type { ColumnDef, SortingFn } from '@tanstack/react-table';
import { GainPercent } from '@/components/gain-percent';
import { PrivacyAmount } from '@/components/privacy-amount';

import { Skeleton } from '@/components/ui/skeleton';
import { Holding } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { useBalancePrivacy } from '@/context/privacy-context';
import { AmountDisplay } from '@/components/amount-display';
import { QuantityDisplay } from '@/components/quantity-display';
import { useMemo } from 'react';

const numericSortFunction: SortingFn<Holding> = (rowA, rowB, columnId) => {
  const valueA = rowA.getValue(columnId) as number;
  const valueB = rowB.getValue(columnId) as number;
  return valueA - valueB;
};

export const HoldingsTable = ({
  holdings,
  isLoading,
}: {
  holdings: Holding[];
  isLoading: boolean;
}) => {
  const { isBalanceHidden } = useBalancePrivacy();

  const nonCashHoldings = useMemo(() => {
    return holdings.filter((holding) => holding.holdingType !== 'CASH');
  }, [holdings]);

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
  const assetsTypes: { label: string; value: string }[] = nonCashHoldings.reduce(
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
        data={nonCashHoldings}
        columns={getColumns(isBalanceHidden)}
        searchBy="symbol"
        filters={filters}
        defaultColumnVisibility={{
          currency: false,
          symbolName: false,
          holdingType: false,
          bookValue: false,
        }}
        defaultSorting={[{ id: 'symbol', desc: false }]}
        scrollable={true}
      />
    </div>
  );
};

export default HoldingsTable;

const getColumns = (isHidden: boolean): ColumnDef<Holding>[] => [
  {
    id: 'symbol',
    accessorKey: 'symbol',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Position" />,
    meta: {
      label: 'Position',
    },
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
    meta: {
      label: 'Position Name',
    },
    enableHiding: false,
  },
  {
    id: 'quantity',
    accessorKey: 'quantity',
    enableHiding: true,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end text-right" column={column} title="Shares" />
    ),
    meta: {
      label: 'Shares',
    },
    cell: ({ row }) => (
      <div className="flex min-h-[40px] flex-col items-end justify-center">
        <QuantityDisplay value={row.getValue('quantity')} isHidden={isHidden} />
        <div className="text-xs text-transparent">-</div>
      </div>
    ),
    sortingFn: numericSortFunction,
  },
  {
    id: 'marketPrice',
    accessorKey: 'marketPrice',
    enableHiding: true,
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end text-right"
        column={column}
        title="Today's Price"
      />
    ),
    meta: {
      label: "Today's Price",
    },
    cell: ({ row }) => {
      const marketPrice = row.getValue('marketPrice') as number;
      const currency = row.getValue('currency') as string;
      const performance = row.getValue('performance') as any;
      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center">
          <div>{formatAmount(marketPrice, currency)}</div>
          <GainPercent
            className="text-xs text-muted-foreground"
            value={performance?.dayGainPercent}
          ></GainPercent>
        </div>
      );
    },
    sortingFn: numericSortFunction,
  },
  {
    id: 'bookValue',
    accessorKey: 'bookValue',
    enableHiding: true,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Book Cost" />
    ),
    meta: {
      label: 'Book Cost',
    },
    cell: ({ row }) => {
      const bookValue = row.getValue('bookValue') as number;
      const currency = row.getValue('currency') as string;

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center pr-4">
          <PrivacyAmount value={bookValue} currency={currency} />
          <div className="text-xs text-transparent">-</div>
        </div>
      );
    },
    sortingFn: numericSortFunction,
  },
  {
    id: 'marketValue',
    accessorKey: 'marketValue',
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Total Value" />
    ),
    meta: {
      label: 'Total Value',
    },
    cell: ({ row }) => (
      <div className="flex min-h-[40px] flex-col items-end justify-center">
        <AmountDisplay
          value={row.getValue('marketValue')}
          currency={row.getValue('currency')}
          isHidden={isHidden}
        />
        <div className="text-xs text-muted-foreground">{row.getValue('currency')}</div>
      </div>
    ),
    sortingFn: numericSortFunction,
  },

  {
    id: 'performance',
    accessorKey: 'performance',
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Performance" />
    ),
    meta: {
      label: 'Performance',
    },
    cell: ({ row }) => {
      const performance = row.getValue('performance') as any;
      const currency = row.getValue('currency') as string;

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center pr-4">
          <AmountDisplay
            value={performance?.totalGainAmount}
            currency={currency}
            colorFormat={true}
          />
          <GainPercent
            className="text-xs text-muted-foreground"
            value={performance?.totalGainPercent}
          />
        </div>
      );
    },
    filterFn: (row, id, value) => {
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
    meta: {
      label: 'Asset Type',
    },
  },
  {
    id: 'currency',
    accessorKey: 'currency',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
    meta: {
      label: 'Currency',
    },
    cell: ({ row }) => <div>{row.getValue('currency')}</div>,
  },

  {
    id: 'actions',
    enableHiding: false,
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
