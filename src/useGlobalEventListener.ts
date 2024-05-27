// useGlobalEventListener.ts
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';

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
      const unlistenSyncStart = await listen('QUOTES_SYNC_START', handleQuoteSyncStart);
      const unlistenSyncComplete = await listen('QUOTES_SYNC_COMPLETE', handleQuotesSyncComplete);

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
