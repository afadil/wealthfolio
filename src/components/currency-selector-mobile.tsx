import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { worldCurrencies } from "@wealthfolio/ui/lib/currencies";
import { forwardRef, useState } from "react";

interface CurrencySelectorMobileProps {
  onSelect: (currency: string) => void;
  value?: string;
  placeholder?: string;
  className?: string;
}

const popularCurrencies = ["USD", "CAD", "EUR", "GBP", "CHF"];

export const CurrencySelectorMobile = forwardRef<HTMLButtonElement, CurrencySelectorMobileProps>(
  ({ onSelect, value, placeholder = "Select currency...", className }, ref) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredCurrencies = worldCurrencies.filter(
      (curr) =>
        curr.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
        curr.label.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const handleCurrencySelect = (currencyCode: string) => {
      onSelect(currencyCode);
      setOpen(false);
      setSearchQuery("");
    };

    const selectedCurrency = worldCurrencies.find((c) => c.value === value);
    const displayText = selectedCurrency
      ? `${selectedCurrency.value} - ${selectedCurrency.label}`
      : value || placeholder;

    return (
      <>
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
          onClick={() => setOpen(true)}
          type="button"
        >
          <span className="truncate">{displayText}</span>
          <Icons.ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <SheetHeader className="border-border border-b px-6 pt-6 pb-4">
              <SheetTitle>Select Currency</SheetTitle>
              <SheetDescription>Choose your activity currency</SheetDescription>
            </SheetHeader>

            <div className="flex h-[calc(85vh-7rem)] flex-col">
              {/* Popular Currencies */}
              <div className="border-border border-b px-6 py-4">
                <h3 className="text-foreground mb-3 text-sm font-semibold">Popular</h3>
                <div className="grid grid-cols-3 gap-2">
                  {popularCurrencies.map((curr) => (
                    <button
                      key={curr}
                      onClick={() => handleCurrencySelect(curr)}
                      className={cn(
                        "card-mobile flex items-center justify-center border py-3 font-semibold transition-colors",
                        value === curr
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-accent active:bg-accent/80",
                      )}
                    >
                      {curr}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      // Focus search input when clicking "More"
                      const searchInput = document.getElementById("currency-search");
                      searchInput?.focus();
                    }}
                    className="card-mobile hover:bg-accent active:bg-accent/80 flex items-center justify-center border py-3 font-semibold transition-colors"
                  >
                    <Icons.Search className="mr-1 h-4 w-4" />
                    More
                  </button>
                </div>
              </div>

              {/* Search Input */}
              <div className="border-border border-b px-6 py-4">
                <div className="relative">
                  <Icons.Search className="text-muted-foreground absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
                  <Input
                    id="currency-search"
                    type="text"
                    placeholder="Search all currencies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12"
                  />
                </div>
              </div>

              {/* Results */}
              <ScrollArea className="flex-1 px-6 py-4">
                {searchQuery.length === 0 ? (
                  <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
                    <Icons.DollarSign className="h-12 w-12 opacity-20" />
                    <span>Search for any currency or select from popular options above.</span>
                  </div>
                ) : filteredCurrencies.length > 0 ? (
                  <div className="space-y-2">
                    {filteredCurrencies.map((curr) => (
                      <button
                        key={curr.value}
                        onClick={() => handleCurrencySelect(curr.value)}
                        className={cn(
                          "card-mobile flex w-full items-center gap-3 border border-transparent text-left transition-colors",
                          value === curr.value
                            ? "border-primary bg-primary/10"
                            : "hover:bg-accent active:bg-accent/80 focus:border-primary focus:outline-none",
                        )}
                      >
                        <div className="bg-primary/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                          <Icons.DollarSign className="text-primary h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground truncate font-semibold">
                              {curr.value}
                            </span>
                          </div>
                          <div className="text-muted-foreground mt-0.5 truncate text-sm">
                            {curr.label}
                          </div>
                        </div>
                        {value === curr.value && (
                          <Icons.Check className="text-primary h-5 w-5 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
                    <Icons.Search className="h-12 w-12 opacity-20" />
                    <span>No currencies found for "{searchQuery}".</span>
                  </div>
                )}
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  },
);

CurrencySelectorMobile.displayName = "CurrencySelectorMobile";
