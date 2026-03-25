import { invokeTauri, logger } from "@/adapters";
import { Settings } from "@/lib/types";

export const getSettings = async (): Promise<Settings> => {
  try {
    return invokeTauri("get_settings");
  } catch (error) {
    logger.error(
      `Error fetching settings: ${error instanceof Error ? error.message : String(error)}`,
    );
    // Return default settings instead of empty object
    return {
      theme: "dark",
      themeColor: "default",
      font: "font-mono",
      baseCurrency: "",
      language: "en",
      onboardingCompleted: false,
      autoUpdateCheckEnabled: true,
      menuBarVisible: true,
      isPro: false,
      syncEnabled: true,
    };
  }
};

export const updateSettings = async (settingsUpdate: Partial<Settings>): Promise<Settings> => {
  try {
    return invokeTauri("update_settings", { settingsUpdate });
  } catch (error) {
    logger.error("Error updating settings.");
    throw error;
  }
};

export const isAutoUpdateCheckEnabled = async (): Promise<boolean> => {
  try {
    return invokeTauri("is_auto_update_check_enabled");
  } catch (_error) {
    logger.error("Error checking auto-update setting.");
    return true; // Default to enabled
  }
};

export const backupDatabase = async (): Promise<{ filename: string; data: Uint8Array }> => {
  try {
    const result = await invokeTauri<[string, number[]]>("backup_database");
    const [filename, data] = result;
    return { filename, data: new Uint8Array(data) };
  } catch (error) {
    logger.error("Error backing up database.");
    throw error;
  }
};

export const backupDatabaseToPath = async (backupDir: string): Promise<string> => {
  try {
    return await invokeTauri<string>("backup_database_to_path", { backupDir });
  } catch (error) {
    logger.error("Error backing up database to path.");
    throw error;
  }
};

export const restoreDatabase = async (backupFilePath: string): Promise<void> => {
  try {
    await invokeTauri("restore_database", { backupFilePath });
  } catch (error) {
    logger.error("Error restoring database.");
    throw error;
  }
};
