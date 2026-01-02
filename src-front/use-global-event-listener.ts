// useGlobalEventListener.ts
import { updatePortfolio } from "@/commands/portfolio";
import { listenMarketSyncComplete } from "@/commands/portfolio-listener";
import { usePortfolioSyncOptional } from "@/context/portfolio-sync-context";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  listenMarketSyncStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenPortfolioUpdateStart,
} from "@/commands/portfolio-listener";
import { isDesktop, listenBrokerSyncComplete, listenDatabaseRestored, logger } from "@/adapters";

const TOAST_IDS = {
  marketSyncStart: "market-sync-start",
  portfolioUpdateStart: "portfolio-update-start",
  portfolioUpdateError: "portfolio-update-error",
} as const;

const useGlobalEventListener = () => {
  const queryClient = useQueryClient();
  const hasTriggeredInitialUpdate = useRef(false);
  const isDesktopEnv = isDesktop;
  const isMobileViewport = useIsMobileViewport();
  const syncContext = usePortfolioSyncOptional();

  // Use refs to avoid stale closures in event handlers
  const isMobileViewportRef = useRef(isMobileViewport);
  const syncContextRef = useRef(syncContext);
  const queryClientRef = useRef(queryClient);

  // Keep refs up to date
  useEffect(() => {
    isMobileViewportRef.current = isMobileViewport;
  }, [isMobileViewport]);

  useEffect(() => {
    syncContextRef.current = syncContext;
  }, [syncContext]);

  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  useEffect(() => {
    let isMounted = true;
    let cleanupFn: (() => void) | undefined;

    const handleMarketSyncStart = () => {
      if (isMobileViewportRef.current && syncContextRef.current) {
        syncContextRef.current.setMarketSyncing();
      } else {
        toast.loading("Syncing market data...", {
          id: TOAST_IDS.marketSyncStart,
          duration: 3000,
        });
      }
    };

    const handleMarketSyncComplete = (event: {
      payload: { failed_syncs: [string, string][] };
    }) => {
      const { failed_syncs } = event.payload || { failed_syncs: [] };

      if (isMobileViewportRef.current && syncContextRef.current) {
        syncContextRef.current.setIdle();
      } else {
        toast.dismiss(TOAST_IDS.marketSyncStart);
      }

      // Show error toast on both mobile and desktop for failed syncs
      if (failed_syncs && failed_syncs.length > 0) {
        const failedSymbols = failed_syncs.map(([symbol]) => symbol).join(", ");
        toast.error("Market Data Update Incomplete", {
          id: `market-sync-error-${failedSymbols || "unknown"}`,
          description: `Unable to update market data for: ${failedSymbols}. This may affect your portfolio calculations and analytics. Please try again later.`,
          duration: 15000,
        });
      }
    };

    const handlePortfolioUpdateStart = () => {
      if (isMobileViewportRef.current && syncContextRef.current) {
        syncContextRef.current.setPortfolioCalculating();
      } else {
        toast.loading("Calculating portfolio performance...", {
          id: TOAST_IDS.portfolioUpdateStart,
          duration: 2000,
        });
      }
    };

    const handlePortfolioUpdateError = (error: string) => {
      if (isMobileViewportRef.current && syncContextRef.current) {
        syncContextRef.current.setIdle();
      } else {
        toast.dismiss(TOAST_IDS.portfolioUpdateStart);
      }
      toast.error("Portfolio Update Failed", {
        id: TOAST_IDS.portfolioUpdateError,
        description:
          "There was an error updating your portfolio. Please try again or contact support if the issue persists.",
        duration: 5000,
      });
      logger.error("Portfolio Update Error: " + error);
    };

    const handlePortfolioUpdateComplete = () => {
      if (isMobileViewportRef.current && syncContextRef.current) {
        syncContextRef.current.setIdle();
      } else {
        toast.dismiss(TOAST_IDS.portfolioUpdateStart);
      }
      queryClientRef.current.invalidateQueries();
    };

    const handleDatabaseRestored = () => {
      queryClientRef.current.invalidateQueries();
      toast.success("Database restored successfully", {
        description: "Please restart the application to ensure all data is properly refreshed.",
      });
    };

    const handleBrokerSyncComplete = (event: {
      payload: { success: boolean; message: string; is_scheduled: boolean };
    }) => {
      const { success, message, is_scheduled } = event.payload || {
        success: false,
        message: "Unknown error",
        is_scheduled: false,
      };

      // Only show toast for scheduled (background) syncs
      // Manual syncs show their own toast via the mutation handler
      if (!is_scheduled) {
        return;
      }

      if (success) {
        toast.success("Background Sync Complete", {
          description: message,
          duration: 5000,
        });
      } else {
        toast.error("Background Sync Failed", {
          description: message,
          duration: 10000,
        });
      }
    };

    const setupListeners = async () => {
      const unlistenPortfolioSyncStart =
        await listenPortfolioUpdateStart(handlePortfolioUpdateStart);
      const unlistenPortfolioSyncComplete = await listenPortfolioUpdateComplete(
        handlePortfolioUpdateComplete,
      );
      const unlistenPortfolioSyncError = await listenPortfolioUpdateError((event) => {
        handlePortfolioUpdateError(event.payload as string);
      });
      const unlistenMarketStart = await listenMarketSyncStart(handleMarketSyncStart);
      const unlistenMarketComplete = await listenMarketSyncComplete(handleMarketSyncComplete);
      const unlistenDatabaseRestored = await listenDatabaseRestored(handleDatabaseRestored);
      const unlistenBrokerSyncComplete = await listenBrokerSyncComplete(handleBrokerSyncComplete);

      const cleanup = () => {
        unlistenPortfolioSyncStart();
        unlistenPortfolioSyncComplete();
        unlistenPortfolioSyncError();
        unlistenMarketStart();
        unlistenMarketComplete();
        unlistenDatabaseRestored();
        unlistenBrokerSyncComplete();
      };

      // If unmounted while setting up, clean up immediately
      if (!isMounted) {
        cleanup();
        return;
      }

      cleanupFn = cleanup;

      // Trigger initial portfolio update after listeners are set up
      if (!hasTriggeredInitialUpdate.current) {
        hasTriggeredInitialUpdate.current = true;
        logger.debug("Triggering initial portfolio update from frontend");

        // Trigger portfolio update
        updatePortfolio().catch((error) => {
          logger.error("Failed to trigger initial portfolio update: " + String(error));
        });
        // Note: Update check is now handled by useCheckUpdateOnStartup query in UpdateDialog
      }
    };

    setupListeners().catch((error) => {
      console.error("Failed to setup global event listeners:", error);
    });

    return () => {
      isMounted = false;
      cleanupFn?.();
    };
  }, [isDesktopEnv]); // Only re-run if isDesktopEnv changes (which it won't)

  return null;
};

export default useGlobalEventListener;
