import { searchTicker } from "@/adapters";
import { getExchangeDisplayName } from "@/lib/constants";
import { SymbolSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@wealthfolio/ui/components/ui/command";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useComposedRefs } from "@wealthfolio/ui/hooks";
import { Command as CommandPrimitive } from "cmdk";
import { debounce } from "lodash";
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateCustomAssetDialog } from "./create-custom-asset-dialog";

interface QuoteInfo {
  price: number | null;
  currency?: string;
  isLoading: boolean;
}

interface SearchProps {
  selectedResult?: SymbolSearchResult;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  onSelectResult: (symbol: string, searchResult?: SymbolSearchResult) => void;
  /** Controlled open state (optional). */
  open?: boolean;
  /** Controlled open change handler (optional). */
  onOpenChange?: (open: boolean) => void;
  /** When true, focuses the search input when the popover opens. */
  autoFocusSearch?: boolean;
  className?: string;
  /** Default currency to use for custom assets (typically from account) */
  defaultCurrency?: string;
  /** Optional exchange MIC for display context when value is canonical (e.g., SHOP -> SHOP (TSX)). */
  selectedExchangeMic?: string;
  /** Quote info to display in the trigger after selection */
  quoteInfo?: QuoteInfo;
  /** Called when the user clears the selection */
  onClear?: () => void;
  /** Test ID for e2e testing */
  "data-testid"?: string;
}

interface SearchResultsProps {
  results?: SymbolSearchResult[];
  query: string;
  isLoading: boolean;
  isError?: boolean;
  selectedResult: SearchProps["selectedResult"];
  onSelect: (symbol: SymbolSearchResult) => void;
  onCreateCustomAsset: () => void;
}

function getSearchResultKey(result: SymbolSearchResult) {
  if (result.existingAssetId) return result.existingAssetId;
  const parts = [
    result.symbol,
    result.exchangeMic ?? result.exchange,
    result.currency,
    result.index,
  ].filter(Boolean);
  return parts.join("|");
}

