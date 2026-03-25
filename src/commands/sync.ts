import { invokeTauri, logger } from "@/adapters";

export interface PeerInfo {
  id: string;
  name: string;
  address: string;
  paired: boolean;
  last_seen?: string;
  last_sync?: string;
  fingerprint: string;
  listen_endpoints: string[];
}

export interface SyncStatus {
  device_id: string;
  device_name: string;
  server_running: boolean;
  peers: PeerInfo[];
}

export interface SyncNowArgs {
  peer_id: string;
}

export const getSyncStatus = async (): Promise<SyncStatus> => {
  try {
    return invokeTauri("get_sync_status");
  } catch (error) {
    logger.error("Error fetching sync status.");
    throw error;
  }
};

export const generatePairingPayload = async (): Promise<string> => {
  try {
    return invokeTauri("generate_pairing_payload");
  } catch (error) {
    logger.error("Error generating pairing payload.");
    throw error;
  }
};

export const pairAndSync = async (payload: string): Promise<string> => {
  try {
    return invokeTauri("pair_and_sync", { payload });
  } catch (error) {
    logger.error("Error pairing and syncing with peer.");
    throw error;
  }
};

export const forceFullSyncWithPeer = async (payload: string): Promise<string> => {
  try {
    return invokeTauri("force_full_sync_with_peer", { payload });
  } catch (error) {
    logger.error("Error performing full sync with peer.");
    throw error;
  }
};

export const syncNow = async (args: SyncNowArgs): Promise<void> => {
  try {
    return invokeTauri("sync_now", { payload: args });
  } catch (error) {
    logger.error("Error syncing with peer.");
    throw error;
  }
};

export const initializeSyncForExistingData = async (): Promise<string> => {
  try {
    return invokeTauri("initialize_sync_for_existing_data");
  } catch (error) {
    logger.error("Error initializing sync for existing data.");
    throw error;
  }
};

export const probeLocalNetworkAccess = async (host: string, port: number): Promise<void> => {
  try {
    return invokeTauri("probe_local_network_access", { host, port });
  } catch (error) {
    logger.error("Error probing local network access.");
    throw error;
  }
};
