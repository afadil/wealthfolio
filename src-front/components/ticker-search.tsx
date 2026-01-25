import { searchTicker } from "@/adapters";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList, CommandSeparator } from "@wealthfolio/ui/components/ui/command";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { SymbolSearchResult } from "@/lib/types";
import { getExchangeDisplayName } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
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
  ({ results, query, isLoading, selectedResult, onSelect, onCreateCustomAsset }: SearchResultsProps) => {
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
                  <span className="text-muted-foreground text-xs line-clamp-1">{displayName}</span>
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

const TickerSearchInput = forwardRef<HTMLButtonElement, SearchProps>(
  (
    {
      selectedResult,
      defaultValue,
      value,
      placeholder = "Select symbol...",
      onSelectResult,
      className,
      defaultCurrency,
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [customAssetDialogOpen, setCustomAssetDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(defaultValue ?? value ?? "");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [selected, setSelected] = useState(() => {
      if (selectedResult) {
        // Show symbol - name (exchange) for better context
        const exchangeDisplay = selectedResult.exchangeName || getExchangeDisplayName(selectedResult.exchange);
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
        setOpen(false);
        debouncedSearch.cancel(); // Cancel pending debounced calls
      },
      [onSelectResult, debouncedSearch],
    );

    // Handle "Create custom asset" click
    const handleCreateCustomAsset = useCallback(() => {
      setOpen(false); // Close the popover
      setCustomAssetDialogOpen(true); // Open the custom asset dialog
    }, []);

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
        setOpen(newOpen);
        if (!newOpen) {
          debouncedSearch.cancel(); // Cancel pending searches when closing
        }
      },
      [debouncedSearch],
    );

    // Handle focus events
    const handleOpenAutoFocus = useCallback((e: Event) => {
      e.preventDefault();
      // Use requestAnimationFrame for smoother focus
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }, []);

    const handleCloseAutoFocus = useCallback((e: Event) => {
      e.preventDefault();
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
              ref={ref}
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
            className="h-auto min-w-[280px] w-(--radix-popover-trigger-width) p-0"
            onOpenAutoFocus={handleOpenAutoFocus}
            onCloseAutoFocus={handleCloseAutoFocus}
          >
            <Command shouldFilter={false} className="border-none">
              <CommandInput
                ref={inputRef}
                value={searchQuery}
                onValueChange={handleSearchChange}
                placeholder="Search for symbol"
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
