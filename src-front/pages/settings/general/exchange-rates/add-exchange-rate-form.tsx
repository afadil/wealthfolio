import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icons } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketDataProviders } from "@/hooks/use-market-data-providers";
import { ExchangeRate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MoneyInput, worldCurrencies } from "@wealthfolio/ui";

const exchangeRateSchema = z
  .object({
    fromCurrency: z.string().min(1, "From Currency is required"),
    toCurrency: z.string().min(1, "To Currency is required"),
    rate: z.coerce
      .number({
        invalid_type_error: "Rate must be a valid positive number.",
      })
      .min(0, { message: "Rate must be a non-negative number." })
      .optional(),
    source: z.string().min(1, "Data source is required"),
  })
  .refine(
    (data) => {
      // Rate is required only for MANUAL source
      if (data.source === "MANUAL") {
        return data.rate !== undefined && data.rate > 0;
      }
      return true;
    },
    {
      message: "Please enter a valid exchange rate.",
      path: ["rate"],
    },
  );

type ExchangeRateFormData = z.infer<typeof exchangeRateSchema>;

interface AddExchangeRateFormProps {
  onSubmit: (newRate: Omit<ExchangeRate, "id">) => void;
  onCancel: () => void;
}

export function AddExchangeRateForm({ onSubmit, onCancel }: AddExchangeRateFormProps) {
  const { data: providers } = useMarketDataProviders();
  const form = useForm<ExchangeRateFormData>({
    resolver: zodResolver(exchangeRateSchema),
    defaultValues: {
      fromCurrency: "",
      toCurrency: "",
      rate: undefined,
      source: "MANUAL",
    },
  });

  const selectedSource = form.watch("source");
  const isManualSource = selectedSource === "MANUAL";

  const handleSubmit = (data: ExchangeRateFormData) => {
    onSubmit({
      fromCurrency: data.fromCurrency,
      toCurrency: data.toCurrency,
      source: data.source,
      // Only include rate for manual sources
      rate: isManualSource ? data.rate! : 1,
      timestamp: new Date().toISOString(),
    });
  };

  const renderCurrencyField = (fieldName: "fromCurrency" | "toCurrency") => {
    const [searchValue, setSearchValue] = useState("");

    const handleSearchChange = (value: string) => {
      setSearchValue(value);
      const matchingCurrency = worldCurrencies.find(
        (currency) =>
          currency.label.toLowerCase().includes(value.toLowerCase()) ||
          currency.value.includes(value),
      );
      if (!matchingCurrency && value) {
        form.setValue(fieldName, value.toUpperCase());
      }
    };

    return (
      <FormField
        control={form.control}
        name={fieldName}
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>{fieldName === "fromCurrency" ? "From Currency" : "To Currency"}</FormLabel>
            <Popover modal={true}>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn("justify-between", !field.value && "text-muted-foreground")}
                  >
                    {field.value
                      ? worldCurrencies.find((currency) => currency.value === field.value)?.label ||
                        field.value
                      : "Select currency"}
                    <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder="Search currency..."
                    onValueChange={handleSearchChange}
                  />
                  <CommandList>
                    <CommandGroup>
                      <ScrollArea className="max-h-96 overflow-y-auto">
                        {searchValue && (
                          <CommandItem
                            value={searchValue}
                            key={searchValue}
                            onSelect={() => {
                              form.setValue(fieldName, searchValue);
                            }}
                          >
                            <Icons.Plus
                              className={cn(
                                "mr-2 h-4 w-4",
                                searchValue === field.value ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="font-semibold italic">Custom ({searchValue})</span>
                          </CommandItem>
                        )}

                        {worldCurrencies
                          .filter(
                            (currency) =>
                              currency.label.toLowerCase().includes(searchValue.toLowerCase()) ||
                              currency.value.includes(searchValue),
                          )
                          .map((currency) => (
                            <CommandItem
                              value={currency.label}
                              key={currency.value}
                              onSelect={() => {
                                form.setValue(fieldName, currency.value);
                              }}
                            >
                              <Icons.Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  currency.value === field.value ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {currency.label}
                            </CommandItem>
                          ))}
                      </ScrollArea>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle>Add Exchange Rate</DialogTitle>
          <DialogDescription>Add a new exchange rate to the system.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          {renderCurrencyField("fromCurrency")}
          {renderCurrencyField("toCurrency")}

          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data Source</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a data source" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MANUAL">Manual</SelectItem>
                    {providers?.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {isManualSource
                    ? "You'll need to manually update this rate."
                    : "Rate will be automatically fetched from the selected provider."}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {isManualSource && (
            <FormField
              control={form.control}
              name="rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Exchange Rate</FormLabel>
                  <FormControl>
                    <MoneyInput placeholder="Enter exchange rate" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span className="hidden sm:ml-2 sm:inline">Add Exchange Rate</span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
