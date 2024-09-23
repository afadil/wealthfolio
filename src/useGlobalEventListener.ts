// useGlobalEventListener.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import {
  listenQuotesSyncComplete,
  listenQuotesSyncStart,
  listenQuotesSyncError,
} from '@/commands/quote-listener';

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
      queryClient.invalidateQueries();
      toast({
        title: 'Portfolio Update Complete',
        description: 'Your portfolio has been refreshed with the latest market data.',
        duration: 5000,
      });
    };

    const handleQuotesSyncError = (error: string) => {
      toast({
        title: 'Portfolio Update Error',
        description: error,
        duration: 5000,
        variant: 'destructive',
      });
    };
    const setupListeners = async () => {
      const unlistenSyncStart = await listenQuotesSyncStart(handleQuoteSyncStart);
      const unlistenSyncComplete = await listenQuotesSyncComplete(handleQuotesSyncComplete);
      const unlistenSyncError = await listenQuotesSyncError((event) => {
        handleQuotesSyncError(event.payload as string);
      });

      return () => {
        unlistenSyncStart();
        unlistenSyncComplete();
        unlistenSyncError();
      };
    };

    setupListeners().then((cleanup) => {
      return cleanup;
    });
  }, [queryClient]);

  return null;
};

export default useGlobalEventListener;
