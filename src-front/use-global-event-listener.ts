// useGlobalEventListener.ts
import {
  updatePortfolio,
  listenMarketSyncComplete,
  listenMarketSyncStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenPortfolioUpdateStart,
} from "@/adapters";
import { usePortfolioSyncOptional } from "@/context/portfolio-sync-context";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  isDesktop,
  listenBrokerSyncComplete,
  listenBrokerSyncError,
  listenDatabaseRestored,
  logger,
} from "@/adapters";

const TOAST_IDS = {
  marketSyncStart: "market-sync-start",
  portfolioUpdateStart: "portfolio-update-start",
  portfolioUpdateError: "portfolio-update-error",
  brokerSyncStart: "broker-sync-start",
} as const;

const useGlobalEventListener = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasTriggeredInitialUpdate = useRef(false);
  const isDesktopEnv = isDesktop;
  const isMobileViewport = useIsMobileViewport();
  const syncContext = usePortfolioSyncOptional();

  // Use refs to avoid stale closures in event handlers
  const isMobileViewportRef = useRef(isMobileViewport);
  const syncContextRef = useRef(syncContext);
  const queryClientRef = useRef(queryClient);
  const navigateRef = useRef(navigate);

  // Keep refs up to date
  useEffect(() => {
    isMobileViewportRef.current = isMobileViewport;
    syncContextRef.current = syncContext;
    queryClientRef.current = queryClient;
    navigateRef.current = navigate;
  });

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

    const handleMarketSyncComplete = (event: { payload: { failed_syncs: [string, string][] } }) => {
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
      payload: {
        success: boolean;
        message: string;
        accountsSynced?: { created: number; updated: number; skipped: number };
        activitiesSynced?: { activitiesUpserted: number; assetsInserted: number };
        holdingsSynced?: {
          accountsSynced: number;
          snapshotsUpserted: number;
          positionsUpserted: number;
          assetsInserted: number;
          newAssetIds: string[];
        };
        newAccounts?: {
          localAccountId: string;
          providerAccountId: string;
          defaultName: string;
          currency: string;
          institutionName?: string;
        }[];
      };
    }) => {
      const { success, message, accountsSynced, activitiesSynced, holdingsSynced, newAccounts } =
        event.payload || {
          success: false,
          message: "Unknown error",
        };

      // Dismiss the loading toast
      toast.dismiss(TOAST_IDS.brokerSyncStart);

      // Invalidate queries that could be affected by sync
      queryClientRef.current.invalidateQueries();

      if (success) {
        // Check if there are new accounts that need configuration
        if (newAccounts && newAccounts.length > 0) {
          toast.info("New accounts found", {
            description: `${newAccounts.length} new account(s) need to be configured`,
            action: {
              label: "Review",
              onClick: () => {
                navigateRef.current("/settings/accounts");
              },
            },
            duration: Infinity, // Don't auto-dismiss - user must act or dismiss manually
          });
        } else {
          // Build description with key numbers
          const accountsCreated = accountsSynced?.created ?? 0;
          const accountsUpdated = accountsSynced?.updated ?? 0;
          const activities = activitiesSynced?.activitiesUpserted ?? 0;
          const activityAssets = activitiesSynced?.assetsInserted ?? 0;
          const positions = holdingsSynced?.positionsUpserted ?? 0;
          const holdingsAccounts = holdingsSynced?.accountsSynced ?? 0;
          const holdingsAssets = holdingsSynced?.assetsInserted ?? 0;
          const totalNewAssets = activityAssets + holdingsAssets;

          const hasChanges =
            accountsCreated > 0 ||
            accountsUpdated > 0 ||
            activities > 0 ||
            totalNewAssets > 0 ||
            positions > 0;

          let description: string;
          if (hasChanges) {
            const parts: string[] = [];
            if (accountsCreated > 0) parts.push(`${accountsCreated} new accounts`);
            if (accountsUpdated > 0) parts.push(`${accountsUpdated} accounts updated`);
            if (activities > 0) parts.push(`${activities} activities`);
            if (positions > 0) parts.push(`${positions} positions (${holdingsAccounts} accounts)`);
            if (totalNewAssets > 0) parts.push(`${totalNewAssets} new assets`);
            description = parts.join(" · ");
          } else {
            description = "Everything is up to date";
          }

          toast.success("Broker Sync Complete", {
            description,
            duration: 5000,
          });
        }
      } else {
        toast.error("Broker Sync Failed", {
          description: message,
          duration: 10000,
        });
      }
    };

    const handleBrokerSyncError = (event: { payload: { error: string } }) => {
      const { error } = event.payload || { error: "Unknown error" };
      // Dismiss the loading toast
      toast.dismiss(TOAST_IDS.brokerSyncStart);
      toast.error("Broker Sync Failed", {
        description: error,
        duration: 10000,
      });
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
      const unlistenDatabaseRestored = await listenDatabaseRestored(handleDatabaseRestored);
      const unlistenBrokerSyncComplete = await listenBrokerSyncComplete(handleBrokerSyncComplete);
      const unlistenBrokerSyncError = await listenBrokerSyncError(handleBrokerSyncError);

      const cleanup = () => {
        unlistenPortfolioSyncStart();
        unlistenPortfolioSyncComplete();
        unlistenPortfolioSyncError();
        unlistenMarketStart();
        unlistenMarketComplete();
        unlistenDatabaseRestored();
        unlistenBrokerSyncComplete();
        unlistenBrokerSyncError();
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
