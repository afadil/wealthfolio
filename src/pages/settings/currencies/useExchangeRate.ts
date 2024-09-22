import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { ExchangeRate } from '@/lib/types';
import {
  getExchangeRates,
  updateExchangeRate as updateExchangeRateApi,
} from '@/commands/exchange-rates';
import { QueryKeys } from '@/lib/query-keys';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';

export function useExchangeRates() {
  const queryClient = useQueryClient();
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Exchange rate updated and calculation triggered successfully.',
  });

  const { data: exchangeRates, isLoading: isLoadingRates } = useQuery<ExchangeRate[], Error>({
    queryKey: [QueryKeys.EXCHANGE_RATES],
    queryFn: getExchangeRates,
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
