import { Button } from "@wealthfolio/ui/components/ui/button";
import { DataTable } from "@wealthfolio/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@wealthfolio/ui/components/ui/data-table/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { parseOccSymbol } from "@/lib/occ-symbol";
import { safeDivide } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { GainPercent, Badge } from "@wealthfolio/ui";

import { TickerAvatar } from "@/components/ticker-avatar";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettingsContext } from "@/lib/settings-provider";
import { Holding } from "@/lib/types";
import { AmountDisplay, QuantityDisplay } from "@wealthfolio/ui";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  onClassify,
}: {
  holdings: Holding[];
  isLoading: boolean;
  showTotalReturn?: boolean;
  setShowTotalReturn?: (value: boolean) => void;
  onClassify?: (holding: Holding) => void;
}) => {
  const { t } = useTranslation("common");
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

  const assetsTypes = useMemo(() => {
    const uniqueTypesSet = new Set<string>();
    return holdings.reduce(
      (result: { label: string; value: string }[], asset) => {
        const type = asset.instrument?.classifications?.assetType?.name;
        if (type && !uniqueTypesSet.has(type)) {
          uniqueTypesSet.add(type);
          result.push({ label: type.toUpperCase(), value: type });
        }
        return result;
      },
      [],
    );
  }, [holdings]);

  const filters = useMemo(
    () => [
      {
        id: "holdingType",
        title: t("holdings.table.filter_type"),
        options: assetsTypes,
      },
    ],
    [t, assetsTypes],
  );

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

  return (
    <div className="flex h-full flex-col">
      <DataTable
        data={holdings}
        columns={getColumns(t, isBalanceHidden, showConvertedValues, showTotalReturn, onClassify)}
        searchBy="symbol"
        searchPlaceholder={t("holdings.mobile.search_placeholder")}
        filters={filters}
        showColumnToggle={true}
        columnToggleLabel={t("holdings.toolbar.columns")}
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
                  { value: "total", label: t("holdings.toolbar.toggle_total") },
                  { value: "daily", label: t("holdings.toolbar.toggle_daily") },
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
                  <p>
                    {showConvertedValues
                      ? t("holdings.toolbar.tooltip_in_asset")
                      : t("holdings.toolbar.tooltip_in_base")}
                  </p>
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
  t: TFunction<"common">,
  isHidden: boolean,
  showConvertedValues: boolean,
  showTotalReturn: boolean,
  onClassify?: (holding: Holding) => void,
): ColumnDef<Holding>[] => [
  {
    id: "symbol",
    accessorKey: "instrument.symbol",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t("holdings.table.header_position")} />
    ),
    meta: {
      label: t("holdings.table.header_position"),
    },
    cell: ({ row }) => {
      const navigate = useNavigate();
      const holding = row.original;
      const symbol = holding.instrument?.symbol ?? holding.id;

      // Parse OCC symbol for options
      const parsedOption = parseOccSymbol(symbol);
      const displaySymbol = parsedOption ? parsedOption.underlying : symbol;

      // Check if option is expired (date-only: expired once the day after expiration)
      const today = new Date().toISOString().split("T")[0];
      const isExpiredOption = parsedOption ? parsedOption.expiration < today : false;

      // Option subtitle: "Mar 29 $150 CALL"
      const optionSubtitle = parsedOption
        ? `${new Date(parsedOption.expiration + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} $${parsedOption.strikePrice} ${parsedOption.optionType}`
        : null;

      const handleNavigate = () => {
        // Use instrument.id (asset ID) for navigation, not symbol (which may be stripped)
        const navSymbol = holding.instrument?.id ?? holding.id;
        navigate(`/holdings/${encodeURIComponent(navSymbol)}`, { state: { holding } });
      };

      const isManual = holding.instrument?.quoteMode === "MANUAL";
      const content = (
        <div className="flex items-center">
          <TickerAvatar
            symbol={parsedOption ? parsedOption.underlying : symbol}
            className="mr-2 h-8 w-8"
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{displaySymbol}</span>
              {isExpiredOption && (
                <Badge variant="destructive" className="h-4 px-1 py-0 text-[10px]">
                  {t("holdings.badge.expired")}
                </Badge>
              )}
              {isManual && (
                <Badge variant="secondary" className="h-4 px-1 py-0 text-[10px]">
                  {t("holdings.badge.manual")}
                </Badge>
              )}
            </div>
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {optionSubtitle ?? holding.instrument?.name ?? null}
            </span>
          </div>
        </div>
      );

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
      const lowerSearch = searchTerm.toLowerCase();
      const nameMatch = holding.instrument?.name?.toLowerCase().includes(lowerSearch);
      const symbolMatch = holding.instrument?.symbol?.toLowerCase().includes(lowerSearch);
      const idMatch = holding.id.toLowerCase().includes(lowerSearch);
      // Also match on the underlying symbol for options
      const parsed = parseOccSymbol(holding.instrument?.symbol ?? "");
      const underlyingMatch = parsed?.underlying.toLowerCase().includes(lowerSearch);
      return !!(symbolMatch || nameMatch || idMatch || underlyingMatch);
    },
    enableHiding: false,
  },
  {
    id: "symbolName",
    accessorFn: (row) => row.instrument?.name || row.id,
    meta: {
      label: t("holdings.table.meta_symbol_name"),
    },
    enableHiding: false,
  },
  {
    id: "quantity",
    accessorKey: "quantity",
    enableHiding: true,
    header: ({ column }) => (
      <DataTableColumnHeader
        className="justify-end text-right"
        column={column}
        title={t("holdings.table.header_qty")}
      />
    ),
    meta: {
      label: t("holdings.table.meta_quantity"),
    },
    cell: ({ row }) => {
      const symbol = row.original.instrument?.symbol ?? row.original.id;
      const isOption = !!parseOccSymbol(symbol);
      const assetTypeKey = row.original.instrument?.classifications?.assetType?.key ?? "";
      const isBond =
        assetTypeKey.startsWith("BOND_") ||
        assetTypeKey === "DEBT_SECURITY" ||
        assetTypeKey === "MONEY_MARKET_DEBT";
      return (
        <div className="flex min-h-[40px] flex-col items-end justify-center px-4">
          <QuantityDisplay value={row.original.quantity} isHidden={isHidden} />
          <span className="text-muted-foreground text-xs">
            {isOption
              ? t("holdings.table.unit_contracts")
              : isBond
                ? t("holdings.table.unit_bonds")
                : t("holdings.table.unit_shares")}
          </span>
        </div>
      );
    },
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
        title={t("holdings.table.header_today_price")}
      />
    ),
    meta: {
      label: t("holdings.table.todays_price_short"),
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
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        title={t("holdings.table.header_book_cost")}
      />
    ),
    meta: {
      label: t("holdings.table.header_book_cost"),
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
      <DataTableColumnHeader
        className="justify-end"
        column={column}
        title={t("holdings.table.header_total_value")}
      />
    ),
    meta: {
      label: t("holdings.table.header_total_value"),
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
        title={
          showTotalReturn ? t("holdings.table.unrealized_gain") : t("holdings.table.day_change")
        }
      />
    ),
    meta: {
      label: t("holdings.table.unrealized_gain"),
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
    accessorFn: (row) => row.instrument?.classifications?.assetType?.name,
    meta: {
      label: t("holdings.table.header_asset_type"),
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t("holdings.table.header_asset_type")} />
    ),
    filterFn: "arrIncludesSome",
  },
  {
    id: "currency",
    accessorKey: "localCurrency",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t("holdings.table.header_currency")} />
    ),
    meta: {
      label: t("holdings.table.header_currency"),
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
      const holding = row.original;
      const hasInstrument = !!holding.instrument;

      const handleNavigate = () => {
        // Use instrument.id (asset ID) for navigation, not symbol (which may be stripped)
        const navSymbol = holding.instrument?.id ?? holding.id;
        navigate(`/holdings/${encodeURIComponent(navSymbol)}`, {
          state: { holding },
        });
      };

      return (
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Icons.MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasInstrument && onClassify && (
                <DropdownMenuItem onClick={() => onClassify(holding)}>
                  <Icons.Tag className="mr-2 h-4 w-4" />
                  {t("holdings.actions.classify")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleNavigate}>
                <Icons.ChevronRight className="mr-2 h-4 w-4" />
                {t("holdings.actions.view_details")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
