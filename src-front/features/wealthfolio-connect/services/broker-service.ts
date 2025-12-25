// Broker Service
// API commands for broker connections, sync, subscriptions, and user info
// ========================================================================

import { invoke, isDesktop, logger } from "@/adapters";
import type { Account, Platform } from "@/lib/types";
import type {
  SyncResult,
  BrokerConnection,
  ConnectPortalResponse,
  PlansResponse,
  UserInfo,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DESKTOP_ONLY_ERROR_MESSAGE =
  "Broker sync is not supported in web mode. Please use the desktop app.";

const assertDesktop = () => {
  if (!isDesktop) {
    throw new Error(DESKTOP_ONLY_ERROR_MESSAGE);
  }
};

const invokeDesktop = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  assertDesktop();
  return invoke<T>(command, payload);
};

// ─────────────────────────────────────────────────────────────────────────────
// Broker Sync
// ─────────────────────────────────────────────────────────────────────────────

export const syncBrokerData = async (): Promise<SyncResult> => {
  try {
    return await invokeDesktop("sync_broker_data");
  } catch (error) {
    logger.error("Error syncing broker data.");
    throw error;
  }
};

export const getSyncedAccounts = async (): Promise<Account[]> => {
  try {
    return await invokeDesktop("get_synced_accounts");
  } catch (error) {
    logger.error("Error getting synced accounts.");
    throw error;
  }
};

export const getPlatforms = async (): Promise<Platform[]> => {
  try {
    return await invokeDesktop("get_platforms");
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
    return await invokeDesktop("list_broker_connections");
  } catch (error) {
    logger.error("Error listing broker connections.");
    throw error;
  }
};

export const removeBrokerConnection = async (authorizationId: string): Promise<void> => {
  try {
    await invokeDesktop<void>("remove_broker_connection", { authorizationId });
  } catch (error) {
    logger.error("Error removing broker connection.");
    throw error;
  }
};

export const getConnectPortalUrl = async (
  reconnectAuthorizationId?: string,
  redirectUrl?: string,
): Promise<ConnectPortalResponse> => {
  try {
    return await invokeDesktop("get_connect_portal_url", { reconnectAuthorizationId, redirectUrl });
  } catch (error) {
    logger.error("Error getting connect portal URL.");
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Plans
// ─────────────────────────────────────────────────────────────────────────────

export const getSubscriptionPlans = async (): Promise<PlansResponse> => {
  try {
    return await invoke("get_subscription_plans");
  } catch (error) {
    logger.error(`Error getting subscription plans: ${error}`);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// User Info
// ─────────────────────────────────────────────────────────────────────────────

export const getUserInfo = async (): Promise<UserInfo> => {
  try {
    return await invoke("get_user_info");
  } catch (error) {
    logger.error(`Error getting user info: ${error}`);
    throw error;
  }
};
