import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refreshQuotesForSymbols } from '@/commands/market-data';
import { useToast } from '@/components/ui/use-toast';
import { QueryKeys } from '@/lib/query-keys';

interface UseRefreshQuotesMutationProps {
  successTitle?: string;
  errorTitle?: string;
}

export function useRefreshQuotesMutation({
  successTitle = 'Quotes refreshed successfully',
  errorTitle = 'Failed to refresh quotes',
}: UseRefreshQuotesMutationProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (symbols: string[]) => {
      await refreshQuotesForSymbols(symbols);
    },
    onSuccess: () => {
      toast({
        title: successTitle,
      });
      // Invalidate queries that depend on quotes data
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HISTORY] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA] });
    },
    onError: (error: Error) => {
      toast({
        title: errorTitle,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
