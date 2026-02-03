import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { TickerAvatar } from "@/components/ticker-avatar";
import { Badge } from "@wealthfolio/ui";
import { DataTable } from "@wealthfolio/ui/components/ui/data-table";
import { DataTableColumnHeader } from "@wealthfolio/ui/components/ui/data-table/data-table-column-header";
import { DataTableFacetedFilterProps } from "@wealthfolio/ui/components/ui/data-table/data-table-faceted-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";

import { ASSET_KIND_DISPLAY_NAMES, AssetKind } from "@/lib/types";
import { Quote } from "@/lib/types";
import { formatAmount, formatDate } from "@/lib/utils";
import { ParsedAsset } from "./asset-utils";

interface AssetsTableProps {
  assets: ParsedAsset[];
  latestQuotes?: Record<string, Quote>;
  isLoading?: boolean;
  onEdit: (asset: ParsedAsset) => void;
  onDelete: (asset: ParsedAsset) => void;
  onUpdateQuotes: (asset: ParsedAsset) => void;
  onRefetchQuotes: (asset: ParsedAsset) => void;
  isUpdatingQuotes?: boolean;
  isRefetchingQuotes?: boolean;
}

const PRICE_STALE_OPTIONS = [
  { label: "Up to Date", value: "false" },
  { label: "Stale", value: "true" },
];

const isStaleQuote = (quote?: Quote, isActive?: boolean) => {
  // Inactive assets or missing quotes are considered stale
  if (!quote || isActive === false) {
    return true;
  }

  const quoteDate = new Date(quote.timestamp);
  const today = new Date();

  return (
    quoteDate.getFullYear() !== today.getFullYear() ||
    quoteDate.getMonth() !== today.getMonth() ||
    quoteDate.getDate() !== today.getDate()
  );
};

