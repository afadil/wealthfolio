import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge, Card } from "@wealthfolio/ui";

import { TickerAvatar } from "@/components/ticker-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Quote } from "@/lib/types";
import { cn, formatAmount, formatDate } from "@/lib/utils";
import { ScrollArea, Separator } from "@wealthfolio/ui";
import { ParsedAsset } from "./asset-utils";

interface AssetsTableMobileProps {
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

export function AssetsTableMobile({
  assets,
  latestQuotes = {},
  isLoading,
  onEdit,
  onDelete,
  onUpdateQuotes,
  onRefetchQuotes,
  isUpdatingQuotes,
  isRefetchingQuotes,
}: AssetsTableMobileProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>([]);
  const [selectedPriceStatus, setSelectedPriceStatus] = useState<string[]>([]);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

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

  // Get unique data sources
  const dataSourceOptions = useMemo(() => {
    const sources = new Set(assets.map((asset) => asset.dataSource));
    return Array.from(sources);
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let filtered = assets;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((asset) =>
        [asset.symbol, asset.name ?? "", asset.assetClass ?? "", asset.assetSubClass ?? ""].some(
          (value) => value.toLowerCase().includes(query),
        ),
      );
    }

    // Filter by data source
    if (selectedDataSources.length > 0) {
      filtered = filtered.filter((asset) => selectedDataSources.includes(asset.dataSource));
    }

    // Filter by price status
    if (selectedPriceStatus.length > 0) {
      filtered = filtered.filter((asset) => {
        const quote = latestQuotes[asset.symbol];
        const isStale = isStaleQuote(quote);
        return selectedPriceStatus.includes(isStale ? "true" : "false");
      });
    }

    return filtered;
  }, [assets, searchQuery, selectedDataSources, selectedPriceStatus, latestQuotes]);

  const hasActiveFilters = selectedDataSources.length > 0 || selectedPriceStatus.length > 0;

  const handleResetFilters = () => {
    setSelectedDataSources([]);
    setSelectedPriceStatus([]);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-10" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <Skeleton className="h-9 w-9" />
            </div>
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-14" />
            </div>
            <div className="mt-3 flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search assets"
          className="bg-secondary/30 flex-1 border-none"
        />
        <Button
          variant="outline"
          size="icon"
          className="relative size-10 flex-shrink-0"
          onClick={() => setIsFilterSheetOpen(true)}
        >
          <Icons.ListFilter className="h-4 w-4" />
          {hasActiveFilters && (
            <span className="bg-primary absolute -top-1 -right-1 h-2 w-2 rounded-full" />
          )}
        </Button>
      </div>

      <div className="space-y-2">
        {filteredAssets.map((asset) => (
          <Card key={asset.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => navigate(`/holdings/${encodeURIComponent(asset.symbol)}`)}
                className="hover:bg-muted/60 focus-visible:ring-ring flex flex-1 items-center gap-3 overflow-hidden rounded-md px-1 py-1 text-left transition"
              >
                <TickerAvatar symbol={asset.symbol} className="h-10 w-10 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{asset.symbol}</p>
                  <p className="text-muted-foreground truncate text-sm">{asset.name ?? "-"}</p>
                </div>
              </button>
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

            <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary" className="uppercase">
                {asset.currency}
              </Badge>
              {asset.assetClass ? <Badge variant="outline">{asset.assetClass}</Badge> : null}
              {asset.assetSubClass ? <Badge variant="outline">{asset.assetSubClass}</Badge> : null}
              <Badge variant="secondary" className="uppercase">
                {asset.dataSource}
              </Badge>
            </div>

            <div className="mt-3 text-sm">
              {latestQuotes[asset.symbol] ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    {formatAmount(
                      latestQuotes[asset.symbol].close,
                      latestQuotes[asset.symbol].currency ?? asset.currency ?? "USD",
                    )}
                    {isStaleQuote(latestQuotes[asset.symbol]) ? (
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
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(latestQuotes[asset.symbol].timestamp)}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">No quotes</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Filter Sheet */}
      <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
        <SheetContent side="bottom" className="flex h-[70vh] flex-col rounded-t-xl">
          <SheetHeader className="text-left">
            <SheetTitle>Filter Options</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 py-4">
            <div className="space-y-6">
              {/* Data Source Filter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                    Data Source
                  </h4>
                  {selectedDataSources.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setSelectedDataSources([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {dataSourceOptions.map((source) => {
                    const isSelected = selectedDataSources.includes(source);
                    const count = assets.filter((a) => a.dataSource === source).length;
                    return (
                      <button
                        key={source}
                        type="button"
                        onClick={() => {
                          setSelectedDataSources((prev) =>
                            isSelected ? prev.filter((s) => s !== source) : [...prev, source],
                          );
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors",
                          isSelected
                            ? "border-primary/50 bg-primary/5"
                            : "hover:bg-muted/50 border-border",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                              isSelected
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isSelected && <Icons.Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="font-medium uppercase">{source}</span>
                        </div>
                        <Badge variant="secondary" className="ml-auto">
                          {count}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Price Status Filter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                    Price Status
                  </h4>
                  {selectedPriceStatus.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setSelectedPriceStatus([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Up to Date", value: "false" },
                    { label: "Stale", value: "true" },
                  ].map((option) => {
                    const isSelected = selectedPriceStatus.includes(option.value);
                    const count = assets.filter((a) => {
                      const quote = latestQuotes[a.symbol];
                      const isStale = isStaleQuote(quote);
                      return (isStale ? "true" : "false") === option.value;
                    }).length;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSelectedPriceStatus((prev) =>
                            isSelected
                              ? prev.filter((s) => s !== option.value)
                              : [...prev, option.value],
                          );
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors",
                          isSelected
                            ? "border-primary/50 bg-primary/5"
                            : "hover:bg-muted/50 border-border",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded border-2 transition-colors",
                              isSelected
                                ? "border-primary bg-primary"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isSelected && <Icons.Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="font-medium">{option.label}</span>
                        </div>
                        <Badge variant="secondary" className="ml-auto">
                          {count}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
          <SheetFooter className="flex-row gap-2">
            <SheetClose asChild>
              <Button variant="outline" className="flex-1">
                Close
              </Button>
            </SheetClose>
            {hasActiveFilters && (
              <Button variant="default" className="flex-1" onClick={handleResetFilters}>
                Reset All
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
