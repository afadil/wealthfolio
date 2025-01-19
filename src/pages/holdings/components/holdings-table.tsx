import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { formatAmount } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import { GainPercent } from '@/components/gain-percent';
import { PrivacyAmount } from '@/components/privacy-amount';

import { Skeleton } from '@/components/ui/skeleton';
import { Holding } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { useBalancePrivacy } from '@/context/privacy-context';
import { AmountDisplay } from '@/components/amount-display';
import { QuantityDisplay } from '@/components/quantity-display';
import { useMemo, useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const HoldingsTable = ({
  holdings,
  isLoading,
}: {
  holdings: Holding[];
  isLoading: boolean;
}) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const [showConvertedValues, setShowConvertedValues] = useState(false);

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
        columns={getColumns(isBalanceHidden, showConvertedValues, setShowConvertedValues)}
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

const getColumns = (
  isHidden: boolean,
  showConvertedValues: boolean,
  setShowConvertedValues: (value: boolean) => void,
): ColumnDef<Holding>[] => [
  {
    id: 'symbol',
    accessorKey: 'symbol',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Position" />,
    meta: {
      label: 'Position',
    },
    cell: ({ row }) => {
      const navigate = useNavigate();
      const holding = row.original;
      let symbol = holding.symbol.split('.')[0];
      if (symbol.startsWith('$CASH')) {
        symbol = symbol.split('-')[0];
      }
      const handleNavigate = () => {
        navigate(`/holdings/${holding.symbol}`, { state: { holding } });
      };
      return (
        <div className="flex items-center">
          <Badge
            className="flex min-w-[50px] cursor-pointer items-center justify-center rounded-sm"
            onClick={handleNavigate}
          >
            {symbol}
          </Badge>

          <span className="ml-2">{holding.symbolName}</span>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      return rowA.original.symbol.localeCompare(rowB.original.symbol);
    },
    filterFn: (row) => {
      const holding = row.original;
      const searchTerm = row.getValue('symbol') as string;
      return (
        holding.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        holding.symbolName.toLowerCase().includes(searchTerm.toLowerCase())
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
        <QuantityDisplay value={row.original.quantity} isHidden={isHidden} />
        <div className="text-xs text-transparent">-</div>
      </div>
    ),
    sortingFn: (rowA, rowB) => rowA.original.quantity - rowB.original.quantity,
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
      const holding = row.original;
      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center">
          <div>{formatAmount(holding.marketPrice || 0, holding.currency)}</div>
          <GainPercent
            className="text-xs text-muted-foreground"
            value={holding.performance.dayGainPercent || 0}
          />
        </div>
      );
    },
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
      const holding = row.original;
      const value = showConvertedValues ? holding.bookValueConverted : holding.bookValue;
      const currency = showConvertedValues ? holding.baseCurrency : holding.currency;

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center pr-4">
          <PrivacyAmount value={value} currency={currency} />
          <div className="text-xs text-transparent">-</div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const valueA = showConvertedValues
        ? rowA.original.bookValueConverted
        : rowA.original.bookValue;
      const valueB = showConvertedValues
        ? rowB.original.bookValueConverted
        : rowB.original.bookValue;
      return valueA - valueB;
    },
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
    cell: ({ row }) => {
      const holding = row.original;
      const value = showConvertedValues ? holding.marketValueConverted : holding.marketValue;
      const currency = showConvertedValues ? holding.baseCurrency : holding.currency;

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center">
          <AmountDisplay value={value} currency={currency} isHidden={isHidden} />
          <div className="text-xs text-muted-foreground">{currency}</div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const valueA = showConvertedValues
        ? rowA.original.marketValueConverted
        : rowA.original.marketValue;
      const valueB = showConvertedValues
        ? rowB.original.marketValueConverted
        : rowB.original.marketValue;
      return valueA - valueB;
    },
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
      const holding = row.original;
      const currency = showConvertedValues ? holding.baseCurrency : holding.currency;
      const gainAmount = showConvertedValues
        ? holding.performance.totalGainAmountConverted
        : holding.performance.totalGainAmount;

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center pr-4">
          <AmountDisplay value={gainAmount} currency={currency} colorFormat={true} />
          <GainPercent
            className="text-xs text-muted-foreground"
            value={holding.performance.totalGainPercent}
          />
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const valueA = showConvertedValues
        ? rowA.original.performance.totalGainAmountConverted
        : rowA.original.performance.totalGainAmount;
      const valueB = showConvertedValues
        ? rowB.original.performance.totalGainAmountConverted
        : rowB.original.performance.totalGainAmount;
      return valueA - valueB;
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
    cell: ({ row }) => <div>{row.original.currency}</div>,
  },
  {
    id: 'actions',
    enableHiding: false,
    header: () => (
      <div className="flex items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowConvertedValues(!showConvertedValues)}
                className="h-8 w-8"
              >
                {showConvertedValues ? (
                  <Icons.Globe className="h-4 w-4" />
                ) : (
                  <Icons.DollarSign className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Show in {showConvertedValues ? 'Base' : 'Asset'} Currency</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
    cell: ({ row }) => {
      const navigate = useNavigate();
      const handleNavigate = () => {
        navigate(`/holdings/${row.original.symbol}`, { state: { holding: row.original } });
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
