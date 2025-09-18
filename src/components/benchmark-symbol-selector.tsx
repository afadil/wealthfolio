import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Icons } from "@/components/ui/icons";
import { searchTicker } from "@/commands/market-data";
import { QuoteSummary } from "@/lib/types";

const BENCHMARKS = [
  {
    group: "US Market Indices",
    items: [
      { symbol: "^GSPC", name: "S&P 500", description: "Large-cap US stocks" },
      { symbol: "^NDX", name: "Nasdaq 100", description: "Large-cap tech-focused US stocks" },
      { symbol: "^RUT", name: "Russell 2000", description: "Small-cap US stocks" },
      { symbol: "^DJI", name: "Dow Jones", description: "Blue-chip US stocks" },
    ],
  },
  {
    group: "European Indices",
    items: [
      { symbol: "^FTSE", name: "FTSE 100", description: "Large-cap UK stocks" },
      { symbol: "^STOXX50E", name: "EURO STOXX 50", description: "European blue-chip stocks" },
      { symbol: "^GDAXI", name: "DAX", description: "German blue-chip stocks" },
      { symbol: "^FCHI", name: "CAC 40", description: "French large-cap stocks" },
      { symbol: "^IBEX", name: "IBEX 35", description: "Spanish large-cap stocks" },
      { symbol: "^AEX", name: "AEX", description: "Dutch blue-chip stocks" },
      { symbol: "^OMX", name: "OMX Stockholm 30", description: "Swedish large-cap stocks" },
    ],
  },
  {
    group: "Asian Indices",
    items: [
      { symbol: "^N225", name: "Nikkei 225", description: "Japanese large-cap stocks" },
      { symbol: "^HSI", name: "Hang Seng", description: "Hong Kong large-cap stocks" },
      { symbol: "000001.SS", name: "Shanghai Composite", description: "Chinese A-shares" },
      { symbol: "^KS11", name: "KOSPI", description: "South Korean stocks" },
      { symbol: "^TWII", name: "Taiwan Weighted", description: "Taiwanese stocks" },
      { symbol: "^AXJO", name: "ASX 200", description: "Australian large-cap stocks" },
      { symbol: "^BSESN", name: "BSE Sensex", description: "Indian large-cap stocks" },
      { symbol: "^NSEI", name: "NIFTY 50", description: "Indian blue-chip stocks" },
    ],
  },
  {
    group: "Global & Emerging Markets",
    items: [
      { symbol: "EEM", name: "MSCI Emerging Markets", description: "Emerging market stocks" },
      { symbol: "ACWI", name: "MSCI All Country World", description: "Global equity markets" },
      { symbol: "IEFA", name: "Core MSCI EAFE", description: "Europe, Australasia, Far East" },
    ],
  },
  {
    group: "ETFs",
    items: [
      { symbol: "VOO", name: "Vanguard S&P 500", description: "S&P 500 index fund" },
      { symbol: "VTI", name: "Vanguard Total Stock", description: "Total US market" },
      { symbol: "VEA", name: "Vanguard FTSE Developed", description: "Developed markets ex-US" },
      { symbol: "VWO", name: "Vanguard FTSE Emerging", description: "Emerging markets" },
    ],
  },
];

interface BenchmarkSymbolSelectorProps {
  onSelect: (symbol: { id: string; name: string }) => void;
  className?: string;
}

