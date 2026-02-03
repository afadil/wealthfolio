import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge, Card, FacetedSearchInput } from "@wealthfolio/ui";

import { TickerAvatar } from "@/components/ticker-avatar";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { ASSET_KIND_DISPLAY_NAMES, Quote } from "@/lib/types";
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
  onClassify?: (asset: ParsedAsset) => void;
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
  onClassify,
  isUpdatingQuotes,
  isRefetchingQuotes,
}: AssetsTableMobileProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDataSources, setSelectedDataSources] = useState<string[]>([]);
  const [selectedAssetKinds, setSelectedAssetKinds] = useState<string[]>([]);
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

  // Get unique pricing modes
  const pricingModeOptions = useMemo(() => {
    const modes = new Set(assets.map((asset) => asset.pricingMode).filter(Boolean));
    return Array.from(modes);
  }, [assets]);

  // Get unique asset kinds
  const assetKindOptions = useMemo(() => {
    const kinds = new Set(assets.map((asset) => asset.kind).filter((k) => !!k));
    return Array.from(kinds).sort();
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let filtered = assets;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((asset) =>
        [asset.symbol, asset.name ?? "", asset.kind ?? ""].some((value) =>
          value.toLowerCase().includes(query),
        ),
      );
    }

    // Filter by pricing mode
    if (selectedDataSources.length > 0) {
      filtered = filtered.filter((asset) => selectedDataSources.includes(asset.pricingMode));
    }

    // Filter by asset kind
    if (selectedAssetKinds.length > 0) {
      filtered = filtered.filter((asset) => asset.kind && selectedAssetKinds.includes(asset.kind));
    }

    // Filter by price status
    if (selectedPriceStatus.length > 0) {
      filtered = filtered.filter((asset) => {
        const quote = latestQuotes[asset.id];
        const isStale = isStaleQuote(quote);
        return selectedPriceStatus.includes(isStale ? "true" : "false");
      });
    }

    // Sort by symbol
    filtered.sort((a, b) => a.symbol.localeCompare(b.symbol));

    return filtered;
  }, [
    assets,
    searchQuery,
    selectedDataSources,
    selectedAssetKinds,
    selectedPriceStatus,
    latestQuotes,
  ]);

  const hasActiveFilters =
    selectedDataSources.length > 0 ||
    selectedAssetKinds.length > 0 ||
    selectedPriceStatus.length > 0;

  const handleResetFilters = () => {
    setSelectedDataSources([]);
    setSelectedAssetKinds([]);
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
        <FacetedSearchInput value={searchQuery} onChange={setSearchQuery} className="flex-1" />
        <Button
          variant="outline"
          size="icon"
          className="relative size-10 flex-shrink-0"
          onClick={() => setIsFilterSheetOpen(true)}
        >
          <Icons.ListFilter className="h-4 w-4" />
          {hasActiveFilters && (
            <span className="bg-destructive absolute right-0 top-0.5 h-2 w-2 rounded-full" />
          )}
        </Button>
      </div>

      <div className="space-y-2">
        {filteredAssets.map((asset) => (
          <Card key={asset.id} className="p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(`/holdings/${encodeURIComponent(asset.id)}`)}
                className="hover:bg-muted/60 focus-visible:ring-ring flex flex-1 items-center gap-3 overflow-hidden rounded-md text-left transition"
              >
                <TickerAvatar symbol={asset.symbol} className="h-10 w-10 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{asset.symbol}</p>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {asset.currency}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate text-sm">{asset.name ?? "-"}</p>
                </div>
              </button>

              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="text-right text-sm">
                  {latestQuotes[asset.id] ? (
                    <>
                      <div className="flex items-center justify-end gap-1 font-semibold">
                        {formatAmount(
                          latestQuotes[asset.id].close,
                          latestQuotes[asset.id].currency ?? asset.currency ?? "USD",
                        )}
                        {isStaleQuote(latestQuotes[asset.id]) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Icons.AlertTriangle
                                className="text-destructive h-3.5 w-3.5"
                                aria-label="Quote not updated today"
                              />
                            </TooltipTrigger>
                            <TooltipContent>Latest close is not from today</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(latestQuotes[asset.id].timestamp)}
                      </p>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">No quotes</span>
                  )}
                </div>

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
                    <DropdownMenuItem onClick={() => onClassify?.(asset)}>
                      <Icons.Tag className="mr-2 h-4 w-4" />
                      Classify
                    </DropdownMenuItem>
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
            </div>
          </Card>
        ))}
      </div>

      {/* Filter Sheet */}
      <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-4xl mx-1 flex h-[70vh] flex-col">
          <SheetHeader className="text-left">
            <SheetTitle>Filter Options</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 py-4">
            <div className="space-y-6">
              {/* Data Source Filter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
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
                  {pricingModeOptions.map((mode) => {
                    const isSelected = selectedDataSources.includes(mode);
                    const count = assets.filter((a) => a.pricingMode === mode).length;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setSelectedDataSources((prev) =>
                            isSelected ? prev.filter((s) => s !== mode) : [...prev, mode],
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
                            {isSelected && <Icons.Check className="text-secondary h-3 w-3" />}
                          </div>
                          <span className="font-medium uppercase">{mode}</span>
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

              {/* Asset Kind Filter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                    Asset Kind
                  </h4>
                  {selectedAssetKinds.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => setSelectedAssetKinds([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {assetKindOptions.map((kind) => {
                    const isSelected = selectedAssetKinds.includes(kind);
                    const count = assets.filter((a) => a.kind === kind).length;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          setSelectedAssetKinds((prev) =>
                            isSelected ? prev.filter((s) => s !== kind) : [...prev, kind],
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
                            {isSelected && <Icons.Check className="text-secondary h-3 w-3" />}
                          </div>
                          <span className="font-medium">
                            {ASSET_KIND_DISPLAY_NAMES[kind] ?? kind}
                          </span>
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
                  <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
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
                      const quote = latestQuotes[a.id];
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
                            {isSelected && <Icons.Check className="text-secondary h-3 w-3" />}
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
            {hasActiveFilters && (
              <Button variant="outline" className="flex-1" onClick={handleResetFilters}>
                Reset All
              </Button>
            )}
            <SheetClose asChild>
              <Button variant="default" className="flex-1">
                Apply
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
