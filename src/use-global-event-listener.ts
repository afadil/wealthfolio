// useGlobalEventListener.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { listenMarketSyncComplete } from '@/commands/portfolio-listener';

import {
  listenPortfolioUpdateStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenMarketSyncStart,
} from '@/commands/portfolio-listener';
import { logger } from './adapters';

function handleMarketSyncStart() {
  toast({
    description: 'Syncing market data...',
    duration: 3000,
    variant: 'subtle',
  });
}

function handleMarketSyncComplete(event: { payload: { failed_syncs: [string, string][] } }) {
  const { failed_syncs } = event.payload || { failed_syncs: [] };
  if (failed_syncs && failed_syncs.length > 0) {
    const failedSymbols = failed_syncs.map(([symbol]) => symbol).join(', ');
    toast({
      title: '🔴 Market Data Update Incomplete',
      description: `Unable to update market data for: ${failedSymbols}. This may affect your portfolio calculations and analytics. Please try again later.`,
      duration: 15000,
      variant: 'destructive',
    });
  } 
}

const handlePortfolioUpdateStart = () => {
  toast({
    description: 'Calculating portfolio performance...',
    duration: 15000,
    variant: 'subtle',
  });
};

const handlePortfolioUpdateError = (error: string) => {
  toast({
    title: 'Portfolio Update Failed',
    description: '🔴 There was an error updating your portfolio. Please try again or contact support if the issue persists.',
    duration: 5000,
    variant: 'destructive',
  });
  logger.error('Portfolio Update Error: ' + error);
};

const useGlobalEventListener = () => {
  const queryClient = useQueryClient();

  const handlePortfolioUpdateComplete = () => {
    queryClient.invalidateQueries();
    toast({
      description: 'Portfolio Updated Successfully!',
      variant: 'subtle',
      duration: 2000,
    });
  };

  useEffect(() => {
    let actualCleanup = () => {};

    const setupListeners = async () => {
      const unlistenPortfolioSyncStart = await listenPortfolioUpdateStart(
        handlePortfolioUpdateStart,
      );
      const unlistenPortfolioSyncComplete = await listenPortfolioUpdateComplete(
        handlePortfolioUpdateComplete,
      );
      const unlistenPortfolioSyncError = await listenPortfolioUpdateError((event) => {
        handlePortfolioUpdateError(event.payload as string);
      });
      const unlistenMarketStart = await listenMarketSyncStart(handleMarketSyncStart);
      const unlistenMarketComplete = await listenMarketSyncComplete(handleMarketSyncComplete);

      return () => {
        unlistenPortfolioSyncStart();
        unlistenPortfolioSyncComplete();
        unlistenPortfolioSyncError();
        unlistenMarketStart();
        unlistenMarketComplete();
      };
    };

    setupListeners()
      .then((cleanupFromAsync) => {
        actualCleanup = cleanupFromAsync;
      })
      .catch((error) => {
        console.error('Failed to setup global event listeners:', error);
      });

    return () => {
      actualCleanup();
    };
  }, []);

  return null;
};

export default useGlobalEventListener;
