import { invoke, isDesktop, logger } from "@/adapters";

export interface AppInfo {
  version: string;
  dbPath: string;
  logsDir: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion: string;
  notes?: string;
  pubDate?: string;
  downloadUrl?: string;
}

export interface UpdateCheckPayload {
  currentVersion: string;
}

export const getAppInfo = async (): Promise<AppInfo> => {
  try {
    return await invoke("get_app_info");
  } catch (error) {
    logger.error("Error fetching app info");
    console.error(error);
    return {
      version: "",
      dbPath: "",
      logsDir: "",
    };
  }
};

export const checkForUpdates = async (
  payload?: UpdateCheckPayload,
): Promise<UpdateCheckResult | null> => {
  try {
    // Desktop uses the Tauri updater plugin directly
    if (isDesktop) {
      if (!payload?.currentVersion) {
        throw new Error("Current version is required for desktop update checks");
      }

      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        return {
          updateAvailable: false,
          latestVersion: payload.currentVersion,
        };
      }

      return {
        updateAvailable: true,
        latestVersion: update.version,
        notes: update.body ?? undefined,
      };
    }

    // Web uses the REST API
    return await invoke("check_update");
  } catch (error) {
    logger.error("Error checking for updates");
    console.error(error);
    return null;
  }
};
