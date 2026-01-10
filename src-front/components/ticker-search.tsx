import { searchTicker } from "@/commands/market-data";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@wealthfolio/ui/components/ui/command";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { QuoteSummary } from "@/lib/types";
import { getExchangeDisplayName } from "@/lib/constants";
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
  onSelectResult: (symbol: string, quoteSummary?: QuoteSummary) => void;
  className?: string;
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
  ({ results, query, isLoading, selectedResult, onSelect }: SearchResultsProps) => {
    const handleCustomSymbol = () => {
      if (query.trim()) {
        onSelect({
          symbol: query.trim().toUpperCase(),
          longName: query.trim().toUpperCase(),
          shortName: query.trim().toUpperCase(),
          exchange: "MANUAL",
          quoteType: "EQUITY",
          index: "MANUAL",
          typeDisplay: "Manual Entry",
          dataSource: "MANUAL",
          score: 0,
        });
      }
    };

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
        {!isLoading && !results?.length && query.length > 1 && (
          <CommandItem onSelect={handleCustomSymbol} value={query} className="h-11 rounded-none">
            <Icons.Plus className="mr-2 h-4 w-4" />
            Use custom symbol: <strong className="ml-1">{query.toUpperCase()}</strong>
          </CommandItem>
        )}

        {results?.map((ticker) => {
          // Use exchangeName if available (from backend), otherwise map exchange code to friendly name
          const exchangeDisplay = ticker.exchangeName || getExchangeDisplayName(ticker.exchange);
          return (
            <CommandItem
              key={ticker.symbol}
              onSelect={() => onSelect(ticker)}
              value={ticker.symbol}
              className="h-11 rounded-none"
            >
              <Icons.Check
                className={cn(
                  "mr-2 h-4 w-4",
                  selectedResult?.symbol === ticker.symbol ? "opacity-100" : "opacity-0",
                )}
              />
              {ticker.symbol} - {ticker.longName} ({exchangeDisplay})
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
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
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
      (ticker: QuoteSummary) => {
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
            />

            <SearchResults
              isLoading={isLoading}
              isError={isError}
              query={debouncedQuery}
              results={sortedTickers}
              selectedResult={selectedResult}
              onSelect={handleSelectResult}
            />
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);

TickerSearchInput.displayName = "TickerSearchInput";

export default TickerSearchInput;
