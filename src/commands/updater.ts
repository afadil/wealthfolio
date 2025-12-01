import { getRunEnv, invokeTauri, invokeWeb, RUN_ENV } from "@/adapters";
import type { UpdateInfo } from "@/lib/types";

/** Web API response shape */
interface WebUpdateCheckResponse {
  updateAvailable: boolean;
  latestVersion: string;
  notes?: string;
  pubDate?: string;
  downloadUrl?: string;
  changelogUrl?: string;
  screenshots?: string[];
}

/**
 * Check for updates. Returns update info if available, null if up-to-date.
 * Works for both desktop (Tauri) and web environments.
 */
export const checkForUpdates = async (): Promise<UpdateInfo | null> => {
  const env = getRunEnv();

  if (env === RUN_ENV.DESKTOP) {
    return invokeTauri<UpdateInfo | null>("check_for_updates");
  }

  if (env === RUN_ENV.WEB) {
    const response = await invokeWeb<WebUpdateCheckResponse>("check_update");
    if (!response?.updateAvailable) {
      return null;
    }
    // Convert web response to UpdateInfo shape
    return {
      currentVersion: "",
      latestVersion: response.latestVersion,
      notes: response.notes,
      pubDate: response.pubDate,
      isAppStoreBuild: false,
      storeUrl: response.downloadUrl,
      changelogUrl: response.changelogUrl,
      screenshots: response.screenshots,
    };
  }

  return null;
};

/**
 * Download and install an available update.
 * Only available on desktop - web users update via Docker/manual download.
 */
export const installUpdate = async (): Promise<void> => {
  if (getRunEnv() !== RUN_ENV.DESKTOP) {
    throw new Error("Updates can only be installed on the desktop client");
  }

  await invokeTauri("install_app_update");
};
