import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { ExchangeRate } from '@/lib/types';
import {
  getExchangeRateSymbols,
  updateExchangeRate as updateExchangeRateApi,
} from '@/commands/exchange-rates';
import { QueryKeys } from '@/lib/query-keys';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';

export function useExchangeRates() {
  const queryClient = useQueryClient();
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Exchange rate updated and calculation triggered successfully.',
  });

  const { data: exchangeRateSymbols, isLoading: isLoadingSymbols } = useQuery<
    ExchangeRate[],
    Error
  >({
    queryKey: [QueryKeys.EXCHANGE_RATE_SYMBOLS],
    queryFn: getExchangeRateSymbols,
  });

  const updateExchangeRateMutation = useMutation({
    mutationFn: updateExchangeRateApi,
    onSuccess: (updatedRate) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EXCHANGE_RATE_SYMBOLS] });
      queryClient.invalidateQueries({
        queryKey: [QueryKeys.QUOTE, `${updatedRate.fromCurrency}${updatedRate.toCurrency}=X`],
      });
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
    exchangeRateSymbols,
    isLoadingSymbols,
    updateExchangeRate,
  };
}
