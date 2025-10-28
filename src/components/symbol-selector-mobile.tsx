import { searchTicker } from "@/commands/market-data";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useState } from "react";

interface SymbolSelectorMobileProps {
  onSelect: (symbol: string) => void;
  value?: string;
  placeholder?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const SymbolSelectorMobile = forwardRef<HTMLButtonElement, SymbolSelectorMobileProps>(
  (
    {
      onSelect,
      value,
      placeholder = "Select symbol...",
      className,
      open: controlledOpen,
      onOpenChange,
    },
    ref,
  ) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

    const [searchQuery, setSearchQuery] = useState("");

    // Query for dynamic ticker search
    const {
      data: searchResults,
      isLoading,
      isError,
    } = useQuery<QuoteSummary[], Error>({
      queryKey: ["symbol-ticker-search", searchQuery],
      queryFn: () => searchTicker(searchQuery),
      enabled: searchQuery?.length > 1,
    });

    // Sort search results by score if available
    const sortedSearchResults = searchResults?.sort((a, b) => b.score - a.score) ?? [];

    const handleSymbolSelect = (ticker: QuoteSummary) => {
      onSelect(ticker.symbol);
      setOpen(false);
      setSearchQuery("");
    };

    // Find the currently selected symbol's info
    const selectedSymbol = value ? sortedSearchResults.find((s) => s.symbol === value) : undefined;

    const displayText = selectedSymbol
      ? `${selectedSymbol.symbol} - ${selectedSymbol.longName}`
      : value || placeholder;

    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            role="combobox"
            size="lg"
            className={cn(
              "w-full justify-between truncate font-normal",
              !value && "text-muted-foreground",
              className,
            )}
          >
            <span className="truncate">{displayText}</span>
            <Icons.Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[85vh] p-0">
          <SheetHeader className="border-border border-b py-2">
            <SheetTitle>Select Symbol</SheetTitle>
            <SheetDescription>Search for a stock, ETF, crypto, or other asset</SheetDescription>
          </SheetHeader>

          <div className="flex h-[calc(85vh-5rem)] flex-col">
            {/* Search Input */}
            <div className="border-border border-b px-6 py-4">
              <div className="relative">
                <Icons.Search className="text-muted-foreground absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search symbols..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-background border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-14 w-full rounded-md border px-4 py-3 pl-12 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* Results */}
            <ScrollArea className="flex-1 px-6 py-4">
              {/* Loading state */}
              {isLoading && searchQuery.length > 1 && (
                <div className="space-y-3">
                  <div className="text-muted-foreground text-sm font-medium">Searching...</div>
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              )}

              {/* Error state */}
              {isError && searchQuery.length > 1 && (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  Error searching for symbols. Please try again.
                </div>
              )}

              {/* Search results */}
              {!isLoading &&
                !isError &&
                sortedSearchResults.length > 0 &&
                searchQuery.length > 1 && (
                  <div className="space-y-2">
                    {sortedSearchResults.slice(0, 20).map((ticker) => (
                      <button
                        key={ticker.symbol}
                        onClick={() => handleSymbolSelect(ticker)}
                        className="card-mobile hover:bg-accent active:bg-accent/80 focus:border-primary flex w-full items-center gap-3 border border-transparent text-left transition-colors focus:outline-none"
                      >
                        <div className="bg-primary/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                          <Icons.TrendingUp className="text-primary h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground truncate font-medium">
                              {ticker.longName || ticker.symbol}
                            </span>
                            <span className="text-muted-foreground text-xs font-medium">
                              {ticker.symbol}
                            </span>
                          </div>
                          {ticker.exchange && (
                            <div className="text-muted-foreground mt-0.5 text-sm">
                              {ticker.exchange}
                            </div>
                          )}
                        </div>
                        <Icons.ChevronRight className="text-muted-foreground h-5 w-5 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

              {/* Empty state */}
              {searchQuery.length === 0 && (
                <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
                  <Icons.Search className="h-12 w-12 opacity-20" />
                  <p>Start typing to search for symbols</p>
                </div>
              )}

              {/* No results state */}
              {searchQuery.length > 0 &&
                !isLoading &&
                !isError &&
                sortedSearchResults.length === 0 &&
                searchQuery.length > 1 && (
                  <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                    No symbols found matching "{searchQuery}".
                  </div>
                )}

              {/* Too short query state */}
              {searchQuery.length > 0 && searchQuery.length <= 1 && (
                <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                  Type at least 2 characters to search.
                </div>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    );
  },
);

SymbolSelectorMobile.displayName = "SymbolSelectorMobile";
