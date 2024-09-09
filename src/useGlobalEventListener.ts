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
        title: 'Syncing quotes...',
        description: 'Please wait while we sync your quotes',
      });
    };

    const handleQuotesSyncComplete = () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio_history'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      toast({
        title: 'Quotes synced successfully',
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
