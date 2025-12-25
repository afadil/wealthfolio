import { invoke, logger } from "@/adapters";

/**
 * Store Wealthfolio Connect tokens in the backend's encrypted secret store.
 * The backend uses the refresh token to mint fresh access tokens when needed.
 * Works in both desktop (Tauri) and web modes.
 */
export const storeSyncSession = async (
  refreshToken: string,
  accessToken?: string,
): Promise<void> => {
  try {
    await invoke("store_sync_session", { refreshToken, accessToken });
    logger.info("Sync session stored in backend");
  } catch (error) {
    logger.error("Error storing sync session in backend");
    throw error;
  }
};

/**
 * Clear Wealthfolio Connect session from the backend's secret store.
 * Works in both desktop (Tauri) and web modes.
 */
export const clearSyncSession = async (): Promise<void> => {
  try {
    await invoke("clear_sync_session");
    logger.info("Sync session cleared from backend");
  } catch (error) {
    logger.error("Error clearing sync session from backend");
    throw error;
  }
};
