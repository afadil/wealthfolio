import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { ExchangeRate } from '@/lib/types';
import {
  getExchangeRates,
  updateExchangeRate as updateExchangeRateApi,
} from '@/commands/exchange-rates';
import { QueryKeys } from '@/lib/query-keys';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { worldCurrencies } from '@/lib/currencies';

export function useExchangeRates() {
  const queryClient = useQueryClient();
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Exchange rate updated and calculation triggered successfully.',
  });

  const getCurrencyName = (code: string) => {
    const currency = worldCurrencies.find((c) => c.value === code);
    return currency ? currency.label.split(' (')[0] : code;
  };

  const { data: exchangeRates, isLoading: isLoadingRates } = useQuery<ExchangeRate[], Error>({
    queryKey: [QueryKeys.EXCHANGE_RATES],
    queryFn: async () => {
      const rates = await getExchangeRates();
      const processedRates = rates.map((rate) => ({
        ...rate,
        fromCurrencyName: getCurrencyName(rate.fromCurrency),
        toCurrencyName: getCurrencyName(rate.toCurrency),
      }));

      // For manual rates, keep only from->to and filter out the reverse
      return processedRates.filter((rate) => {
        if (rate.source === 'MANUAL') {
          const reverseManualRate = processedRates.find(
            (r) =>
              r.fromCurrency === rate.toCurrency &&
              r.toCurrency === rate.fromCurrency &&
              r.source === 'MANUAL',
          );
          return !reverseManualRate || rate.fromCurrency < rate.toCurrency;
        }
        return true; // Keep all non-manual rates
      });
    },
  });

  const updateExchangeRateMutation = useMutation({
    mutationFn: updateExchangeRateApi,
    onSuccess: (updatedRate) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EXCHANGE_RATES] });
      toast({
        title: 'Exchange rate updated successfully',
        description: `${updatedRate.fromCurrency}/${updatedRate.toCurrency} rate updated to ${updatedRate.rate}`,
        variant: 'success',
      });

      calculateHistoryMutation.mutate({
        accountIds: undefined,
        forceFullCalculation: true,
      });
    },
    onError: (error) => {
      toast({
        title: 'Uh oh! Something went wrong.',
        description: `There was a problem updating the exchange rate: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const updateExchangeRate = (rate: ExchangeRate) => {
    updateExchangeRateMutation.mutate(rate);
  };

  return {
    exchangeRates,
    isLoadingRates,
    updateExchangeRate,
  };
}
