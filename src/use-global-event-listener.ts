// useGlobalEventListener.ts
import { listenMarketSyncComplete } from "@/commands/portfolio-listener";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import {
  listenMarketSyncStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenPortfolioUpdateStart,
} from "@/commands/portfolio-listener";
import { logger } from "./adapters";

const TOAST_IDS = {
  marketSyncStart: "market-sync-start",
  portfolioUpdateStart: "portfolio-update-start",
  portfolioUpdateError: "portfolio-update-error",
} as const;

function handleMarketSyncStart() {
  toast.loading("Syncing market data...", {
    id: TOAST_IDS.marketSyncStart,
    duration: 3000,
  });
}

function handleMarketSyncComplete(event: { payload: { failed_syncs: [string, string][] } }) {
  const { failed_syncs } = event.payload || { failed_syncs: [] };
  if (failed_syncs && failed_syncs.length > 0) {
    const failedSymbols = failed_syncs.map(([symbol]) => symbol).join(", ");
    toast.dismiss(TOAST_IDS.marketSyncStart);
    toast.error("Market Data Update Incomplete", {
      id: `market-sync-error-${failedSymbols || "unknown"}`,
      description: `Unable to update market data for: ${failedSymbols}. This may affect your portfolio calculations and analytics. Please try again later.`,
      duration: 15000,
    });
  } else {
    toast.dismiss(TOAST_IDS.marketSyncStart);
  }
}

const handlePortfolioUpdateStart = () => {
  toast.loading("Calculating portfolio performance...", {
    id: TOAST_IDS.portfolioUpdateStart,
    duration: 2000,
  });
};

const handlePortfolioUpdateError = (error: string) => {
  toast.dismiss(TOAST_IDS.portfolioUpdateStart);
  toast.error("Portfolio Update Failed", {
    id: TOAST_IDS.portfolioUpdateError,
    description:
      "There was an error updating your portfolio. Please try again or contact support if the issue persists.",
    duration: 5000,
  });
  logger.error("Portfolio Update Error: " + error);
};

const useGlobalEventListener = () => {
  const queryClient = useQueryClient();

  const handlePortfolioUpdateComplete = useCallback(() => {
    toast.dismiss(TOAST_IDS.portfolioUpdateStart);
    queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    let actualCleanup = () => {
      return;
    };

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
        console.error("Failed to setup global event listeners:", error);
      });

    return () => {
      actualCleanup();
    };
  }, [handlePortfolioUpdateComplete]);

  return null;
};

export default useGlobalEventListener;
