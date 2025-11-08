import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/commands/settings";
import { getExchangeRates } from "@/commands/exchange-rates";

interface UseCurrencyConversionOptions {
  enabled?: boolean;
}

export function useCurrencyConversion({ enabled = true }: UseCurrencyConversionOptions) {
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  const {
    data: exchangeRates,
    isLoading: ratesLoading,
    error: ratesError,
  } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: getExchangeRates,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });

  const baseCurrency = settings?.baseCurrency || "USD";

  // Create a currency conversion function
  const convertToBaseCurrency = (amount: number, fromCurrency: string, _date?: string): number => {
    if (!exchangeRates || fromCurrency === baseCurrency) {
      return amount;
    }

    // Find the exchange rate for the currency pair
    const rate = exchangeRates.find(
      (rate) => rate.fromCurrency === fromCurrency && rate.toCurrency === baseCurrency,
    );

    if (rate) {
      return amount * rate.rate;
    }

    // Try reverse rate (toCurrency -> fromCurrency)
    const reverseRate = exchangeRates.find(
      (rate) => rate.fromCurrency === baseCurrency && rate.toCurrency === fromCurrency,
    );

    if (reverseRate) {
      const rateValue = reverseRate.rate;
      return rateValue > 0 ? amount / rateValue : amount;
    }

    // If no rate found, return original amount
    console.warn(`No exchange rate found for ${fromCurrency} to ${baseCurrency}`);
    return amount;
  };

  return {
    baseCurrency,
    exchangeRates,
    convertToBaseCurrency,
    isLoading: settingsLoading || ratesLoading,
    error: settingsError || ratesError,
  };
}
