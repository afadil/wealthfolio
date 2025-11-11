import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";
import type { SwingTradePreferences, SwingActivity } from "@/pages/trading/types";

/**
 * Get swing trading preferences for the user
 */
export const getSwingPreferences = async (): Promise<SwingTradePreferences> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_swing_preferences");
      case RUN_ENV.WEB:
        return invokeWeb("get_swing_preferences");
      default:
        throw new Error(`Unsupported runtime environment`);
    }
  } catch (error) {
    logger.error("Error getting swing preferences.");
    throw error;
  }
};

/**
 * Save swing trading preferences
 */
export const saveSwingPreferences = async (
  preferences: SwingTradePreferences,
): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("save_swing_preferences", { preferences });
      case RUN_ENV.WEB:
        return invokeWeb("save_swing_preferences", { preferences });
      default:
        throw new Error(`Unsupported runtime environment`);
    }
  } catch (error) {
    logger.error("Error saving swing preferences.");
    throw error;
  }
};

/**
 * Get swing trading activities
 */
export const getSwingActivities = async (): Promise<SwingActivity[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_swing_activities");
      case RUN_ENV.WEB:
        return invokeWeb("get_swing_activities");
      default:
        throw new Error(`Unsupported runtime environment`);
    }
  } catch (error) {
    logger.error("Error getting swing activities.");
    throw error;
  }
};



/**
 * Export swing trading data to CSV/Excel
 */
export const exportSwingData = async (params: {
  format: "csv" | "xlsx";
  startDate?: string;
  endDate?: string;
}): Promise<string> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("export_swing_data", params);
      case RUN_ENV.WEB:
        return invokeWeb("export_swing_data", params);
      default:
        throw new Error(`Unsupported runtime environment`);
    }
  } catch (error) {
    logger.error("Error exporting swing data.");
    throw error;
  }
};
