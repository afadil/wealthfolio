import { useMutation } from '@tanstack/react-query';
import { syncMarketData } from '@/commands/market-data';
import { useToast } from '@/components/ui/use-toast';


export function useSyncMarketDataMutation() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (symbols: string[]) => {
      await syncMarketData(symbols, true);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to sync market data',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