export function AssetsTable({
  assets,
  latestQuotes = {},
  isLoading,
  onEdit,
  onDelete,
  onUpdateQuotes,
  onRefetchQuotes,
  isUpdatingQuotes,
  isRefetchingQuotes,
}: AssetsTableProps) {
  const navigate = useNavigate();

  const columns: ColumnDef<ParsedAsset>[] = useMemo(
    () => [
      {
        id: "symbol",
        accessorKey: "symbol",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Security" />,
        size: 220,
        maxSize: 260,
        cell: ({ row }) => {
          const asset = row.original;
          const displaySymbol = asset.symbol.startsWith("$CASH")
            ? asset.symbol.split("-")[0]
            : asset.symbol;
          return (
            <button
              type="button"
              onClick={() => navigate(`/holdings/${encodeURIComponent(asset.id)}`)}
              className="hover:bg-muted/60 focus-visible:ring-ring group flex w-full items-center gap-2.5 rounded-md py-1 text-left transition"
            >
              <TickerAvatar symbol={asset.symbol} className="h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="group-hover:text-primary leading-tight font-semibold transition-colors">
                  {displaySymbol}
                </div>
                <div className="text-muted-foreground line-clamp-2 text-xs leading-tight">
                  {asset.name ?? "—"}
                </div>
              </div>
            </button>
          );
        },
      },
      {
        id: "market",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Market" />,
        size: 120,
        cell: ({ row }) => {
          const asset = row.original;
          const isManual = asset.pricingMode === "MANUAL";
          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm">
                {asset.exchangeName ? (
                  <>
                    <span className="font-medium">{asset.exchangeName}</span>
                    <span className="text-muted-foreground/50">·</span>
                  </>
                ) : null}
                <span className="text-muted-foreground">{asset.currency}</span>
              </div>
              {isManual ? (
                <div>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    Manual
                  </Badge>
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "currency",
        header: () => null,
        cell: () => null,
        enableHiding: false,
      },
      {
        accessorKey: "assetSubClass",
        header: () => null,
        cell: () => null,
        enableHiding: false,
      },
      {
        accessorKey: "pricingMode",
        header: () => null,
        cell: () => null,
        enableHiding: false,
      },
      {
        accessorKey: "kind",
        header: () => null,
        cell: () => null,
        enableHiding: false,
        filterFn: (row, id, value) => {
          const filterValue = value as string[];
          const cellValue = row.getValue(id);
          return filterValue.includes(cellValue as string);
        },
      },
      {
        accessorKey: "isStale",
        header: () => null,
        cell: () => null,
        enableHiding: false,
        filterFn: (row, id, value) => {
          const filterValue = value as string[];
          const cellValue = row.getValue(id);
          return filterValue.includes(cellValue as string);
        },
      },
      {
        id: "latestQuote",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Quote" className="text-right" />
        ),
        size: 130,
        cell: ({ row }) => {
          const asset = row.original;
          const quote = latestQuotes[asset.id];
          const stale = isStaleQuote(quote, asset.isActive);

          if (!quote) {
            return (
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Icons.AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-muted-foreground text-sm">No quotes</span>
                </div>
              </div>
            );
          }

          return (
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                {stale ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Icons.AlertTriangle
                        className="h-3.5 w-3.5 text-amber-500"
                        aria-label="Quote not updated today"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Latest quote is not from today</TooltipContent>
                  </Tooltip>
                ) : null}
                <span className="font-semibold tabular-nums">
                  {formatAmount(quote.close, quote.currency ?? asset.currency ?? "USD")}
                </span>
              </div>
              <div className="text-muted-foreground text-[11px]">{formatDate(quote.timestamp)}</div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        size: 56,
        minSize: 56,
        cell: ({ row }) => {
          const asset = row.original;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hover:bg-muted text-muted-foreground inline-flex h-9 w-9 items-center justify-center rounded-md border transition"
                    aria-label="Open actions"
                  >
                    <Icons.MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(asset)}>Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onUpdateQuotes(asset)}
                    disabled={isUpdatingQuotes}
                  >
                    Update quotes
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onRefetchQuotes(asset)}
                    disabled={isRefetchingQuotes}
                  >
                    Refetch quotes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onDelete(asset)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [
      latestQuotes,
      onDelete,
      onEdit,
      onRefetchQuotes,
      onUpdateQuotes,
      isRefetchingQuotes,
      isUpdatingQuotes,
      navigate,
    ],
  );

  // Build filter options from assets (pricingMode)
  const pricingModeOptions = useMemo(() => {
    const modes = new Set(assets.map((asset) => asset.pricingMode).filter(Boolean));
    return Array.from(modes).map((mode) => ({
      label: mode === "MARKET" ? "Auto" : mode,
      value: mode,
    }));
  }, [assets]);

  // Build filter options from assets (kind)
  const kindOptions = useMemo(() => {
    const kinds = new Set(assets.map((asset) => asset.kind).filter(Boolean));
    return Array.from(kinds).map((kind) => ({
      label: ASSET_KIND_DISPLAY_NAMES[kind as AssetKind] ?? kind,
      value: kind,
    }));
  }, [assets]);

  const filters: DataTableFacetedFilterProps<ParsedAsset, unknown>[] = useMemo(
    () => [
      {
        id: "kind",
        title: "Kind",
        options: kindOptions,
      },
      {
        id: "pricingMode",
        title: "Mode",
        options: pricingModeOptions,
      },
      {
        id: "isStale",
        title: "Market Data",
        options: PRICE_STALE_OPTIONS,
      },
    ],
    [kindOptions, pricingModeOptions],
  );

  // Add computed field for stale status to enable filtering
  const assetsWithStaleFlag = useMemo(
    () =>
      assets.map((asset) => ({
        ...asset,
        isStale: isStaleQuote(latestQuotes[asset.id], asset.isActive) ? "true" : "false",
      })),
    [assets, latestQuotes],
  );

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-2 shrink-0">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead>Security</TableHead>
                <TableHead>Market</TableHead>
                <TableHead className="text-right">Quote</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-2.5 py-1">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-14" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-10" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-end gap-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <DataTable
      data={assetsWithStaleFlag}
      columns={columns}
      searchBy="symbol"
      filters={filters}
      defaultColumnVisibility={{
        currency: false,
        isStale: false,
        assetSubClass: false,
        pricingMode: false,
        kind: false,
      }}
      defaultSorting={[{ id: "symbol", desc: false }]}
      storageKey="securities-table-v2"
      scrollable
    />
  );
}
