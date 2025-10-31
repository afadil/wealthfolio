import { searchTicker } from "@/commands/market-data";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Icons } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import { debounce } from "lodash";
import { forwardRef, memo, useCallback, useMemo, useRef, useState } from "react";

interface SearchProps {
  selectedResult?: QuoteSummary;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  onSelectResult: (symbol: string, isManual?: boolean) => void;
  className?: string;
  allowFreeText?: boolean;
}

interface SearchResultsProps {
  results?: QuoteSummary[];
  query: string;
  isLoading: boolean;
  isError?: boolean;
  selectedResult: SearchProps["selectedResult"];
  onSelect: (symbol: QuoteSummary) => void;
}

// Memoize search results component
const SearchResults = memo(
  ({ results, isLoading, isError, selectedResult, onSelect }: SearchResultsProps) => {
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
        {!isError && !isLoading && selectedResult && !results?.length && (
          <div className="p-4 text-sm">No symbols found</div>
        )}
        {isError && <div className="text-destructive p-4 text-sm">Something went wrong</div>}

        {results?.map((ticker) => {
          return (
            <CommandItem
              key={ticker.symbol}
              onSelect={() => onSelect(ticker)}
              value={ticker.symbol}
            >
              <Icons.Check
                className={cn(
                  "mr-2 h-4 w-4",
                  selectedResult?.symbol === ticker.symbol ? "opacity-100" : "opacity-0",
                )}
              />
              {ticker.symbol} - {ticker.longName} ({ticker.exchange})
            </CommandItem>
          );
        })}
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
      allowFreeText = false,
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(defaultValue ?? value ?? "");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [selected, setSelected] = useState(() => {
      if (selectedResult) {
        return `${selectedResult.symbol} - ${selectedResult.longName}`;
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
      (ticker: QuoteSummary) => {
        onSelectResult(ticker?.symbol);
        const displayText = ticker ? `${ticker.symbol} - ${ticker.longName}` : "";
        setSearchQuery(displayText);
        setSelected(displayText);
        setOpen(false);
        debouncedSearch.cancel(); // Cancel pending debounced calls
      },
      [onSelectResult, debouncedSearch],
    );

    // Handle manual input when user types a symbol that doesn't exist in search results
    const handleManualInput = useCallback(
      (inputValue: string) => {
        if (allowFreeText && inputValue.trim()) {
          const manualSymbol = inputValue.toUpperCase().trim();
          onSelectResult(manualSymbol, true); // true indicates it's manual
          setSelected(manualSymbol);
          setSearchQuery(manualSymbol);
          setOpen(false);
          debouncedSearch.cancel();
        }
      },
      [allowFreeText, onSelectResult, debouncedSearch],
    );

    // Use debounced query for API call
    const { data, isLoading, isError } = useQuery<QuoteSummary[], Error>({
      queryKey: ["ticker-search", debouncedQuery],
      queryFn: () => searchTicker(debouncedQuery),
      enabled:
        debouncedQuery?.length > 1 &&
        selected !== debouncedQuery &&
        defaultValue !== debouncedQuery,
      staleTime: 60000, // Cache results for 1 minute
      gcTime: 300000, // Keep in cache for 5 minutes (formerly cacheTime)
    });

    // Memoize sorted results
    const sortedTickers = useMemo(() => {
      return data?.sort((a, b) => b.score - a.score);
    }, [data]);

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

    // Handle keyboard events for manual input detection
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && allowFreeText && searchQuery.trim()) {
          // Check if there are no search results or user is typing without waiting for results
          const hasNoResults = !isLoading && (!sortedTickers || sortedTickers.length === 0);
          if (hasNoResults || (sortedTickers && sortedTickers.length === 0)) {
            e.preventDefault();
            handleManualInput(searchQuery);
          }
        }
      },
      [allowFreeText, searchQuery, isLoading, sortedTickers, handleManualInput],
    );

    // Handle blur event to detect manual input when user clicks away
    const handleBlur = useCallback(() => {
      if (allowFreeText && searchQuery.trim() && !open) {
        // If user typed something and popover is closed, treat as manual input
        const hasNoResults = !isLoading && (!sortedTickers || sortedTickers.length === 0);
        if (hasNoResults) {
          handleManualInput(searchQuery);
        }
      }
    }, [allowFreeText, searchQuery, open, isLoading, sortedTickers, handleManualInput]);

    return (
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
          className="h-auto w-(--radix-popover-trigger-width) p-0"
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <Command shouldFilter={false} className="border-none">
            <CommandInput
              ref={inputRef}
              value={searchQuery}
              onValueChange={handleSearchChange}
              placeholder="Search for symbol"
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />

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

              {!isError && !isLoading && sortedTickers?.length === 0 && searchQuery && (
                <>
                  <div className="border-border border-b p-2">
                    <div className="text-muted-foreground mb-2 px-2 text-xs">No results found</div>
                    {allowFreeText && (
                      <CommandItem
                        onSelect={() => {
                          handleManualInput(searchQuery);
                        }}
                        value={searchQuery}
                        className="bg-accent/50 aria-selected:bg-accent"
                      >
                        <Icons.Plus className="mr-2 h-4 w-4" />
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Add new manual asset</span>
                          <span className="text-muted-foreground text-xs">
                            Create "{searchQuery.toUpperCase().trim()}" as manual holding
                          </span>
                        </div>
                      </CommandItem>
                    )}
                  </div>
                  {!allowFreeText && <div className="p-4 text-sm">No symbols found</div>}
                </>
              )}

              {!isError && !isLoading && sortedTickers?.length === 0 && !searchQuery && (
                <>
                  {allowFreeText ? (
                    <div className="p-4 text-center text-sm">
                      <div className="text-muted-foreground">Start typing to search for symbols</div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        Or type a symbol name to create a manual asset
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-sm">No symbols found</div>
                  )}
                </>
              )}

              {isError && (
                <div className="text-destructive p-4 text-sm">
                  <div>Something went wrong</div>
                  <div className="mt-1 text-xs opacity-70">
                    Try again or check your market data provider settings.
                  </div>
                </div>
              )}

              {sortedTickers?.map((ticker) => {
                return (
                  <CommandItem
                    key={ticker.symbol}
                    onSelect={() => handleSelectResult(ticker)}
                    value={ticker.symbol}
                  >
                    <Icons.Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedResult?.symbol === ticker.symbol ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {ticker.symbol} - {ticker.longName} ({ticker.exchange})
                  </CommandItem>
                );
              })}

              {/* Add manual asset option when there are results but user might want something else */}
              {allowFreeText &&
                searchQuery &&
                sortedTickers &&
                sortedTickers.length > 0 &&
                !sortedTickers.some(
                  (t) => t.symbol.toLowerCase() === searchQuery.toLowerCase().trim(),
                ) && (
                  <div className="border-border border-t">
                    <CommandItem
                      onSelect={() => {
                        handleManualInput(searchQuery);
                      }}
                      value={`manual-${searchQuery}`}
                      className="bg-accent/30"
                    >
                      <Icons.Plus className="mr-2 h-4 w-4" />
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">Add "{searchQuery.toUpperCase().trim()}" as manual asset</span>
                        <span className="text-muted-foreground text-xs">
                          If the symbol you want isn't listed above
                        </span>
                      </div>
                    </CommandItem>
                  </div>
                )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);

TickerSearchInput.displayName = "TickerSearchInput";

export default TickerSearchInput;