// Memoize search results component
const SearchResults = memo(
  ({
    results,
    query,
    isLoading,
    selectedResult,
    onSelect,
    onCreateCustomAsset,
  }: SearchResultsProps) => {
    const hasResults = results && results.length > 0;
    const showNoResults = !isLoading && !hasResults && query.length > 1;
    const selectedKey = selectedResult ? getSearchResultKey(selectedResult) : null;

    return (
      <CommandList>
        {isLoading ? (
          <CommandPrimitive.Loading>
            <div className="space-y-2 p-1">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </CommandPrimitive.Loading>
        ) : null}

        {/* No results message */}
        {showNoResults && (
          <div className="text-muted-foreground px-2 py-3 text-center text-sm">
            No matches found for &quot;{query}&quot;
          </div>
        )}

        {/* Search results */}
        {hasResults &&
          results.map((ticker) => {
            // Use exchangeName if available (from backend), otherwise map exchange code to friendly name
            const exchangeDisplay = ticker.exchangeName || getExchangeDisplayName(ticker.exchange);
            const displayName = ticker.longName || ticker.shortName || ticker.symbol;
            const itemKey = getSearchResultKey(ticker);
            const isSelected = selectedKey === itemKey;
            return (
              <CommandItem
                key={itemKey}
                onSelect={() => onSelect(ticker)}
                value={itemKey}
                className="flex items-center justify-between rounded-none py-2"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-semibold uppercase">{ticker.symbol}</span>
                  <span className="text-muted-foreground line-clamp-1 text-xs">{displayName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground text-xs">{exchangeDisplay}</span>
                    {ticker.currency && (
                      <span className="text-muted-foreground text-[10px]">{ticker.currency}</span>
                    )}
                  </div>
                  {isSelected && <Icons.Check className="size-4" />}
                </div>
              </CommandItem>
            );
          })}

        {/* Create custom asset option - always visible when user has typed something */}
        {!isLoading && query.length > 0 && (
          <>
            {hasResults && <CommandSeparator />}
            <CommandItem
              onSelect={onCreateCustomAsset}
              value={`create-custom-${query}`}
              className="flex items-center gap-3 py-2"
            >
              <Icons.PlusCircle className="text-muted-foreground size-4" />
              <div className="flex flex-col">
                <span className="font-mono text-xs font-semibold uppercase">
                  {query.trim().toUpperCase() || "..."}
                </span>
                <span className="text-muted-foreground text-xs">Create custom (manual)</span>
              </div>
            </CommandItem>
          </>
        )}
      </CommandList>
    );
  },
);

SearchResults.displayName = "SearchResults";

function isElementVisible(element: HTMLElement) {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function getFocusableElementsInDocument(doc: Document) {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(doc.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") return false;
    if (!isElementVisible(element)) return false;
    return true;
  });
}

function focusRelativeTo(anchor: HTMLElement, direction: "next" | "prev") {
  const doc = anchor.ownerDocument;
  const focusables = getFocusableElementsInDocument(doc);
  const anchorIndex = focusables.indexOf(anchor);
  if (anchorIndex < 0) return;

  const offset = direction === "next" ? 1 : -1;
  focusables[anchorIndex + offset]?.focus();
}

const TickerSearchInput = forwardRef<HTMLButtonElement, SearchProps>(
  (
    {
      selectedResult,
      defaultValue,
      value,
      placeholder = "Select symbol...",
      onSelectResult,
      open: openProp,
      onOpenChange,
      autoFocusSearch = false,
      className,
      defaultCurrency,
      selectedExchangeMic,
      quoteInfo,
      onClear,
      "data-testid": testId,
    },
    ref,
  ) => {
    const isControlled = openProp !== undefined;
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = isControlled ? openProp : uncontrolledOpen;
    const [customAssetDialogOpen, setCustomAssetDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(defaultValue ?? value ?? "");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    // Structured selection data for the rich trigger display
    const [selectedTicker, setSelectedTicker] = useState<{
      symbol: string;
      name: string;
      exchangeDisplay: string;
    } | null>(() => {
      if (selectedResult) {
        const exchangeDisplay =
          selectedResult.exchangeName || getExchangeDisplayName(selectedResult.exchange);
        return {
          symbol: selectedResult.symbol,
          name: selectedResult.longName || selectedResult.shortName || selectedResult.symbol,
          exchangeDisplay: exchangeDisplay || "",
        };
      }
      if (value) {
        const exchangeDisplay = getExchangeDisplayName(selectedExchangeMic) || "";
        return { symbol: value, name: "", exchangeDisplay };
      }
      return null;
    });

    // Keep a simple string for search query comparison
    const [selected, setSelected] = useState(() => {
      if (selectedResult) {
        const exchangeDisplay =
          selectedResult.exchangeName || getExchangeDisplayName(selectedResult.exchange);
        const exchangeSuffix = exchangeDisplay ? ` (${exchangeDisplay})` : "";
        return `${selectedResult.symbol} - ${selectedResult.longName}${exchangeSuffix}`;
      }
      if (defaultValue) {
        return defaultValue;
      }
      if (value) {
        const exchangeDisplay = getExchangeDisplayName(selectedExchangeMic);
        if (exchangeDisplay) {
          return `${value} (${exchangeDisplay})`;
        }
        return value;
      }
      return "";
    });
    const inputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeFocusIntentRef = useRef<null | "next" | "prev">(null);
    const composedTriggerRef = useComposedRefs(ref, triggerRef);

    // Create debounced search function
    const debouncedSearch = useMemo(
      () =>
        debounce((query: string) => {
          setDebouncedQuery(query);
        }, 300),
      [],
    );

    // Handle search query changes
    const handleSearchChange = useCallback(
      (newQuery: string) => {
        setSearchQuery(newQuery);
        debouncedSearch(newQuery);
      },
      [debouncedSearch],
    );

    const handleSelectResult = useCallback(
      (ticker: SymbolSearchResult) => {
        onSelectResult(ticker?.symbol, ticker);
        const exchangeDisplay = ticker?.exchangeName || getExchangeDisplayName(ticker?.exchange);
        const exchangeSuffix = exchangeDisplay ? ` (${exchangeDisplay})` : "";
        const displayText = ticker ? `${ticker.symbol} - ${ticker.longName}${exchangeSuffix}` : "";
        setSearchQuery(displayText);
        setSelected(displayText);
        setSelectedTicker({
          symbol: ticker.symbol,
          name: ticker.longName || ticker.shortName || ticker.symbol,
          exchangeDisplay: exchangeDisplay || "",
        });
        if (isControlled) {
          onOpenChange?.(false);
        } else {
          setUncontrolledOpen(false);
        }
        debouncedSearch.cancel();
      },
      [onSelectResult, debouncedSearch, isControlled, onOpenChange],
    );

    useEffect(() => {
      if (selectedResult) return;
      const current = value ?? defaultValue ?? "";
      if (!current) {
        setSelected("");
        setSelectedTicker(null);
        return;
      }
      // Don't overwrite a richer internal selection with a bare value sync
      if (selectedTicker?.symbol === current && selectedTicker.name) return;
      const exchangeDisplay = getExchangeDisplayName(selectedExchangeMic);
      const next = exchangeDisplay ? `${current} (${exchangeDisplay})` : current;
      setSelected((prev) => (prev === next ? prev : next));
      setSelectedTicker({ symbol: current, name: "", exchangeDisplay: exchangeDisplay || "" });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultValue, selectedExchangeMic, selectedResult, value]);

    // Handle "Create custom asset" click
    const handleCreateCustomAsset = useCallback(() => {
      if (isControlled) {
        onOpenChange?.(false);
      } else {
        setUncontrolledOpen(false);
      }
      debouncedSearch.cancel(); // Cancel pending debounced calls
      setCustomAssetDialogOpen(true); // Open the custom asset dialog
    }, [debouncedSearch, isControlled, onOpenChange]);

    // Handle custom asset created from dialog
    const handleCustomAssetCreated = useCallback(
      (searchResult: SymbolSearchResult) => {
        // Select the newly created custom asset
        handleSelectResult(searchResult);
      },
      [handleSelectResult],
    );

    // Use debounced query for API call
    const { data, isLoading, isError } = useQuery<SymbolSearchResult[], Error>({
      queryKey: ["ticker-search", debouncedQuery],
      queryFn: () => searchTicker(debouncedQuery),
      enabled:
        debouncedQuery?.length > 1 &&
        selected !== debouncedQuery &&
        defaultValue !== debouncedQuery,
      staleTime: 60000, // Cache results for 1 minute
      gcTime: 300000, // Keep in cache for 5 minutes (formerly cacheTime)
    });

    // Results are already sorted by backend (existing assets first, then by score)
    const sortedTickers = data;

    const clearSelection = useCallback(() => {
      setSelected("");
      setSelectedTicker(null);
      setSearchQuery("");
      setDebouncedQuery("");
      debouncedSearch.cancel();
      onClear?.();
    }, [debouncedSearch, onClear]);

    const handleClearClick = useCallback(
      (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        e.stopPropagation();
        clearSelection();
      },
      [clearSelection],
    );

    const handleClearMouseDown = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    // Handle popover open
    const handleOpenChange = useCallback(
      (newOpen: boolean) => {
        if (isControlled) {
          onOpenChange?.(newOpen);
        } else {
          setUncontrolledOpen(newOpen);
        }
        if (!newOpen) {
          debouncedSearch.cancel(); // Cancel pending searches when closing
        }
      },
      [debouncedSearch, isControlled, onOpenChange],
    );

    // Handle focus events
    const handleOpenAutoFocus = useCallback(
      (e: Event) => {
        if (!autoFocusSearch) return;
        e.preventDefault();
        inputRef.current?.focus();
      },
      [autoFocusSearch],
    );

    const handleInputKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Tab") return;
        closeFocusIntentRef.current = e.shiftKey ? "prev" : "next";
        e.preventDefault();
        if (isControlled) {
          onOpenChange?.(false);
        } else {
          setUncontrolledOpen(false);
        }
      },
      [isControlled, onOpenChange],
    );

    const handleCloseAutoFocus = useCallback((e: Event) => {
      const intent = closeFocusIntentRef.current;
      closeFocusIntentRef.current = null;
      if (!intent) return;

      e.preventDefault();
      const trigger = triggerRef.current;
      if (!trigger) return;
      requestAnimationFrame(() => {
        focusRelativeTo(trigger, intent);
      });
    }, []);

    return (
      <>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn(
                "h-auto min-h-10 w-full justify-between rounded-md px-3 py-2",
                open && "ring-ring ring-2",
                className,
              )}
              ref={composedTriggerRef}
              aria-expanded={open}
              aria-haspopup="listbox"
              data-testid={testId}
            >
              {selectedTicker ? (
                <div className="flex w-full min-w-0 items-center gap-2">
                  {/* Symbol | Name */}
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge className="rounded-sm">{selectedTicker.symbol}</Badge>
                    {selectedTicker.name && (
                      <>
                        <div className="bg-border h-4 w-px shrink-0" />
                        <span className="text-muted-foreground truncate text-sm">
                          {selectedTicker.name}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Right side: exchange badge, currency badge, price, clear */}
                  <div className="ml-auto flex shrink-0 items-center gap-0.5">
                    {selectedTicker.exchangeDisplay && (
                      <span className="bg-muted mr-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
                        {selectedTicker.exchangeDisplay}
                      </span>
                    )}
                    {quoteInfo?.isLoading ? (
                      <Skeleton className="h-4 w-14" />
                    ) : (
                      quoteInfo?.price != null && (
                        <span className="text-sm tabular-nums">
                          {quoteInfo.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4,
                          })}
                        </span>
                      )
                    )}
                    {quoteInfo?.currency && !quoteInfo.isLoading && (
                      <span className="text-muted-foreground px-0 py-0.5 font-light">
                        {quoteInfo.currency}
                      </span>
                    )}
                    {onClear && (
                      <span
                        onMouseDown={handleClearMouseDown}
                        onClick={handleClearClick}
                        className="text-muted-foreground hover:text-foreground ml-0.5 rounded-sm p-0.5"
                      >
                        <Icons.Close className="size-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-muted-foreground">{placeholder}</span>
                  <Icons.Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            side="bottom"
            align="start"
            className="w-(--radix-popover-trigger-width) h-auto min-w-[280px] p-0"
            onOpenAutoFocus={handleOpenAutoFocus}
            onCloseAutoFocus={handleCloseAutoFocus}
          >
            <Command shouldFilter={false} className="border-none">
              <CommandInput
                ref={inputRef}
                autoFocus={autoFocusSearch}
                value={searchQuery}
                onValueChange={handleSearchChange}
                placeholder="Search for symbol"
                onKeyDown={handleInputKeyDown}
              />

              <SearchResults
                isLoading={isLoading}
                isError={isError}
                query={debouncedQuery}
                results={sortedTickers}
                selectedResult={selectedResult}
                onSelect={handleSelectResult}
                onCreateCustomAsset={handleCreateCustomAsset}
              />
            </Command>
          </PopoverContent>
        </Popover>

        {/* Custom Asset Creation Dialog */}
        <CreateCustomAssetDialog
          open={customAssetDialogOpen}
          onOpenChange={setCustomAssetDialogOpen}
          onAssetCreated={handleCustomAssetCreated}
          defaultSymbol={searchQuery.trim()}
          defaultCurrency={defaultCurrency}
        />
      </>
    );
  },
);

TickerSearchInput.displayName = "TickerSearchInput";

export default TickerSearchInput;
