import { invoke } from "@tauri-apps/api/core";
import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

export type { EventCallback, UnlistenFn };

import type {
  AddonInstallResult,
  AddonManifest,
  AddonUpdateCheckResult,
  AddonUpdateInfo,
  AddonValidationResult,
  AddonFile as BaseAddonFile,
  FunctionPermission,
  Permission,
} from "@wealthfolio/addon-sdk";

// Tauri-specific types with camelCase serialization to match Rust
export interface AddonFile extends Omit<BaseAddonFile, "is_main"> {
  isMain: boolean;
}

// Re-export SDK types directly
export type {
  AddonInstallResult,
  AddonManifest,
  AddonUpdateCheckResult,
  AddonUpdateInfo,
  AddonValidationResult,
  FunctionPermission,
  Permission,
};

export interface ExtractedAddon {
  metadata: AddonManifest;
  files: AddonFile[];
}

export interface InstalledAddon {
  metadata: AddonManifest;
  /** File path where the addon is stored (Tauri-specific) */
  filePath: string;
  /** Whether this is a ZIP-based addon (Tauri-specific) */
  isZipAddon: boolean;
}

export const invokeTauri = async <T>(command: string, payload?: Record<string, unknown>) => {
  return await invoke<T>(command, payload);
};

export const extractAddonZip = async (zipData: Uint8Array): Promise<ExtractedAddon> => {
  return await invoke<ExtractedAddon>("extract_addon_zip", { zipData: Array.from(zipData) });
};

export const installAddonZip = async (
  zipData: Uint8Array,
  enableAfterInstall?: boolean,
): Promise<AddonManifest> => {
  return await invoke<AddonManifest>("install_addon_zip", {
    zipData: Array.from(zipData),
    enableAfterInstall,
  });
};

export const installAddonFile = async (
  fileName: string,
  fileContent: string,
  enableAfterInstall?: boolean,
): Promise<AddonManifest> => {
  return await invoke<AddonManifest>("install_addon_file", {
    fileName,
    fileContent,
    enableAfterInstall,
  });
};

export const listInstalledAddons = async (): Promise<InstalledAddon[]> => {
  return await invoke<InstalledAddon[]>("list_installed_addons");
};

export const toggleAddon = async (addonId: string, enabled: boolean): Promise<void> => {
  return await invoke<void>("toggle_addon", { addonId, enabled });
};

export const uninstallAddon = async (addonId: string): Promise<void> => {
  return await invoke<void>("uninstall_addon", { addonId });
};

export const loadAddonForRuntime = async (addonId: string): Promise<ExtractedAddon> => {
  return await invoke<ExtractedAddon>("load_addon_for_runtime", { addonId });
};

export const getEnabledAddonsOnStartup = async (): Promise<ExtractedAddon[]> => {
  return await invoke<ExtractedAddon[]>("get_enabled_addons_on_startup");
};

export const openCsvFileDialogTauri = async (): Promise<null | string | string[]> => {
  return open({ filters: [{ name: "CSV", extensions: ["csv"] }] });
};

export const openFolderDialogTauri = async (): Promise<string | null> => {
  return open({ directory: true });
};

export const openDatabaseFileDialogTauri = async (): Promise<string | null> => {
  const result = await open();
  return Array.isArray(result) ? (result[0] ?? null) : result;
};

export const listenFileDropHoverTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>("tauri://file-drop-hover", handler);
};

export const listenFileDropTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return listen<T>("tauri://file-drop", handler);
};

export const listenFileDropCancelledTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>("tauri://file-drop-cancelled", handler);
};

export const listenPortfolioUpdateStartTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>("portfolio:update-start", handler);
};

export const listenPortfolioUpdateCompleteTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>("portfolio:update-complete", handler);
};

export const listenDatabaseRestoredTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>("database-restored", handler);
};

export const listenPortfolioUpdateErrorTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>("portfolio:update-error", handler);
};

export async function listenMarketSyncCompleteTauri<T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return listen("market:sync-complete", handler);
}

export async function listenMarketSyncStartTauri<T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return listen("market:sync-start", handler);
}

export async function listenNavigateToRouteTauri<T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return listen("navigate-to-route", handler);
}

export const openFileSaveDialogTauri = async (
  fileContent: string | Blob | Uint8Array,
  fileName: string,
) => {
  const filePath = await save({
    defaultPath: fileName,
    filters: [
      {
        name: fileName,
        extensions: [fileName.split(".").pop() ?? ""],
      },
    ],
  });

  if (filePath === null) {
    return false;
  }

  let contentToSave: Uint8Array;
  if (typeof fileContent === "string") {
    contentToSave = new TextEncoder().encode(fileContent);
  } else if (fileContent instanceof Blob) {
    const arrayBuffer = await fileContent.arrayBuffer();
    contentToSave = new Uint8Array(arrayBuffer);
  } else {
    contentToSave = fileContent;
  }

  await writeFile(filePath, contentToSave, { baseDir: BaseDirectory.Document });

  return true;
};

export const logger = {
  error,
  info,
  warn,
  trace,
  debug,
};

export const listenDeepLinkTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return listen<T>("deep-link-received", handler);
};

export const openUrlInBrowser = async (url: string): Promise<void> => {
  const { open: openShell } = await import("@tauri-apps/plugin-shell");
  await openShell(url);
};
