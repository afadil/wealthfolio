import { getRunEnv, invokeTauri, invokeWeb, logger, RUN_ENV } from "@/adapters";
import { Settings } from "@/lib/types";

export const getSettings = async (): Promise<Settings> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_settings");
      case RUN_ENV.WEB:
        return invokeWeb("get_settings");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (_error) {
    logger.error("Error fetching settings.");
    return {} as Settings;
  }
};

export const updateSettings = async (settingsUpdate: Partial<Settings>): Promise<Settings> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_settings", { settingsUpdate });
      case RUN_ENV.WEB:
        return invokeWeb("update_settings", { settingsUpdate });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating settings.");
    throw error;
  }
};

export const isAutoUpdateCheckEnabled = async (): Promise<boolean> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("is_auto_update_check_enabled");
      case RUN_ENV.WEB:
        return invokeWeb("is_auto_update_check_enabled");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (_error) {
    logger.error("Error checking auto-update setting.");
    return true; // Default to enabled
  }
};

export const backupDatabase = async (): Promise<{ filename: string; data: Uint8Array }> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP: {
        const result = await invokeTauri<[string, number[]]>("backup_database");
        const [filename, data] = result;
        return { filename, data: new Uint8Array(data) };
      }
      case RUN_ENV.WEB:
        return invokeWeb("backup_database");
      default:
        throw new Error(`Unsupported environment for database backup`);
    }
  } catch (error) {
    logger.error("Error backing up database.");
    throw error;
  }
};

export const backupDatabaseToPath = async (backupDir: string): Promise<string> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return await invokeTauri<string>("backup_database_to_path", { backupDir });
      case RUN_ENV.WEB:
        return invokeWeb("backup_database_to_path", { backupDir });
      default:
        throw new Error(`Unsupported environment for database backup`);
    }
  } catch (error) {
    logger.error("Error backing up database to path.");
    throw error;
  }
};

export const restoreDatabase = async (backupFilePath: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("restore_database", { backupFilePath });
        break;
      case RUN_ENV.WEB:
        await invokeWeb("restore_database", { backupFilePath });
        break;
      default:
        throw new Error(`Unsupported environment for database restore`);
    }
  } catch (error) {
    logger.error("Error restoring database.");
    throw error;
  }
};
