// useGlobalEventListener.ts
import { updatePortfolio } from "@/commands/portfolio";
import { listenMarketSyncComplete } from "@/commands/portfolio-listener";
import { usePortfolioSyncOptional } from "@/context/portfolio-sync-context";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  listenMarketSyncStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenPortfolioUpdateStart,
} from "@/commands/portfolio-listener";
import { getRunEnv, listenDatabaseRestoredTauri, logger, RUN_ENV } from "./adapters";

const TOAST_IDS = {
  marketSyncStart: "market-sync-start",
  portfolioUpdateStart: "portfolio-update-start",
  portfolioUpdateError: "portfolio-update-error",
} as const;

const useGlobalEventListener = () => {
  const queryClient = useQueryClient();
  const hasTriggeredInitialUpdate = useRef(false);
  const isDesktop = getRunEnv() === RUN_ENV.DESKTOP;
  const isMobileViewport = useIsMobileViewport();
  const syncContext = usePortfolioSyncOptional();

  // Mobile-aware handlers
  const handleMarketSyncStart = useCallback(() => {
    if (isMobileViewport && syncContext) {
      syncContext.setMarketSyncing();
    } else {
      toast.loading("Syncing market data...", {
        id: TOAST_IDS.marketSyncStart,
        duration: 3000,
      });
    }
  }, [isMobileViewport, syncContext]);

  const handleMarketSyncComplete = useCallback(
    (event: { payload: { failed_syncs: [string, string][] } }) => {
      const { failed_syncs } = event.payload || { failed_syncs: [] };

      if (isMobileViewport && syncContext) {
        syncContext.setIdle();
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
    },
    [isMobileViewport, syncContext],
  );

  const handlePortfolioUpdateStart = useCallback(() => {
    if (isMobileViewport && syncContext) {
      syncContext.setPortfolioCalculating();
    } else {
      toast.loading("Calculating portfolio performance...", {
        id: TOAST_IDS.portfolioUpdateStart,
        duration: 2000,
      });
    }
  }, [isMobileViewport, syncContext]);

  const handlePortfolioUpdateError = useCallback(
    (error: string) => {
      if (isMobileViewport && syncContext) {
        syncContext.setIdle();
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
    },
    [isMobileViewport, syncContext],
  );

  const handlePortfolioUpdateComplete = useCallback(() => {
    if (isMobileViewport && syncContext) {
      syncContext.setIdle();
    } else {
      toast.dismiss(TOAST_IDS.portfolioUpdateStart);
    }
    queryClient.invalidateQueries();
  }, [queryClient, isMobileViewport, syncContext]);

  const handleDatabaseRestored = useCallback(() => {
    queryClient.invalidateQueries();
    toast.success("Database restored successfully", {
      description: "Please restart the application to ensure all data is properly refreshed.",
    });
  }, [queryClient]);

  useEffect(() => {
    let isMounted = true;
    let cleanupFn: (() => void) | undefined;

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
      const unlistenDatabaseRestored = isDesktop
        ? await listenDatabaseRestoredTauri(handleDatabaseRestored)
        : undefined;

      const cleanup = () => {
        unlistenPortfolioSyncStart();
        unlistenPortfolioSyncComplete();
        unlistenPortfolioSyncError();
        unlistenMarketStart();
        unlistenMarketComplete();
        unlistenDatabaseRestored?.();
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
  }, [
    handlePortfolioUpdateComplete,
    handlePortfolioUpdateStart,
    handlePortfolioUpdateError,
    handleMarketSyncStart,
    handleMarketSyncComplete,
    handleDatabaseRestored,
    isDesktop,
  ]);

  return null;
};

export default useGlobalEventListener;
