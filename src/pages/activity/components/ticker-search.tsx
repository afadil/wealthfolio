import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Command as CommandPrimitive } from 'cmdk';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

import { searchTicker } from '@/commands/symbol';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuoteSummary } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

interface SearchProps {
  selectedResult?: QuoteSummary;
  defaultValue?: string;
  onSelectResult: (symbol: string) => void;
}
interface SearchResultsProps {
  results?: QuoteSummary[];
  query: string;
  isLoading: boolean;
  isError?: boolean;
  selectedResult: SearchProps['selectedResult'];
  onSelect: (symbol: QuoteSummary) => void;
}

function TickerSearchInput({ selectedResult, defaultValue, onSelectResult }: SearchProps) {
  //@ts-ignore
  const [searchQuery, setSearchQuery] = useState(defaultValue || '');
  const [selected, setSelected] = useState('');

  const handleSelectResult = (ticker: QuoteSummary) => {
    onSelectResult(ticker?.symbol);
    setSearchQuery(ticker ? `${ticker.symbol} - ${ticker.longName}` : '');
    setSelected(ticker ? `${ticker.symbol} - ${ticker.longName}` : '');
  };

  const { data, isLoading, isError } = useQuery<QuoteSummary[], Error>({
    queryKey: ['ticker-search', searchQuery],
    queryFn: () => searchTicker(searchQuery),
    enabled: searchQuery?.length > 1 && selected !== searchQuery && defaultValue !== searchQuery,
  });

  //sort by score
  const tickers = data?.sort((a, b) => b.score - a.score);

  return (
    <Command
      shouldFilter={false}
      className="h-auto w-full rounded-lg border border-b-0 shadow-none"
    >
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
  );
}

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
            <Check
              className={cn(
                'mr-2 h-4 w-4',
                selectedResult?.symbol === ticker.symbol ? 'opacity-100' : 'opacity-0',
              )}
            />
            {ticker.symbol} - {ticker.longName}
          </CommandItem>
        );
      })}
    </CommandList>
  );
}

export default TickerSearchInput;
