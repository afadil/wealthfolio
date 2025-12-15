import { getRunEnv, invokeTauri, logger, RUN_ENV } from "@/adapters";

const DESKTOP_ONLY_ERROR_MESSAGE =
  "Wealthfolio Sync secure session storage is only available in the desktop app.";

const assertDesktop = () => {
  if (getRunEnv() !== RUN_ENV.DESKTOP) {
    throw new Error(DESKTOP_ONLY_ERROR_MESSAGE);
  }
};

export const storeSyncSession = async (
  accessToken: string,
  refreshToken?: string,
): Promise<void> => {
  try {
    assertDesktop();
    return invokeTauri("store_sync_session", { accessToken, refreshToken });
  } catch (error) {
    logger.error("Error storing sync session.");
    throw error;
  }
};

export const clearSyncSession = async (): Promise<void> => {
  try {
    assertDesktop();
    return invokeTauri("clear_sync_session");
  } catch (error) {
    logger.error("Error clearing sync session.");
    throw error;
  }
};
