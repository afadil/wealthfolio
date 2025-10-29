import { getRunEnv, invokeTauri, invokeWeb, logger, RUN_ENV } from "@/adapters";

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
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_sync_status");
      case RUN_ENV.WEB:
        return invokeWeb("get_sync_status");
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error fetching sync status.");
    throw error;
  }
};

export const generatePairingPayload = async (): Promise<string> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("generate_pairing_payload");
      case RUN_ENV.WEB:
        return invokeWeb("generate_pairing_payload");
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error generating pairing payload.");
    throw error;
  }
};

export const pairAndSync = async (payload: string): Promise<string> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("pair_and_sync", { payload });
      case RUN_ENV.WEB:
        return invokeWeb("pair_and_sync", { payload });
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error pairing and syncing with peer.");
    throw error;
  }
};

export const forceFullSyncWithPeer = async (payload: string): Promise<string> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("force_full_sync_with_peer", { payload });
      case RUN_ENV.WEB:
        return invokeWeb("force_full_sync_with_peer", { payload });
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error performing full sync with peer.");
    throw error;
  }
};

export const syncNow = async (args: SyncNowArgs): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("sync_now", { payload: args });
      case RUN_ENV.WEB:
        return invokeWeb("sync_now", { payload: args });
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error syncing with peer.");
    throw error;
  }
};

export const initializeSyncForExistingData = async (): Promise<string> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("initialize_sync_for_existing_data");
      case RUN_ENV.WEB:
        return invokeWeb("initialize_sync_for_existing_data");
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error initializing sync for existing data.");
    throw error;
  }
};

export const probeLocalNetworkAccess = async (host: string, port: number): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("probe_local_network_access", { host, port });
      case RUN_ENV.WEB:
        return invokeWeb("probe_local_network_access", { host, port });
      default:
        throw new Error("Unsupported environment");
    }
  } catch (error) {
    logger.error("Error probing local network access.");
    throw error;
  }
};
