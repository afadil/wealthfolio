import { Button } from "@wealthfolio/ui/components/ui/button";
import { DataTable } from "@wealthfolio/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@wealthfolio/ui/components/ui/data-table/data-table-column-header";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { safeDivide } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { GainPercent } from "@wealthfolio/ui";

import { TickerAvatar } from "@/components/ticker-avatar";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettingsContext } from "@/lib/settings-provider";
import { Holding } from "@/lib/types";
import { AmountDisplay, QuantityDisplay } from "@wealthfolio/ui";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AnimatedToggleGroup } from "@wealthfolio/ui";

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
  showTotalReturn = true,
  setShowTotalReturn,
}: {
  holdings: Holding[];
  isLoading: boolean;
  showTotalReturn?: boolean;
  setShowTotalReturn?: (value: boolean) => void;
}) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const { settings } = useSettingsContext();
  const [showConvertedValues, setShowConvertedValues] = useState(false);

  const baseCurrency = settings?.baseCurrency ?? holdings[0]?.baseCurrency;
  const hasMultipleCurrencies = holdings.some((holding) => {
    if (!baseCurrency || !holding.localCurrency) {
      return false;
    }

    return holding.localCurrency.toUpperCase() !== baseCurrency.toUpperCase();
  });

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
      id: "holdingType",
      title: "Type",
      options: assetsTypes,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <DataTable
        data={holdings}
        columns={getColumns(isBalanceHidden, showConvertedValues, showTotalReturn)}
        searchBy="symbol"
        filters={filters}
        showColumnToggle={true}
        storageKey="holdings-table"
        defaultColumnVisibility={{
          currency: false,
          symbolName: false,
          holdingType: false,
          bookValue: false,
        }}
        defaultSorting={[{ id: "symbol", desc: false }]}
        scrollable={true}
        toolbarActions={
          <div className="mr-2 flex items-center gap-2">
            {setShowTotalReturn && (
              <AnimatedToggleGroup
                value={showTotalReturn ? "total" : "daily"}
                onValueChange={(value) => setShowTotalReturn(value === "total")}
                items={[
                  { value: "total", label: "Total" },
                  { value: "daily", label: "Daily" },
                ]}
                size="xs"
                rounded="md"
              />
            )}
            {hasMultipleCurrencies && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowConvertedValues(!showConvertedValues)}
                    className="h-8 w-8 rounded-lg"
                  >
                    {showConvertedValues ? (
                      <Icons.Globe className="h-4 w-4" />
                    ) : (
                      <Icons.DollarSign className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Show values in {showConvertedValues ? "Asset Currency" : "Base Currency"}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        }
      />
    </div>
  );
};

export default HoldingsTable;

