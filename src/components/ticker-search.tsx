import { useState, forwardRef } from 'react';
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

const TickerSearchInput = forwardRef<HTMLButtonElement, SearchProps>(
  (
    { selectedResult, defaultValue, value, placeholder = 'Select symbol...', onSelectResult, className },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(defaultValue || value || '');
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

    const handleSelectResult = (ticker: QuoteSummary) => {
      onSelectResult(ticker?.symbol);
      const displayText = ticker ? `${ticker.symbol} - ${ticker.longName}` : '';
      setSearchQuery(displayText);
      setSelected(displayText);
      setOpen(false);
    };

    const { data, isLoading, isError } = useQuery<QuoteSummary[], Error>({
      queryKey: ['ticker-search', searchQuery],
      queryFn: () => searchTicker(searchQuery),
      enabled: searchQuery?.length > 1 && selected !== searchQuery && defaultValue !== searchQuery,
    });

    const tickers = data?.sort((a, b) => b.score - a.score);

    // Calculate display name for the button
    const displayName = selected || placeholder;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn("w-full justify-between", className)}
            ref={ref}
          >
            {displayName}
            <Icons.Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          side="bottom"
          align="start"
          className="h-auto w-[--radix-popover-trigger-width] p-0"
        >
          <Command shouldFilter={false} className="border-none">
            <CommandInput
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search for symbol"
            />

            <SearchResults
              isLoading={isLoading}
              isError={isError}
              query={searchQuery}
              results={tickers}
              selectedResult={selectedResult}
              onSelect={handleSelectResult}
            />
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);

// Add a display name for better debugging
TickerSearchInput.displayName = 'TickerSearchInput';

function SearchResults({
  results,
  isLoading,
  isError,
  selectedResult,
  onSelect,
}: SearchResultsProps) {
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
      {isError && <div className="p-4 text-sm text-destructive">Something went wrong</div>}

      {results?.map((ticker) => {
        return (
          <CommandItem key={ticker.symbol} onSelect={() => onSelect(ticker)} value={ticker.symbol}>
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
}

export default TickerSearchInput;
