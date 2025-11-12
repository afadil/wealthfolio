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
import { useTranslation } from "react-i18next";

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
  isLoading: boolean;
  isError?: boolean;
  selectedResult: SearchProps["selectedResult"];
  onSelect: (symbol: QuoteSummary) => void;
  t: (key: string) => string;
}

// Memoize search results component
const SearchResults = memo(
  ({ results, isLoading, isError, selectedResult, onSelect, t }: SearchResultsProps) => {
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
          <div className="p-4 text-sm">{t("datagrid.noSymbolsFound")}</div>
        )}
        {isError && <div className="text-destructive p-4 text-sm">{t("datagrid.loadFailed")}</div>}

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
      placeholder,
      onSelectResult,
      className,
      allowFreeText = false,
    },
    ref,
  ) => {
    const { t } = useTranslation("activity");
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

    // Backend already returns results sorted by provider priority and score
    // No need for frontend sorting - use data directly

    // Calculate display name for the button
    const displayName = selected || placeholder || t("symbolSelector.selectSymbol");

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
          const hasNoResults = !isLoading && (!data || data.length === 0);
          if (hasNoResults || (data && data.length === 0)) {
            e.preventDefault();
            handleManualInput(searchQuery);
          }
        }
      },
      [allowFreeText, searchQuery, isLoading, data, handleManualInput],
    );

    // Handle blur event to detect manual input when user clicks away
    const handleBlur = useCallback(() => {
      if (allowFreeText && searchQuery.trim() && !open) {
        // If user typed something and popover is closed, treat as manual input
        const hasNoResults = !isLoading && (!data || data.length === 0);
        if (hasNoResults) {
          handleManualInput(searchQuery);
        }
      }
    }, [allowFreeText, searchQuery, open, isLoading, data, handleManualInput]);

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
          <Command shouldFilter={false} className="!h-auto border-none">
            <CommandInput
              ref={inputRef}
              value={searchQuery}
              onValueChange={handleSearchChange}
              placeholder={t("symbolSelector.searchSymbol")}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />

            <CommandList className="!max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <CommandPrimitive.Loading>
                  <div className="space-y-2 p-1">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </CommandPrimitive.Loading>
              ) : null}

              {!isError && !isLoading && data?.length === 0 && searchQuery && (
                <>
                  <div className="border-border border-b p-2">
                    <div className="text-muted-foreground mb-2 px-2 text-xs">
                      {t("datagrid.noSymbolsFound")}
                    </div>
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
                          <span className="font-medium">{t("datagrid.addManualAsset")}</span>
                          <span className="text-muted-foreground text-xs">
                            {t("datagrid.createManualHolding", {
                              symbol: searchQuery.toUpperCase().trim(),
                            })}
                          </span>
                        </div>
                      </CommandItem>
                    )}
                  </div>
                  {!allowFreeText && (
                    <div className="p-4 text-sm">{t("datagrid.noSymbolsFound")}</div>
                  )}
                </>
              )}

              {!isError && !isLoading && data?.length === 0 && !searchQuery && (
                <>
                  {allowFreeText ? (
                    <div className="p-4 text-center text-sm">
                      <div className="text-muted-foreground">
                        Start typing to search for symbols
                      </div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        Or type a symbol name to create a manual asset
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-sm">{t("datagrid.noSymbolsFound")}</div>
                  )}
                </>
              )}

              {isError && (
                <div className="text-destructive p-4 text-sm">
                  <div>{t("datagrid.loadFailed")}</div>
                  <div className="mt-1 text-xs opacity-70">{t("datagrid.loadFailedHint")}</div>
                </div>
              )}

              {data?.map((ticker) => {
                return (
                  <CommandItem
                    key={`${ticker.symbol}-${ticker.exchange}`}
                    onSelect={() => handleSelectResult(ticker)}
                    value={ticker.symbol}
                  >
                    <Icons.Check
                      className={cn(
                        "mr-2 h-4 w-4 flex-shrink-0",
                        selectedResult?.symbol === ticker.symbol ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-1 items-center justify-between gap-2 overflow-hidden">
                      <span className="truncate">
                        {ticker.symbol} - {ticker.longName}
                      </span>
                      <span
                        className={cn(
                          "text-muted-foreground flex-shrink-0 rounded px-1.5 py-0.5 text-xs",
                          ticker.exchange === "MANUAL" && "bg-accent text-accent-foreground",
                        )}
                      >
                        {ticker.exchange}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}

              {/* Add manual asset option when there are results but user might want something else */}
              {allowFreeText &&
                searchQuery &&
                data &&
                data.length > 0 &&
                !data.some((t) => t.symbol.toLowerCase() === searchQuery.toLowerCase().trim()) && (
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
                        <span className="text-sm font-medium">
                          Add "{searchQuery.toUpperCase().trim()}" as manual asset
                        </span>
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
