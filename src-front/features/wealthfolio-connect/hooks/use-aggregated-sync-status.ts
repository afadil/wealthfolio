import { useMemo } from "react";
import { useWealthfolioConnect } from "../providers/wealthfolio-connect-provider";
import { useSyncStates } from "./use-sync-states";
import type { AggregatedSyncStatus, BrokerSyncState } from "../types";

/**
 * Determines the aggregated sync status from individual broker sync states.
 * Priority: running > needs_review > failed > idle
 */
function determineAggregatedStatus(
  isConnected: boolean,
  hasSubscription: boolean,
  syncStates: BrokerSyncState[],
): AggregatedSyncStatus {
  if (!isConnected || !hasSubscription) {
    return "not_connected";
  }

  if (syncStates.length === 0) {
    return "idle";
  }

  // Check for running state first (highest priority)
  if (syncStates.some((s) => s.syncStatus === "RUNNING")) {
    return "running";
  }

  // Check for needs_review state
  if (syncStates.some((s) => s.syncStatus === "NEEDS_REVIEW")) {
    return "needs_review";
  }

  // Check for failed state
  if (syncStates.some((s) => s.syncStatus === "FAILED")) {
    return "failed";
  }

  return "idle";
}

export function useAggregatedSyncStatus() {
  const { isConnected, userInfo, isEnabled } = useWealthfolioConnect();
  const { data: syncStates = [], isLoading } = useSyncStates();

  // Determine if user has an active subscription
  const hasSubscription = useMemo(() => {
    if (!userInfo?.team) return false;
    const status = userInfo.team.subscriptionStatus;
    return status === "active" || status === "trialing";
  }, [userInfo]);

  const status = useMemo<AggregatedSyncStatus>(() => {
    if (!isEnabled) return "not_connected";
    return determineAggregatedStatus(isConnected, hasSubscription, syncStates);
  }, [isEnabled, isConnected, hasSubscription, syncStates]);

  // Find the last successful sync time across all states
  const lastSyncTime = useMemo(() => {
    if (syncStates.length === 0) return null;

    const successfulSyncs = syncStates
      .filter((s) => s.lastSuccessfulAt)
      .map((s) => new Date(s.lastSuccessfulAt!).getTime());

    if (successfulSyncs.length === 0) return null;

    return new Date(Math.max(...successfulSyncs)).toISOString();
  }, [syncStates]);

  // Check if there are any warnings or errors
  const hasIssues = status === "needs_review" || status === "failed";

  // Count of accounts with issues
  const issueCount = useMemo(() => {
    return syncStates.filter(
      (s) => s.syncStatus === "NEEDS_REVIEW" || s.syncStatus === "FAILED",
    ).length;
  }, [syncStates]);

  return {
    status,
    isLoading,
    isConnected,
    hasSubscription,
    lastSyncTime,
    hasIssues,
    issueCount,
    syncStates,
  };
}