export function BenchmarkSymbolSelector({ onSelect, className }: BenchmarkSymbolSelectorProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Query for dynamic ticker search
  const {
    data: searchResults,
    isLoading,
    isError,
  } = useQuery<QuoteSummary[], Error>({
    queryKey: ["benchmark-ticker-search", searchQuery],
    queryFn: () => searchTicker(searchQuery),
    enabled: searchQuery?.length > 2, // Only search when query is longer than 2 characters
  });

  // Sort search results by score if available
  const sortedSearchResults = searchResults?.sort((a, b) => b.score - a.score) ?? [];

  // Filter out search results that are already in predefined benchmarks
  const existingSymbols = BENCHMARKS.flatMap((group) => group.items.map((item) => item.symbol));
  const filteredSearchResults = sortedSearchResults.filter(
    (result) => !existingSymbols.includes(result.symbol),
  );

  const handleBenchmarkSelect = (benchmark: { symbol: string; name: string }) => {
    setValue(benchmark.name);
    onSelect({ id: benchmark.symbol, name: benchmark.name });
    setOpen(false);
    setSearchQuery(""); // Clear search when selecting
  };

  const handleSearchResultSelect = (ticker: QuoteSummary) => {
    setValue(ticker.longName || ticker.symbol);
    onSelect({ id: ticker.symbol, name: ticker.longName || ticker.symbol });
    setOpen(false);
    setSearchQuery(""); // Clear search when selecting
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "bg-secondary/30 hover:bg-muted/80 flex h-8 items-center gap-1.5 rounded-md border-[1.5px] border-none px-3 py-1 text-sm font-medium",
            className,
          )}
          size="sm"
        >
          <Icons.Plus className="h-4 w-4" />
          Add Benchmark
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search benchmarks or any symbol..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>
              {isLoading ? "Searching..." : "No benchmarks or symbols found."}
            </CommandEmpty>

            {/* Predefined benchmark groups */}
            {BENCHMARKS.map((group) => (
              <CommandGroup
                key={group.group}
                heading={group.group}
                className="[&_[cmdk-group-heading]]:bg-popover [&_[cmdk-group-heading]]:border-border/10 [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:border-b"
              >
                {group.items
                  .filter(
                    (benchmark) =>
                      searchQuery.length === 0 ||
                      benchmark.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      benchmark.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      benchmark.description.toLowerCase().includes(searchQuery.toLowerCase()),
                  )
                  .map((benchmark) => (
                    <CommandItem
                      key={benchmark.symbol}
                      value={`${benchmark.name} ${benchmark.symbol}`}
                      onSelect={() => handleBenchmarkSelect(benchmark)}
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="font-medium">{benchmark.name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {benchmark.symbol}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {benchmark.description}
                        </span>
                      </div>
                      <Icons.Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          value === benchmark.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}

            {/* Loading state for search results */}
            {isLoading && searchQuery.length > 2 && (
              <CommandGroup
                heading="Search Results"
                className="[&_[cmdk-group-heading]]:bg-popover [&_[cmdk-group-heading]]:border-border/10 [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:border-b"
              >
                <div className="space-y-2 p-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </CommandGroup>
            )}

            {/* Error state for search results */}
            {isError && searchQuery.length > 2 && (
              <CommandGroup
                heading="Search Results"
                className="[&_[cmdk-group-heading]]:bg-popover [&_[cmdk-group-heading]]:border-border/10 [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:border-b"
              >
                <div className="text-muted-foreground p-4 text-sm">
                  Error searching for symbols. Please try again.
                </div>
              </CommandGroup>
            )}

            {/* Dynamic search results */}
            {!isLoading &&
              !isError &&
              filteredSearchResults.length > 0 &&
              searchQuery.length > 2 && (
                <CommandGroup
                  heading="Search Results"
                  className="[&_[cmdk-group-heading]]:bg-popover [&_[cmdk-group-heading]]:border-border/10 [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:border-b"
                >
                  {filteredSearchResults.slice(0, 8).map((ticker) => (
                    <CommandItem
                      key={ticker.symbol}
                      value={ticker.symbol}
                      onSelect={() => handleSearchResultSelect(ticker)}
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center">
                          <span className="font-medium">{ticker.longName || ticker.symbol}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {ticker.symbol}
                          </span>
                        </div>
                        {ticker.exchange && (
                          <span className="text-muted-foreground text-xs">{ticker.exchange}</span>
                        )}
                      </div>
                      <Icons.Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          value === (ticker.longName || ticker.symbol)
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
