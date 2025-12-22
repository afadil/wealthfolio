import { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { TickerAvatar } from "@/components/ticker-avatar";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { DataTableFacetedFilterProps } from "@/components/ui/data-table/data-table-faceted-filter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@wealthfolio/ui";

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

const isStaleQuote = (quote?: Quote) => {
  if (!quote) {
    return false;
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
        header: ({ column }) => <DataTableColumnHeader column={column} title="Asset" />,
        cell: ({ row }) => {
          const asset = row.original;
          const displaySymbol = asset.symbol.startsWith("$CASH")
            ? asset.symbol.split("-")[0]
            : asset.symbol;
          return (
            <button
              type="button"
              onClick={() => navigate(`/holdings/${encodeURIComponent(asset.symbol)}`)}
              className="hover:bg-muted/60 focus-visible:ring-ring group flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition"
            >
              <TickerAvatar symbol={asset.symbol} className="h-10 w-10" />
              <div className="space-y-1">
                <div className="group-hover:text-primary leading-none font-semibold transition-colors">
                  {displaySymbol}
                </div>
                <div className="text-muted-foreground text-xs">{asset.name ?? "-"}</div>
              </div>
            </button>
          );
        },
      },
      {
        accessorKey: "currency",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Currency"
            className="w-[50px] text-center"
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Badge
              variant="secondary"
              className="min-w-[64px] justify-center px-2 py-1 text-[11px] uppercase"
            >
              {row.original.currency || "USD"}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: "assetClass",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Class" className="w-[120px]" />
        ),
        cell: ({ row }) => {
          const { assetClass, assetSubClass } = row.original;

          if (!assetClass && !assetSubClass) {
            return <span className="text-muted-foreground text-xs">-</span>;
          }

          return (
            <div className="space-y-1">
              {assetClass ? (
                <div className="text-xs leading-tight font-semibold uppercase">{assetClass}</div>
              ) : null}
              {assetSubClass ? (
                <div className="text-muted-foreground text-[11px] leading-tight uppercase">
                  {assetSubClass}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "assetSubClass",
      },
      {
        accessorKey: "dataSource",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Source" className="w-[60px]" />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary" className="uppercase">
            {row.original.dataSource}
          </Badge>
        ),
      },
      {
        accessorKey: "isStale",
        filterFn: (row, id, value) => {
          const filterValue = value as string[];
          const cellValue = row.getValue(id);
          return filterValue.includes(cellValue as string);
        },
      },
      {
        id: "latestQuote",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last Close" />,
        cell: ({ row }) => {
          const asset = row.original;
          const quote = latestQuotes[asset.symbol];
          const stale = isStaleQuote(quote);

          if (!quote) {
            return <div className="text-muted-foreground text-sm">No quotes</div>;
          }

          return (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="leading-none font-semibold">
                  {formatAmount(quote.close, quote.currency ?? asset.currency ?? "USD")}
                </div>
                {stale ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Icons.AlertTriangle
                        className="text-destructive h-4 w-4"
                        aria-label="Quote not updated today"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Latest close is not from today</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
              <div className="text-muted-foreground text-xs">{formatDate(quote.timestamp)}</div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
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
                  <DropdownMenuItem onClick={() => onEdit(asset)}>Edit</DropdownMenuItem>
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

  // Build filter options from assets
  const dataSourceOptions = useMemo(() => {
    const sources = new Set(assets.map((asset) => asset.dataSource));
    return Array.from(sources).map((source) => ({
      label: source.toUpperCase(),
      value: source,
    }));
  }, [assets]);

  const assetSubClassOptions = useMemo(() => {
    const subClasses = new Set(
      assets.map((asset) => asset.assetSubClass).filter((c): c is string => !!c),
    );
    return Array.from(subClasses)
      .sort()
      .map((assetSubClass) => ({
        label: assetSubClass.toUpperCase(),
        value: assetSubClass,
      }));
  }, [assets]);

  const filters: DataTableFacetedFilterProps<ParsedAsset, unknown>[] = useMemo(
    () => [
      {
        id: "assetSubClass",
        title: "Class",
        options: assetSubClassOptions,
      },
      {
        id: "dataSource",
        title: "Data Source",
        options: dataSourceOptions,
      },
      {
        id: "isStale",
        title: "Market Data",
        options: PRICE_STALE_OPTIONS,
      },
    ],
    [assetSubClassOptions, dataSourceOptions],
  );

  // Add computed field for stale status to enable filtering
  const assetsWithStaleFlag = useMemo(
    () =>
      assets.map((asset) => ({
        ...asset,
        isStale: isStaleQuote(latestQuotes[asset.symbol]) ? "true" : "false",
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
                <TableHead>Asset</TableHead>
                <TableHead className="text-center">Currency</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last Close</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-3 px-1 py-1">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-12" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Skeleton className="h-9 w-9" />
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
      defaultColumnVisibility={{ isStale: false, assetSubClass: false }}
      defaultSorting={[{ id: "symbol", desc: false }]}
      storageKey="assets-table"
      scrollable
    />
  );
}
