// useGlobalEventListener.ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';

import {
  listenPortfolioUpdateStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
} from '@/commands/portfolio-listener';

const useGlobalEventListener = () => {
  const queryClient = useQueryClient();
  // Reference to store the toast object
  const updateToastRef = useRef<{
    id: string;
    dismiss: () => void;
    update: (props: any) => void;
  } | null>(null);

  useEffect(() => {
    const handlePortfolioUpdateStart = () => {
      // Store the toast object when creating the toast
      updateToastRef.current = toast({
        description: 'Updating Portfolio ...',
        variant: 'subtle',
      });
    };

    const handlePortfolioUpdateComplete = () => {
      if (updateToastRef.current) {
        updateToastRef.current.update({
          description: 'Portfolio Updated Successfully!',
          variant: 'subtle',
          duration: 2000,
        });
        updateToastRef.current = null;
      }

      queryClient.invalidateQueries();
    };

    const handlePortfolioUpdateError = (error: string) => {
      // Optionally dismiss the update toast when there's an error
      if (updateToastRef.current) {
        updateToastRef.current.dismiss();
        updateToastRef.current = null;
      }

      toast({
        title: 'Portfolio Update Error',
        description: error,
        duration: 5000,
        variant: 'destructive',
      });
    };

    const setupListeners = async () => {
      const unlistenSyncStart = await listenPortfolioUpdateStart(handlePortfolioUpdateStart);
      const unlistenSyncComplete = await listenPortfolioUpdateComplete(
        handlePortfolioUpdateComplete,
      );
      const unlistenSyncError = await listenPortfolioUpdateError((event) => {
        handlePortfolioUpdateError(event.payload as string);
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
