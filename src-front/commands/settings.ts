import { invoke, isDesktop, logger } from "@/adapters";
import { Settings } from "@/lib/types";

export const getSettings = async (): Promise<Settings> => {
  try {
    return await invoke("get_settings");
  } catch (_error) {
    logger.error("Error fetching settings.");
    return {} as Settings;
  }
};

export const updateSettings = async (settingsUpdate: Partial<Settings>): Promise<Settings> => {
  try {
    return await invoke("update_settings", { settingsUpdate });
  } catch (error) {
    logger.error("Error updating settings.");
    throw error;
  }
};

export const isAutoUpdateCheckEnabled = async (): Promise<boolean> => {
  try {
    return await invoke("is_auto_update_check_enabled");
  } catch (_error) {
    logger.error("Error checking auto-update setting.");
    return true; // Default to enabled
  }
};

export const backupDatabase = async (): Promise<{ filename: string; data: Uint8Array }> => {
  try {
    // Desktop (Tauri) returns a tuple [filename, data[]], web returns { filename, data }
    if (isDesktop) {
      const result = await invoke<[string, number[]]>("backup_database");
      const [filename, data] = result;
      return { filename, data: new Uint8Array(data) };
    }
    return await invoke("backup_database");
  } catch (error) {
    logger.error("Error backing up database.");
    throw error;
  }
};

export const backupDatabaseToPath = async (backupDir: string): Promise<string> => {
  try {
    return await invoke<string>("backup_database_to_path", { backupDir });
  } catch (error) {
    logger.error("Error backing up database to path.");
    throw error;
  }
};

export const restoreDatabase = async (backupFilePath: string): Promise<void> => {
  try {
    await invoke("restore_database", { backupFilePath });
  } catch (error) {
    logger.error("Error restoring database.");
    throw error;
  }
};
