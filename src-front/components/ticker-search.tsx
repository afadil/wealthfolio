import { searchTicker } from "@/adapters";
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
import { SymbolSearchResult } from "@/lib/types";
import { getExchangeDisplayName } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useComposedRefs } from "@wealthfolio/ui/hooks";
import { Command as CommandPrimitive } from "cmdk";
import { debounce } from "lodash";
import { forwardRef, memo, useCallback, useMemo, useRef, useState } from "react";
import { CreateCustomAssetDialog } from "./create-custom-asset-dialog";

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
            No matches found for "{query}"
          </div>
        )}

        {/* Search results */}
        {hasResults &&
          results.map((ticker) => {
            // Use exchangeName if available (from backend), otherwise map exchange code to friendly name
            const exchangeDisplay = ticker.exchangeName || getExchangeDisplayName(ticker.exchange);
            const displayName = ticker.longName || ticker.shortName || ticker.symbol;
            return (
              <CommandItem
                key={ticker.symbol}
                onSelect={() => onSelect(ticker)}
                value={ticker.symbol}
                className="flex items-center justify-between py-2"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-semibold uppercase">{ticker.symbol}</span>
                  <span className="text-muted-foreground line-clamp-1 text-xs">{displayName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{exchangeDisplay}</span>
                  {selectedResult?.symbol === ticker.symbol && <Icons.Check className="size-4" />}
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
    },
    ref,
  ) => {
    const isControlled = openProp !== undefined;
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = isControlled ? openProp : uncontrolledOpen;
    const [customAssetDialogOpen, setCustomAssetDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(defaultValue ?? value ?? "");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [selected, setSelected] = useState(() => {
      if (selectedResult) {
        // Show symbol - name (exchange) for better context
        const exchangeDisplay =
          selectedResult.exchangeName || getExchangeDisplayName(selectedResult.exchange);
        const exchangeSuffix = exchangeDisplay ? ` (${exchangeDisplay})` : "";
        return `${selectedResult.symbol} - ${selectedResult.longName}${exchangeSuffix}`;
      }
      if (defaultValue) {
        return defaultValue;
      }
      if (value) {
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
        // Show symbol - name (exchange) for better context, using friendly exchange name
        const exchangeDisplay = ticker?.exchangeName || getExchangeDisplayName(ticker?.exchange);
        const exchangeSuffix = exchangeDisplay ? ` (${exchangeDisplay})` : "";
        const displayText = ticker ? `${ticker.symbol} - ${ticker.longName}${exchangeSuffix}` : "";
        setSearchQuery(displayText);
        setSelected(displayText);
        if (isControlled) {
          onOpenChange?.(false);
        } else {
          setUncontrolledOpen(false);
        }
        debouncedSearch.cancel(); // Cancel pending debounced calls
      },
      [onSelectResult, debouncedSearch, isControlled, onOpenChange],
    );

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

    // Calculate display name for the button
    const displayName = selected || placeholder;

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

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Tab") return;
      closeFocusIntentRef.current = e.shiftKey ? "prev" : "next";
      e.preventDefault();
      if (isControlled) {
        onOpenChange?.(false);
      } else {
        setUncontrolledOpen(false);
      }
    }, [isControlled, onOpenChange]);

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
                "w-full justify-between truncate rounded-md",
                open && "ring-ring ring-2",
                className,
              )}
              ref={composedTriggerRef}
              aria-expanded={open}
              aria-haspopup="listbox"
            >
              {displayName}
              <Icons.Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent
            side="bottom"
            align="start"
            className="h-auto w-(--radix-popover-trigger-width) min-w-[280px] p-0"
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
