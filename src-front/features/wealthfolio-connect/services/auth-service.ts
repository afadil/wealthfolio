import {
  logger,
  storeSyncSession as storeSyncSessionApi,
  clearSyncSession as clearSyncSessionApi,
} from "@/adapters";

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
    await storeSyncSessionApi(refreshToken, accessToken);
    logger.debug("Sync session stored in backend");
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
    await clearSyncSessionApi();
    logger.debug("Sync session cleared from backend");
  } catch (error) {
    logger.error("Error clearing sync session from backend");
    throw error;
  }
};
