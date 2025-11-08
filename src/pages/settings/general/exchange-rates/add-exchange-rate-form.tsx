import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { worldCurrencies } from "@wealthfolio/ui";
import { ExchangeRate } from "@/lib/types";
import { Icons } from "@/components/ui/icons";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MoneyInput } from "@wealthfolio/ui";

const exchangeRateSchema = (t: (key: string) => string) => z.object({
  fromCurrency: z.string().min(1, t("exchange_rates_from_required")),
  toCurrency: z.string().min(1, t("exchange_rates_to_required")),
  rate: z.coerce
    .number({
      required_error: t("exchange_rates_rate_required"),
      invalid_type_error: t("exchange_rates_rate_positive"),
    })
    .min(0, { message: t("exchange_rates_rate_non_negative") }),
});

interface AddExchangeRateFormProps {
  onSubmit: (newRate: Omit<ExchangeRate, "id">) => void;
  onCancel: () => void;
}

export function AddExchangeRateForm({ onSubmit, onCancel }: AddExchangeRateFormProps) {
  const { t } = useTranslation("settings");

  type ExchangeRateFormData = z.infer<ReturnType<typeof exchangeRateSchema>>;

  const form = useForm<ExchangeRateFormData>({
    resolver: zodResolver(exchangeRateSchema(t)),
    defaultValues: {
      fromCurrency: "",
      toCurrency: "",
      rate: 0,
    },
  });

  const handleSubmit = (data: ExchangeRateFormData) => {
    onSubmit({
      ...data,
      source: "MANUAL",
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
            <FormLabel>{fieldName === "fromCurrency" ? t("exchange_rates_from_currency") : t("exchange_rates_to_currency")}</FormLabel>
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
                      : t("exchange_rates_select_currency")}
                    <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder={t("exchange_rates_search_currency")}
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
                            <span className="font-semibold italic">{t("exchange_rates_custom", { value: searchValue })}</span>
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
          <DialogTitle>{t("exchange_rates_add_title")}</DialogTitle>
          <DialogDescription>{t("exchange_rates_add_description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          {renderCurrencyField("fromCurrency")}
          {renderCurrencyField("toCurrency")}

          <FormField
            control={form.control}
            name="rate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("exchange_rates_exchange_rate")}</FormLabel>
                <FormControl>
                  <MoneyInput placeholder={t("exchange_rates_enter_rate")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={onCancel}>
              {t("common_cancel")}
            </Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span className="hidden sm:ml-2 sm:inline">{t("exchange_rates_add_title")}</span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
