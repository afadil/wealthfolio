import { invokeTauri, logger } from "@/adapters";
import type { SwingTradePreferences, SwingActivity } from "@/pages/trading/types";

/**
 * Get swing trading preferences for the user
 */
export const getSwingPreferences = async (): Promise<SwingTradePreferences> => {
  try {
    return invokeTauri("get_swing_preferences");
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
    return invokeTauri("save_swing_preferences", { preferences });
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
    return invokeTauri("get_swing_activities");
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
    return invokeTauri("export_swing_data", params);
  } catch (error) {
    logger.error("Error exporting swing data.");
    throw error;
  }
};
