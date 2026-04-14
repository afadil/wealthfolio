// useGlobalEventListener.ts
import i18n from "@/i18n/i18n";
import {
  isDesktop,
  listenBrokerSyncComplete,
  listenBrokerSyncError,
  listenDatabaseRestored,
  listenMarketSyncComplete,
  listenMarketSyncError,
  listenMarketSyncStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenPortfolioUpdateStart,
  logger,
  updatePortfolio,
} from "@/adapters";
import { usePortfolioSyncOptional } from "@/context/portfolio-sync-context";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { QueryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const TOAST_IDS = {
  marketSyncStart: "market-sync-start",
  portfolioUpdateStart: "portfolio-update-start",
  portfolioUpdateError: "portfolio-update-error",

  brokerSyncStart: "broker-sync-start",
} as const;

const CLOUD_SYNC_INVALIDATION_EXCLUSIONS = new Set<string>([
  QueryKeys.BROKER_CONNECTIONS,
  QueryKeys.BROKER_ACCOUNTS,
  QueryKeys.BROKER_SYNC_STATES,
  QueryKeys.IMPORT_RUNS,
  QueryKeys.USER_INFO,
  QueryKeys.SUBSCRIPTION_PLANS,
  QueryKeys.SUBSCRIPTION_PLANS_PUBLIC,
  QueryKeys.SYNCED_ACCOUNTS,
  QueryKeys.PLATFORMS,
]);

function shouldInvalidateAfterPortfolioUpdate(queryKey: readonly unknown[]): boolean {
  const rootKey = queryKey[0];

  if (typeof rootKey === "string" && CLOUD_SYNC_INVALIDATION_EXCLUSIONS.has(rootKey)) {
    return false;
  }

  if (rootKey === "sync") {
    return false;
  }

  return true;
}

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
        toast.loading(i18n.t("toast.global.market_sync_loading"), {
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
        const count = failed_syncs.length;
        const priceFailKey =
          count === 1
            ? "toast.global.market_sync_price_failed_one"
            : "toast.global.market_sync_price_failed_other";
        toast.error(i18n.t(priceFailKey, { count }), {
          id: "market-sync-error",
          duration: 10000,
          action: {
            label: i18n.t("toast.global.action_view"),
            onClick: () => navigateRef.current("/health"),
          },
        });
      }
    };

    const handleMarketSyncError = (event: { payload: string }) => {
      const errorMsg = event.payload || "Unknown error";
      if (isMobileViewportRef.current && syncContextRef.current) {
        syncContextRef.current.setIdle();
      } else {
        toast.dismiss(TOAST_IDS.marketSyncStart);
      }
      toast.error(i18n.t("toast.global.market_data_failed_title"), {
        description: i18n.t("toast.global.market_data_failed_description", { error: errorMsg }),
        duration: 10000,
      });
      logger.error("Market sync error: " + errorMsg);
    };

    const handlePortfolioUpdateStart = () => {
      if (isMobileViewportRef.current && syncContextRef.current) {
        syncContextRef.current.setPortfolioCalculating();
      } else {
        toast.loading(i18n.t("toast.global.portfolio_loading"), {
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
      toast.error(i18n.t("toast.global.portfolio_failed_title"), {
        id: TOAST_IDS.portfolioUpdateError,
        description: i18n.t("toast.global.portfolio_failed_description"),
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
      queryClientRef.current.invalidateQueries({
        predicate: (query) => shouldInvalidateAfterPortfolioUpdate(query.queryKey),
      });
    };

    const handleDatabaseRestored = () => {
      queryClientRef.current.invalidateQueries();
      toast.success(i18n.t("toast.global.database_restored_title"), {
        description: i18n.t("toast.global.database_restored_description"),
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
          message: i18n.t("errors.unknown"),
        };

      // Dismiss the loading toast
      toast.dismiss(TOAST_IDS.brokerSyncStart);

      // Invalidate queries that could be affected by sync
      queryClientRef.current.invalidateQueries();

      if (success) {
        // Check if there are new accounts that need configuration
        if (newAccounts && newAccounts.length > 0) {
          toast.info(i18n.t("toast.global.broker_new_accounts_title"), {
            description: i18n.t("toast.global.broker_new_accounts_description", {
              count: newAccounts.length,
            }),
            action: {
              label: i18n.t("toast.global.action_review"),
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
            if (accountsCreated > 0) {
              parts.push(i18n.t("toast.global.broker_part_new_accounts", { count: accountsCreated }));
            }
            if (accountsUpdated > 0) {
              parts.push(
                i18n.t("toast.global.broker_part_accounts_updated", { count: accountsUpdated }),
              );
            }
            if (activities > 0) {
              parts.push(i18n.t("toast.global.broker_part_activities", { count: activities }));
            }
            if (positions > 0) {
              parts.push(
                i18n.t("toast.global.broker_part_positions", {
                  positions,
                  accounts: holdingsAccounts,
                }),
              );
            }
            if (totalNewAssets > 0) {
              parts.push(i18n.t("toast.global.broker_part_new_assets", { count: totalNewAssets }));
            }
            description = parts.join(" · ");
          } else {
            description = i18n.t("toast.global.broker_sync_up_to_date");
          }

          toast.success(i18n.t("toast.global.broker_sync_complete_title"), {
            description,
            duration: 5000,
          });
        }
      } else {
        toast.error(i18n.t("toast.global.broker_sync_failed_title"), {
          description: message,
          duration: 10000,
        });
      }
    };

    const handleBrokerSyncError = (event: { payload: { error: string } }) => {
      const { error } = event.payload || { error: "Unknown error" };
      // Dismiss the loading toast
      toast.dismiss(TOAST_IDS.brokerSyncStart);
      toast.error(i18n.t("toast.global.broker_sync_failed_title"), {
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
      const unlistenMarketError = await listenMarketSyncError(handleMarketSyncError);
      const unlistenDatabaseRestored = await listenDatabaseRestored(handleDatabaseRestored);
      const unlistenBrokerSyncComplete = await listenBrokerSyncComplete(handleBrokerSyncComplete);
      const unlistenBrokerSyncError = await listenBrokerSyncError(handleBrokerSyncError);

      const cleanup = () => {
        unlistenPortfolioSyncStart();
        unlistenPortfolioSyncComplete();
        unlistenPortfolioSyncError();
        unlistenMarketStart();
        unlistenMarketComplete();
        unlistenMarketError();

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
