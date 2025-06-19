import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { safeDivide } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import { GainPercent } from '@/components/gain-percent';

import { Skeleton } from '@/components/ui/skeleton';
import { Holding } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { useBalancePrivacy } from '@/context/privacy-context';
import { AmountDisplay } from '@/components/amount-display';
import { QuantityDisplay } from '@/components/quantity-display';
import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Helper function to get display value and currency based on toggle state
const getDisplayValueAndCurrency = (
  holding: Holding,
  valueInBase: number | null | undefined,
  showConvertedToBase: boolean,
): { value: number; currency: string } => {
  const fxRate = holding.fxRate ?? 1; // Use fxRate from Holding

  if (showConvertedToBase) {
    // Show value in Base Currency
    return {
      value: valueInBase ?? 0,
      currency: holding.baseCurrency, // Use baseCurrency from Holding
    };
  } else {
    // Show value in Asset's Original Currency
    const valueInOriginal = safeDivide(valueInBase ?? 0, fxRate);
    return {
      value: valueInOriginal,
      currency: holding.localCurrency, // Use localCurrency from Holding
    };
  }
};

export const HoldingsTable = ({
  holdings,
  isLoading,
}: {
  holdings: Holding[];
  isLoading: boolean;
}) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const [showConvertedValues, setShowConvertedValues] = useState(false);

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
      const type = asset.instrument?.assetSubclass; // Use instrument.assetSubclass
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
        columns={getColumns(isBalanceHidden, showConvertedValues, setShowConvertedValues)}
        searchBy="symbol"
        filters={filters}
        showColumnToggle={true}
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
    accessorKey: 'instrument.symbol',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Position" />,
    meta: {
      label: 'Position',
    },
    cell: ({ row }) => {
      const navigate = useNavigate();
      const holding = row.original;
      const symbol = holding.instrument?.symbol?.split('.')[0] ?? holding.id;
      const displaySymbol = symbol.startsWith('$CASH') ? symbol.split('-')[0] : symbol;

      const handleNavigate = () => {
        const navSymbol = holding.instrument?.symbol ?? holding.id;
        navigate(`/holdings/${encodeURIComponent(navSymbol)}`, { state: { holding } });
      };
      return (
        <div className="flex items-center">
          <Badge
            className="flex min-w-[50px] cursor-pointer items-center justify-center rounded-sm"
            onClick={handleNavigate}
          >
            {displaySymbol}
          </Badge>

          <span className="ml-2 line-clamp-1">{holding.instrument?.name || holding.id}</span>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const symbolA = rowA.original.instrument?.symbol ?? rowA.original.id;
      const symbolB = rowB.original.instrument?.symbol ?? rowB.original.id;
      return symbolA.localeCompare(symbolB);
    },
    filterFn: (row, _columnId, filterValue) => {
      const holding = row.original;
      const searchTerm = filterValue as string;
      const nameMatch = holding.instrument?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const symbolMatch = holding.instrument?.symbol?.toLowerCase().includes(searchTerm.toLowerCase());
      const idMatch = holding.id.toLowerCase().includes(searchTerm.toLowerCase());
      return !!(symbolMatch || nameMatch || idMatch);
    },
    enableHiding: false,
  },
  {
    id: 'symbolName',
    accessorFn: (row) => row.instrument?.name || row.id,
    meta: {
      label: 'Symbol Name',
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
      <div className="flex min-h-[40px] flex-col items-end justify-center px-4">
        <QuantityDisplay value={row.original.quantity} isHidden={isHidden} />
        <div className="text-xs text-transparent">-</div>
      </div>
    ),
    sortingFn: (rowA, rowB) => rowA.original.quantity - rowB.original.quantity,
  },
  {
    id: 'marketPrice',
    accessorFn: (row) => row.price ?? 0,
    enableHiding: true,
    enableSorting: true,
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
      const price = holding.price ?? 0;
      const currency = holding.localCurrency;
      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center px-4">
          <AmountDisplay value={price} currency={currency} />
          <GainPercent
            className="text-xs"
            value={holding.dayChangePct || 0}
          />
        </div>
      );
    },
  },
  {
    id: 'bookValue',
    accessorFn: (row) => row.costBasis?.local ?? 0,
    enableHiding: true,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Book Cost" />
    ),
    meta: {
      label: 'Book Cost',
    },
    cell: ({ row }) => {
      const holding = row.original;
      const value = holding.costBasis?.local ?? 0;
      const currency = holding.localCurrency;

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center px-4">
          <AmountDisplay value={value} currency={currency} isHidden={isHidden} />
          <div className="text-xs text-transparent">-</div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const valueA = rowA.original.costBasis?.local ?? 0;
      const valueB = rowB.original.costBasis?.local ?? 0;
      return valueA - valueB;
    },
  },
  {
    id: 'marketValue',
    accessorFn: (row) => row.marketValue.base ?? 0,
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Total Value" />
    ),
    meta: {
      label: 'Total Value',
    },
    cell: ({ row }) => {
      const holding = row.original;
      const { value, currency } = getDisplayValueAndCurrency(
        holding,
        holding.marketValue.base,
        showConvertedValues,
      );

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center px-4">
          <AmountDisplay value={value} currency={currency} isHidden={isHidden} />
          <div className="text-xs text-muted-foreground">{currency}</div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const valueA = rowA.original.marketValue.base ?? 0;
      const valueB = rowB.original.marketValue.base ?? 0;
      return valueA - valueB;
    },
  },
  {
    id: 'performance',
    accessorFn: (row) => row.totalGain?.base ?? 0,
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Total Gain/Loss" />
    ),
    meta: {
      label: 'Total Gain/Loss',
    },
    cell: ({ row }) => {
      const holding = row.original;
      const { value, currency } = getDisplayValueAndCurrency(
        holding,
        holding.totalGain?.base,
        showConvertedValues,
      );

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center px-4">
          <AmountDisplay value={value} currency={currency} colorFormat={true} isHidden={isHidden} />
          <GainPercent
            className="text-xs"
            value={holding.totalGainPct || 0}
          />
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const valueA = rowA.original.totalGain?.base ?? 0;
      const valueB = rowB.original.totalGain?.base ?? 0;
      return valueA - valueB;
    },
  },
  {
    id: 'holdingType',
    accessorFn: (row) => row.instrument?.assetSubclass,
    meta: {
      label: 'Asset Type',
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Asset Type" />,
    filterFn: 'arrIncludesSome',
  },
  {
    id: 'currency',
    accessorKey: 'localCurrency',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
    meta: {
      label: 'Currency',
    },
    cell: ({ row }) => <div className="text-muted-foreground">{row.original.localCurrency}</div>,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
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
              <p>Show values in {showConvertedValues ? 'Asset Currency' : 'Base Currency'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    ),
    cell: ({ row }) => {
      const navigate = useNavigate();
      const handleNavigate = () => {
        const navSymbol = row.original.instrument?.symbol ?? row.original.id;
        navigate(`/holdings/${encodeURIComponent(navSymbol)}`, { state: { holding: row.original } });
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
