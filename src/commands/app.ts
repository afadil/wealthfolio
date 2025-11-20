import { getRunEnv, invokeTauri, invokeWeb, logger, RUN_ENV } from "@/adapters";

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
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_app_info");
      case RUN_ENV.WEB:
        return invokeWeb("get_app_info");
      default:
        throw new Error("Unsupported environment");
    }
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
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP: {
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
      case RUN_ENV.WEB:
        return invokeWeb("check_update");
      default:
        return null;
    }
  } catch (error) {
    logger.error("Error checking for updates");
    console.error(error);
    return null;
  }
};