const getColumns = (
  isHidden: boolean,
  showConvertedValues: boolean,
  showTotalReturn: boolean,
): ColumnDef<Holding>[] => [
  {
    id: "symbol",
    accessorKey: "instrument.symbol",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Position" />,
    meta: {
      label: "Position",
    },
    cell: ({ row }) => {
      const navigate = useNavigate();
      const holding = row.original;
      const symbol = holding.instrument?.symbol ?? holding.id;
      const displaySymbol = symbol.startsWith("$CASH") ? symbol.split("-")[0] : symbol;
      // For TickerAvatar, use the full symbol for cash (including $CASH) to get the proper icon
      const avatarSymbol = symbol.startsWith("$CASH") ? "$CASH" : symbol;

      const handleNavigate = () => {
        // Use instrument.id (asset ID) for navigation, not symbol (which may be stripped)
        const navSymbol = holding.instrument?.id ?? holding.id;
        navigate(`/holdings/${encodeURIComponent(navSymbol)}`, { state: { holding } });
      };

      const isCash = symbol.startsWith("$CASH");
      const content = (
        <div className="flex items-center">
          <TickerAvatar symbol={avatarSymbol} className="mr-2 h-8 w-8" />
          <div className="flex flex-col">
            <span className="font-medium">{displaySymbol}</span>
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {holding.instrument?.name || holding.id}
            </span>
          </div>
        </div>
      );

      if (isCash) {
        return <div className="flex items-center p-2">{content}</div>;
      }

      return (
        <div className="-m-1 cursor-pointer p-1" onClick={handleNavigate}>
          {content}
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
      const symbolMatch = holding.instrument?.symbol
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase());
      const idMatch = holding.id.toLowerCase().includes(searchTerm.toLowerCase());
      return !!(symbolMatch || nameMatch || idMatch);
    },
    enableHiding: false,
  },
  {
    id: "symbolName",
    accessorFn: (row) => row.instrument?.name || row.id,
    meta: {
      label: "Symbol Name",
    },
    enableHiding: false,
  },
  {
    id: "quantity",
    accessorKey: "quantity",
    enableHiding: true,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end text-right" column={column} title="Shares" />
    ),
    meta: {
      label: "Shares",
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
    id: "marketPrice",
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
          <GainPercent className="text-xs" value={holding.dayChangePct || 0} />
        </div>
      );
    },
  },
  {
    id: "bookValue",
    accessorFn: (row) => row.costBasis?.local ?? 0,
    enableHiding: true,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Book Cost" />
    ),
    meta: {
      label: "Book Cost",
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
    id: "marketValue",
    accessorFn: (row) => row.marketValue.base ?? 0,
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader className="justify-end" column={column} title="Total Value" />
    ),
    meta: {
      label: "Total Value",
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
          <div className="text-muted-foreground text-xs">{currency}</div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const holdingA = rowA.original;
      const holdingB = rowB.original;

      // Always sort by base currency value for consistency
      const valueA = holdingA.marketValue.base ?? 0;
      const valueB = holdingB.marketValue.base ?? 0;

      return valueA - valueB;
    },
  },
  {
    id: "performance",
    accessorFn: (row) => row.totalGain?.base ?? 0,
    enableHiding: false,
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        title={showTotalReturn ? "Total Gain/Loss" : "Day Change"}
      />
    ),
    meta: {
      label: "Total Gain/Loss",
    },
    cell: ({ row }) => {
      const holding = row.original;
      const valueBase = showTotalReturn ? holding.totalGain?.base : holding.dayChange?.base;
      const pct = showTotalReturn ? holding.totalGainPct : holding.dayChangePct;

      const { value, currency } = getDisplayValueAndCurrency(
        holding,
        valueBase,
        showConvertedValues,
      );

      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center px-4">
          <AmountDisplay value={value} currency={currency} colorFormat={true} isHidden={isHidden} />
          <GainPercent className="text-xs" value={pct || 0} />
        </div>
      );
    },
    sortingFn: (rowA, rowB) => {
      const holdingA = rowA.original;
      const holdingB = rowB.original;

      // Always sort by base currency value for consistency
      const valueA = (showTotalReturn ? holdingA.totalGain?.base : holdingA.dayChange?.base) ?? 0;
      const valueB = (showTotalReturn ? holdingB.totalGain?.base : holdingB.dayChange?.base) ?? 0;

      return valueA - valueB;
    },
  },
  {
    id: "holdingType",
    accessorFn: (row) => row.instrument?.assetSubclass,
    meta: {
      label: "Asset Type",
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Asset Type" />,
    filterFn: "arrIncludesSome",
  },
  {
    id: "currency",
    accessorKey: "localCurrency",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Currency" />,
    meta: {
      label: "Currency",
    },
    cell: ({ row }) => <div className="text-muted-foreground">{row.original.localCurrency}</div>,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "actions",
    enableHiding: false,
    header: () => null,
    cell: ({ row }) => {
      const navigate = useNavigate();
      const handleNavigate = () => {
        // Use instrument.id (asset ID) for navigation, not symbol (which may be stripped)
        const navSymbol = row.original.instrument?.id ?? row.original.id;
        navigate(`/holdings/${encodeURIComponent(navSymbol)}`, {
          state: { holding: row.original },
        });
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
