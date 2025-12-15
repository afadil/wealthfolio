import { getRunEnv, invokeTauri, logger, RUN_ENV } from "@/adapters";
import type { Account, Platform } from "@/lib/types";

export interface SyncConnectionsResponse {
  synced: number;
  platforms_created: number;
  platforms_updated: number;
}

export interface SyncAccountsResponse {
  synced: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface SyncResult {
  success: boolean;
  message: string;
  connectionsSynced: SyncConnectionsResponse | null;
  accountsSynced: SyncAccountsResponse | null;
}

export interface BrokerConnectionBrokerage {
  id?: string;
  slug?: string;
  name?: string;
  displayName?: string;
  awsS3LogoUrl?: string;
  awsS3SquareLogoUrl?: string;
}

export interface BrokerConnection {
  id: string;
  brokerage?: BrokerConnectionBrokerage;
  disabled?: boolean;
  disabledDate?: string;
  updatedAt?: string;
}

export interface ConnectPortalResponse {
  redirectUri?: string;
}

const DESKTOP_ONLY_ERROR_MESSAGE =
  "Broker sync is not supported in web mode. Please use the desktop app.";

const assertDesktop = () => {
  if (getRunEnv() !== RUN_ENV.DESKTOP) {
    throw new Error(DESKTOP_ONLY_ERROR_MESSAGE);
  }
};

const invokeDesktop = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  assertDesktop();
  return invokeTauri<T>(command, payload);
};

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

