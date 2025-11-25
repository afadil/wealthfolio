import { Check, ChevronsUpDown } from "lucide-react";
import { forwardRef, useRef, useState } from "react";
import { useIsMobile as defaultUseIsMobile } from "../../hooks/use-mobile";
import { worldCurrencies } from "../../lib/currencies";
import { cn } from "../../lib/utils";
import type { ButtonProps } from "../ui/button";
import { Button } from "../ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "../ui/command";
import { Icons } from "../ui/icons";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

interface CurrencyInputCustomProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  displayMode?: "auto" | "desktop" | "mobile";
  useIsMobile?: () => boolean;
}

type CurrencyInputProps = CurrencyInputCustomProps & Omit<ButtonProps, "onChange" | "value">;

const popularCurrencies = ["USD", "CAD", "EUR", "GBP", "CHF"];

export const CurrencyInput = forwardRef<HTMLButtonElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      className,
      placeholder = "Select account currency",
      displayMode = "auto",
      useIsMobile,
      ...props
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const useIsMobileHook = useIsMobile ?? defaultUseIsMobile;
    const isMobileFromHook = useIsMobileHook();
    const isMobile = displayMode === "mobile" || (displayMode === "auto" && isMobileFromHook);

    const selectedCurrency = worldCurrencies.find((currency) => currency.value === value);
    const buttonLabel = selectedCurrency ? selectedCurrency.label : placeholder;

    const handleSelect = (currencyValue: string) => {
      onChange(currencyValue);
      setOpen(false);
      setSearchQuery("");
    };

    if (isMobile) {
      const filteredCurrencies = worldCurrencies.filter(
        (curr) =>
          curr.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
          curr.label.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      const mobileDisplayText = selectedCurrency
        ? `${selectedCurrency.value} - ${selectedCurrency.label}`
        : placeholder;

      return (
        <>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-11 w-full justify-between truncate rounded-md font-normal",
              !value && "text-muted-foreground",
              className,
            )}
            onClick={() => setOpen(true)}
            {...props}
          >
            <span className="truncate">{mobileDisplayText}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="bottom" className="mx-1 h-[85vh] rounded-t-4xl p-0">
              <SheetHeader className="border-border border-b px-6 pt-6 pb-4">
                <SheetTitle>Select Currency</SheetTitle>
                <SheetDescription>Choose your activity currency</SheetDescription>
              </SheetHeader>

              <div className="flex h-[calc(85vh-7rem)] flex-col">
                <div className="border-border border-b px-6 py-4">
                  <h3 className="text-foreground mb-3 text-sm font-semibold">Popular</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {popularCurrencies.map((curr) => (
                      <button
                        key={curr}
                        onClick={() => handleSelect(curr)}
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
                        searchInputRef.current?.focus();
                      }}
                      className="card-mobile hover:bg-accent active:bg-accent/80 flex items-center justify-center border py-3 font-semibold transition-colors"
                    >
                      <Icons.Search className="mr-1 h-4 w-4" />
                      More
                    </button>
                  </div>
                </div>
                <div className="border-border border-b px-6 py-4">
                  <div className="relative">
                    <Icons.Search className="text-muted-foreground absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
                    <Input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search all currencies..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12"
                    />
                  </div>
                </div>
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
                          onClick={() => handleSelect(curr.value)}
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
                              <span className="text-foreground truncate font-semibold">{curr.value}</span>
                            </div>
                            <div className="text-muted-foreground mt-0.5 truncate text-sm">{curr.label}</div>
                          </div>
                          {value === curr.value && <Icons.Check className="text-primary h-5 w-5 flex-shrink-0" />}
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
    }

    return (
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-11 w-full justify-between rounded-md", !value && "text-muted-foreground", className)}
            {...props}
          >
            {buttonLabel}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput placeholder="Search currency..." className="h-9" />
            <CommandList>
              <CommandEmpty>No currency found.</CommandEmpty>
              <CommandGroup>
                <ScrollArea className="max-h-96 overflow-y-auto">
                  {worldCurrencies.map((currency) => (
                    <CommandItem
                      value={currency.label}
                      key={currency.value}
                      onSelect={() => {
                        handleSelect(currency.value);
                      }}
                    >
                      {currency.label}
                      <Check
                        className={cn("ml-auto h-4 w-4", currency.value === value ? "opacity-100" : "opacity-0")}
                      />
                    </CommandItem>
                  ))}
                </ScrollArea>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  },
);

CurrencyInput.displayName = "CurrencyInput";
