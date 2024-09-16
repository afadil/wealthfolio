// useGlobalEventListener.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { listenQuotesSyncComplete, listenQuotesSyncStart } from '@/commands/quote-listener';

const useGlobalEventListener = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleQuoteSyncStart = () => {
      toast({
        title: 'Updating Market Data',
        description: 'Fetching the latest market prices. This may take a moment.',
        duration: 5000,
      });
    };

    const handleQuotesSyncComplete = () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio_history'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['account_history', 'TOTAL'] });
      toast({
        title: 'Portfolio Update Complete',
        description: 'Your portfolio has been refreshed with the latest market data.',
        duration: 5000,
      });
    };
    const setupListeners = async () => {
      const unlistenSyncStart = await listenQuotesSyncStart(handleQuoteSyncStart);
      const unlistenSyncComplete = await listenQuotesSyncComplete(handleQuotesSyncComplete);

      return () => {
        unlistenSyncStart();
        unlistenSyncComplete();
      };
    };

    setupListeners().then((cleanup) => {
      return cleanup;
    });
  }, [queryClient]);

  return null; // Assuming this hook doesn't need to return anything
};

export default useGlobalEventListener;
