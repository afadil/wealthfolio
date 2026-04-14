// Settings Commands
import type { Settings, UpdateInfo } from "@/lib/types";
import type { AppInfo, PlatformInfo } from "../types";

import { invoke, logger, tauriInvoke } from "./core";

export const getSettings = async (): Promise<Settings> => {
  try {
    return await invoke<Settings>("get_settings");
  } catch (err) {
    logger.error("Error fetching settings.");
    throw err;
  }
};

export const updateSettings = async (settingsUpdate: Partial<Settings>): Promise<Settings> => {
  try {
    return await invoke<Settings>("update_settings", { settingsUpdate });
  } catch (error) {
    logger.error("Error updating settings.");
    throw error;
  }
};

export const isAutoUpdateCheckEnabled = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>("is_auto_update_check_enabled");
  } catch (_error) {
    logger.error("Error checking auto-update setting.");
    return true; // Default to enabled
  }
};

export const backupDatabase = async (): Promise<{ filename: string; data: Uint8Array }> => {
  try {
    // Desktop (Tauri) returns a tuple [filename, data[]], transform internally to object
    const result = await tauriInvoke<[string, number[]]>("backup_database");
    const [filename, data] = result;
    return { filename, data: new Uint8Array(data) };
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
    await invoke<void>("restore_database", { backupFilePath });
  } catch (error) {
    logger.error("Error restoring database.");
    throw error;
  }
};

// ============================================================================
// App Commands
// ============================================================================

export const getAppInfo = async (): Promise<AppInfo> => {
  try {
    return await invoke<AppInfo>("get_app_info");
  } catch (err) {
    logger.error("Error fetching app info");
    throw err;
  }
};

// ============================================================================
// Updater Commands
// ============================================================================

/**
 * Check for updates. Returns update info if available, null if up-to-date.
 * Desktop implementation uses Tauri invoke command.
 */
export const checkForUpdates = async (_options?: {
  force?: boolean;
}): Promise<UpdateInfo | null> => {
  return await invoke<UpdateInfo | null>("check_for_updates");
};

/**
 * Download and install an available update.
 * Only available on desktop.
 */
export const installUpdate = async (): Promise<void> => {
  await invoke("install_app_update");
};

// ============================================================================
// Platform Commands
// ============================================================================

export const getPlatform = async (): Promise<PlatformInfo> => {
  return invoke<PlatformInfo>("get_platform");
};

/** Keeps native menus/dialogs in sync with the web UI language (desktop only). */
export async function syncShellLocale(locale: string): Promise<void> {
  try {
    // Normalize i18n locales like "de-DE" / "en-US" to shell-supported codes.
    const normalized = (locale ?? "en").toLowerCase().split("-")[0];
    const shellLocale = normalized === "de" ? "de" : "en";
    logger.debug(`[i18n] syncShellLocale request: ${locale} -> ${shellLocale}`);
    await invoke<void>("set_shell_locale", { locale: shellLocale });
    logger.debug(`[i18n] syncShellLocale success: ${shellLocale}`);
  } catch {
    logger.warn("[i18n] syncShellLocale failed");
  }
}
