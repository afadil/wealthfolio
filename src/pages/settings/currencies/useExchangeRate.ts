import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { ExchangeRate } from '@/lib/types';
import { getExchangeRates, updateExchangeRate } from '@/commands/exchange-rates';
import { QueryKeys } from '@/lib/query-keys';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';

export function useExchangeRates() {
  const queryClient = useQueryClient();
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Exchange rate updated and calculation triggered successfully.',
  });

  const { data: exchangeRates, isLoading } = useQuery<ExchangeRate[], Error>({
    queryKey: [QueryKeys.EXCHANGE_RATES],
    queryFn: getExchangeRates,
  });

  const updateExchangeRateMutation = useMutation({
    mutationFn: updateExchangeRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.EXCHANGE_RATES] });
      toast({ title: 'Exchange rate updated successfully', variant: 'success' });

      calculateHistoryMutation.mutate({
        accountIds: undefined,
        forceFullCalculation: true,
      });
    },
    onError: () => {
      toast({
        title: 'Uh oh! Something went wrong.',
        description: 'There was a problem updating the exchange rate.',
        variant: 'destructive',
      });
    },
  });

  return {
    exchangeRates,
    isLoading,
    updateExchangeRate: updateExchangeRateMutation.mutate,
  };
}
