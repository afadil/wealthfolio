import { useState, forwardRef, useRef, useMemo, useCallback, memo } from 'react';
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
  onSelectResult: (symbol: string) => void;
  className?: string;
}

interface SearchResultsProps {
  results?: QuoteSummary[];
  query: string;
  isLoading: boolean;
  isError?: boolean;
  selectedResult: SearchProps['selectedResult'];
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
                  'mr-2 h-4 w-4',
                  selectedResult?.symbol === ticker.symbol ? 'opacity-100' : 'opacity-0',
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
        {results?.map((ticker) => {
          return (
            <CommandItem
              key={ticker.symbol}
              onSelect={() => onSelect(ticker)}
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
    );
  },
);

SearchResults.displayName = 'SearchResults';

const TickerSearchInput = forwardRef<HTMLButtonElement, SearchProps>(
  (
    {
      selectedResult,
      defaultValue,
      value,
      placeholder = 'Select symbol...',
      onSelectResult,
      className,
    {
      selectedResult,
      defaultValue,
      value,
      placeholder = 'Select symbol...',
      onSelectResult,
      className,
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
        const displayText = ticker ? `${ticker.symbol} - ${ticker.longName}` : '';
        setSearchQuery(displayText);
        setSelected(displayText);
        setOpen(false);
        debouncedSearch.cancel(); // Cancel pending debounced calls
      },
      [onSelectResult, debouncedSearch],
    );
    const handleSelectResult = useCallback(
      (ticker: QuoteSummary) => {
        onSelectResult(ticker?.symbol);
        const displayText = ticker ? `${ticker.symbol} - ${ticker.longName}` : '';
        setSearchQuery(displayText);
        setSelected(displayText);
        setOpen(false);
        debouncedSearch.cancel(); // Cancel pending debounced calls
      },
      [onSelectResult, debouncedSearch],
    );

    // Use debounced query for API call
    const { data, isLoading, isError } = useQuery<QuoteSummary[], Error>({
      queryKey: ['ticker-search', debouncedQuery],
      queryFn: () => searchTicker(debouncedQuery),
      enabled:
        debouncedQuery?.length > 1 &&
        selected !== debouncedQuery &&
        defaultValue !== debouncedQuery,
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
            className={cn('w-full justify-between', open && 'ring-ring ring-2', className)}
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

TickerSearchInput.displayName = 'TickerSearchInput';

export default TickerSearchInput;

