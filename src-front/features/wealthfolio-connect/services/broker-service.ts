// Broker Service
// API commands for broker connections, sync, subscriptions, and user info
// ========================================================================

import {
  logger,
  syncBrokerData as syncBrokerDataAdapter,
  getSyncedAccounts as getSyncedAccountsAdapter,
  getPlatforms as getPlatformsAdapter,
  listBrokerConnections as listBrokerConnectionsAdapter,
  listBrokerAccounts as listBrokerAccountsAdapter,
  getSubscriptionPlans as getSubscriptionPlansAdapter,
  getSubscriptionPlansPublic as getSubscriptionPlansPublicAdapter,
  getUserInfo as getUserInfoAdapter,
  getBrokerSyncStates as getBrokerSyncStatesAdapter,
  getImportRuns as getImportRunsAdapter,
} from "@/adapters";
import type { Account, Platform } from "@/lib/types";
import type {
  BrokerConnection,
  BrokerAccount,
  PlansResponse,
  UserInfo,
  BrokerSyncState,
  ImportRun,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Broker Sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync broker data from the cloud to the local database.
 * Works on both desktop (Tauri) and web platforms:
 * - Triggers sync via command (returns immediately)
 * - Global event listener handles toast notifications via SSE events
 */
export const syncBrokerData = async (): Promise<void> => {
  await syncBrokerDataAdapter();
};

export const getSyncedAccounts = async (): Promise<Account[]> => {
  try {
    return await getSyncedAccountsAdapter<Account>();
  } catch (error) {
    logger.error("Error getting synced accounts.");
    throw error;
  }
};

export const getPlatforms = async (): Promise<Platform[]> => {
  try {
    return await getPlatformsAdapter<Platform>();
  } catch (error) {
    logger.error("Error getting platforms.");
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Broker Connections
// ─────────────────────────────────────────────────────────────────────────────

export const listBrokerConnections = async (): Promise<BrokerConnection[]> => {
  try {
    return await listBrokerConnectionsAdapter<BrokerConnection>();
  } catch (error) {
    logger.error("Error listing broker connections.");
    throw error;
  }
};

export const listBrokerAccounts = async (): Promise<BrokerAccount[]> => {
  try {
    return await listBrokerAccountsAdapter<BrokerAccount>();
  } catch (error) {
    logger.error("Error listing broker accounts.");
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Plans
// ─────────────────────────────────────────────────────────────────────────────

export const getSubscriptionPlans = async (): Promise<PlansResponse> => {
  try {
    return await getSubscriptionPlansAdapter<PlansResponse>();
  } catch (error) {
    logger.error(`Error getting subscription plans: ${error}`);
    throw error;
  }
};

export const getSubscriptionPlansPublic = async (): Promise<PlansResponse> => {
  try {
    return await getSubscriptionPlansPublicAdapter<PlansResponse>();
  } catch (error) {
    logger.error(`Error getting subscription plans (public): ${error}`);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// User Info
// ─────────────────────────────────────────────────────────────────────────────

export const getUserInfo = async (): Promise<UserInfo> => {
  try {
    return await getUserInfoAdapter<UserInfo>();
  } catch (error) {
    logger.error(`Error getting user info: ${error}`);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sync State & Import Runs
// ─────────────────────────────────────────────────────────────────────────────

export const getBrokerSyncStates = async (): Promise<BrokerSyncState[]> => {
  try {
    return await getBrokerSyncStatesAdapter<BrokerSyncState>();
  } catch (error) {
    logger.error("Error getting broker sync states.");
    throw error;
  }
};

export const getImportRuns = async (
  runType?: string,
  limit?: number,
  offset?: number,
): Promise<ImportRun[]> => {
  try {
    return await getImportRunsAdapter<ImportRun>({ runType, limit, offset });
  } catch (error) {
    logger.error("Error getting import runs.");
    throw error;
  }
};
