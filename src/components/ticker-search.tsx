import { useState, forwardRef, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Command as CommandPrimitive } from 'cmdk';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { searchTicker } from '@/commands/market-data';
import { cn } from '@/lib/utils';
import { QuoteSummary } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Icons } from '@/components/ui/icons';
import { debounce } from 'lodash';

interface SearchProps {
  selectedResult?: QuoteSummary;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  onSelectResult: (symbol: string, isManual?: boolean) => void;
  className?: string;
  allowFreeText?: boolean;
}

// Removed unused SearchResults component

const TickerSearchInput = forwardRef<HTMLButtonElement, SearchProps>(
  (
    {
      selectedResult,
      defaultValue,
      value,
      placeholder = 'Select symbol...',
      onSelectResult,
      className,
      allowFreeText = false,
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(defaultValue || value || '');
    const [debouncedQuery, setDebouncedQuery] = useState('');
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
      return '';
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
        onSelectResult(ticker?.symbol, false); // false indicates it's not manual
        const displayText = ticker ? `${ticker.symbol} - ${ticker.longName}` : '';
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
      queryKey: ['ticker-search', debouncedQuery],
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
        if (e.key === 'Enter' && allowFreeText && searchQuery.trim()) {
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
              'w-full justify-between truncate rounded-md',
              open && 'ring-2 ring-ring',
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
          className="h-auto w-[var(--radix-popover-trigger-width)] p-0"
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
                  {allowFreeText && (
                    <CommandItem
                      onSelect={() => {
                        handleManualInput(searchQuery);
                      }}
                      value={searchQuery}
                    >
                      <Icons.Plus className="mr-2 h-4 w-4" />
                      Create manual holding: {searchQuery.toUpperCase().trim()}
                    </CommandItem>
                  )}
                  {!allowFreeText && <div className="p-4 text-sm">No symbols found</div>}
                </>
              )}

              {!isError && !isLoading && sortedTickers?.length === 0 && !searchQuery && (
                <div className="p-4 text-sm">No symbols found</div>
              )}

              {isError && <div className="p-4 text-sm text-destructive">Something went wrong</div>}

              {sortedTickers?.map((ticker) => {
                return (
                  <CommandItem
                    key={ticker.symbol}
                    onSelect={() => handleSelectResult(ticker)}
                    value={ticker.symbol}
                  >
                    <Icons.Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedResult?.symbol === ticker.symbol ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {ticker.symbol} - {ticker.longName} ({ticker.exchange})
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);

TickerSearchInput.displayName = 'TickerSearchInput';

export default TickerSearchInput;
