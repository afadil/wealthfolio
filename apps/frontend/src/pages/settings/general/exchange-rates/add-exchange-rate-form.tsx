import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useTranslation } from "react-i18next";

import { Button } from "@wealthfolio/ui/components/ui/button";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@wealthfolio/ui/components/ui/command";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { useCustomProviders } from "@/hooks/use-custom-providers";
import { useMarketDataProviders } from "@/hooks/use-market-data-providers";
import { useSettings } from "@/hooks/use-settings";
import { ExchangeRate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MoneyInput, worldCurrencies } from "@wealthfolio/ui";

function createExchangeRateSchema(t: TFunction) {
  return z
    .object({
      fromCurrency: z.string().min(1, t("settings.exchange_rates.form.validation.from_required")),
      toCurrency: z.string().min(1, t("settings.exchange_rates.form.validation.to_required")),
      rate: z.coerce
        .number({
          invalid_type_error: t("settings.exchange_rates.form.validation.rate_invalid_type"),
        })
        .min(0, { message: t("settings.exchange_rates.form.validation.rate_non_negative") })
        .optional(),
      source: z.string().min(1, t("settings.exchange_rates.form.validation.source_required")),
    })
    .refine(
      (data) => {
        if (data.source === "MANUAL") {
          return data.rate !== undefined && data.rate > 0;
        }
        return true;
      },
      {
        message: t("settings.exchange_rates.form.validation.rate_required_manual"),
        path: ["rate"],
      },
    );
}

type ExchangeRateFormData = z.infer<ReturnType<typeof createExchangeRateSchema>>;

interface AddExchangeRateFormProps {
  onSubmit: (newRate: Omit<ExchangeRate, "id">) => void;
  onCancel: () => void;
}

export function AddExchangeRateForm({ onSubmit, onCancel }: AddExchangeRateFormProps) {
  const { t } = useTranslation("common");
  const exchangeRateSchema = useMemo(() => createExchangeRateSchema(t), [t]);
  const { data: providers } = useMarketDataProviders();
  const { data: customProviders = [] } = useCustomProviders();
  const { data: settings } = useSettings();
  const baseCurrency = (settings?.baseCurrency ?? "USD").toUpperCase();

  const form = useForm<ExchangeRateFormData>({
    resolver: zodResolver(exchangeRateSchema),
    defaultValues: {
      fromCurrency: baseCurrency,
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
            <FormLabel>
              {fieldName === "fromCurrency"
                ? t("settings.exchange_rates.form.label_from_currency")
                : t("settings.exchange_rates.form.label_to_currency")}
            </FormLabel>
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
                      : t("settings.exchange_rates.form.placeholder_select_currency")}
                    <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder={t("settings.exchange_rates.form.search_currency_placeholder")}
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
                            <span className="font-semibold italic">
                              {t("settings.exchange_rates.form.custom_currency", {
                                code: searchValue,
                              })}
                            </span>
                          </CommandItem>
                        )}

                        {(() => {
                          const filtered = worldCurrencies.filter(
                            (currency) =>
                              currency.label.toLowerCase().includes(searchValue.toLowerCase()) ||
                              currency.value.includes(searchValue),
                          );
                          const ordered =
                            fieldName === "fromCurrency"
                              ? [
                                  ...filtered.filter((c) => c.value === baseCurrency),
                                  ...filtered.filter((c) => c.value !== baseCurrency),
                                ]
                              : filtered;
                          return ordered.map((currency) => (
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
                          ));
                        })()}
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
          <DialogTitle>{t("settings.exchange_rates.form.dialog_title")}</DialogTitle>
          <DialogDescription>{t("settings.exchange_rates.form.dialog_description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          {renderCurrencyField("fromCurrency")}
          {renderCurrencyField("toCurrency")}

          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.exchange_rates.form.label_data_source")}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("settings.exchange_rates.form.placeholder_data_source")}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MANUAL">
                      {t("settings.exchange_rates.source_manual")}
                    </SelectItem>
                    {providers
                      ?.filter((p) => p.id !== "CUSTOM_SCRAPER" && p.providerType !== "custom")
                      .map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    {customProviders
                      .filter((cp) => cp.enabled)
                      .map((cp) => (
                        <SelectItem key={cp.id} value={`CUSTOM_SCRAPER:${cp.id}`}>
                          {cp.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {isManualSource
                    ? t("settings.exchange_rates.form.hint_manual")
                    : t("settings.exchange_rates.form.hint_provider")}
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
                  <FormLabel>{t("settings.exchange_rates.form.label_rate")}</FormLabel>
                  <FormControl>
                    <MoneyInput
                      placeholder={t("settings.exchange_rates.form.placeholder_rate")}
                      {...field}
                    />
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
              {t("settings.shared.cancel")}
            </Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span className="hidden sm:ml-2 sm:inline">
              {t("settings.exchange_rates.form.submit_add")}
            </span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
