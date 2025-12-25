// Tauri adapter - Desktop implementation
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { EventCallback as TauriEventCallback, UnlistenFn as TauriUnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";

import type {
  EventCallback,
  UnlistenFn,
  Logger,
  ExtractedAddon,
  InstalledAddon,
  AddonManifest,
  RunEnv,
} from "../types";
import { RunEnvs } from "../types";

// Re-export types and constants
export type { EventCallback, UnlistenFn, RunEnv } from "../types";
export { RunEnvs } from "../types";
export type {
  AddonFile,
  AddonInstallResult,
  AddonManifest,
  AddonUpdateCheckResult,
  AddonUpdateInfo,
  AddonValidationResult,
  ExtractedAddon,
  FunctionPermission,
  InstalledAddon,
  Permission,
} from "../types";

/**
 * Runtime environment identifier - always "desktop" for Tauri builds
 */
export const RUN_ENV: RunEnv = RunEnvs.DESKTOP;

/** True when running in the desktop (Tauri) environment */
export const isDesktop = true;

/** True when running in the web environment */
export const isWeb = false;

/**
 * Invoke a Tauri command
 */
export const invoke = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  return await tauriInvoke<T>(command, payload);
};

/**
 * Logger implementation using Tauri's log plugin
 * Wraps the Tauri log functions to match the Logger interface
 */
export const logger: Logger = {
  error: (...args: unknown[]) => {
    error(args.map(String).join(" "));
  },
  warn: (...args: unknown[]) => {
    warn(args.map(String).join(" "));
  },
  info: (...args: unknown[]) => {
    info(args.map(String).join(" "));
  },
  debug: (...args: unknown[]) => {
    debug(args.map(String).join(" "));
  },
  trace: (...args: unknown[]) => {
    trace(args.map(String).join(" "));
  },
};

// ============================================================================
// Addon Commands
// ============================================================================

export const extractAddonZip = async (zipData: Uint8Array): Promise<ExtractedAddon> => {
  return await tauriInvoke<ExtractedAddon>("extract_addon_zip", { zipData: Array.from(zipData) });
};

export const installAddonZip = async (
  zipData: Uint8Array,
  enableAfterInstall?: boolean,
): Promise<AddonManifest> => {
  return await tauriInvoke<AddonManifest>("install_addon_zip", {
    zipData: Array.from(zipData),
    enableAfterInstall,
  });
};

export const installAddonFile = async (
  fileName: string,
  fileContent: string,
  enableAfterInstall?: boolean,
): Promise<AddonManifest> => {
  return await tauriInvoke<AddonManifest>("install_addon_file", {
    fileName,
    fileContent,
    enableAfterInstall,
  });
};

export const listInstalledAddons = async (): Promise<InstalledAddon[]> => {
  return await tauriInvoke<InstalledAddon[]>("list_installed_addons");
};

export const toggleAddon = async (addonId: string, enabled: boolean): Promise<void> => {
  return await tauriInvoke<void>("toggle_addon", { addonId, enabled });
};

export const uninstallAddon = async (addonId: string): Promise<void> => {
  return await tauriInvoke<void>("uninstall_addon", { addonId });
};

export const loadAddonForRuntime = async (addonId: string): Promise<ExtractedAddon> => {
  return await tauriInvoke<ExtractedAddon>("load_addon_for_runtime", { addonId });
};

export const getEnabledAddonsOnStartup = async (): Promise<ExtractedAddon[]> => {
  return await tauriInvoke<ExtractedAddon[]>("get_enabled_addons_on_startup");
};

// ============================================================================
// File Dialogs
// ============================================================================

export const openCsvFileDialog = async (): Promise<null | string | string[]> => {
  return open({ filters: [{ name: "CSV", extensions: ["csv"] }] });
};

export const openFolderDialog = async (): Promise<string | null> => {
  return open({ directory: true });
};

export const openDatabaseFileDialog = async (): Promise<string | null> => {
  const result = await open();
  return Array.isArray(result) ? (result[0] ?? null) : result;
};

export const openFileSaveDialog = async (
  fileContent: string | Blob | Uint8Array,
  fileName: string,
): Promise<boolean> => {
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

// ============================================================================
// Event Listeners
// ============================================================================

// Helper to adapt Tauri's event callback to our unified type
const adaptCallback = <T>(handler: EventCallback<T>): TauriEventCallback<T> => {
  return (event) => handler({ event: event.event, payload: event.payload, id: event.id });
};

// Helper to adapt Tauri's unlisten function to our unified type
const adaptUnlisten = (unlisten: TauriUnlistenFn): UnlistenFn => {
  return async () => unlisten();
};

export const listenFileDropHover = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("tauri://file-drop-hover", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

export const listenFileDrop = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("tauri://file-drop", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

export const listenFileDropCancelled = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("tauri://file-drop-cancelled", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

export const listenPortfolioUpdateStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("portfolio:update-start", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

export const listenPortfolioUpdateComplete = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("portfolio:update-complete", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

export const listenDatabaseRestored = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("database-restored", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

export const listenPortfolioUpdateError = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("portfolio:update-error", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

export async function listenMarketSyncComplete<T>(handler: EventCallback<T>): Promise<UnlistenFn> {
  const unlisten = await listen<T>("market:sync-complete", adaptCallback(handler));
  return adaptUnlisten(unlisten);
}

export async function listenMarketSyncStart<T>(handler: EventCallback<T>): Promise<UnlistenFn> {
  const unlisten = await listen<T>("market:sync-start", adaptCallback(handler));
  return adaptUnlisten(unlisten);
}

export async function listenNavigateToRoute<T>(handler: EventCallback<T>): Promise<UnlistenFn> {
  const unlisten = await listen<T>("navigate-to-route", adaptCallback(handler));
  return adaptUnlisten(unlisten);
}

export const listenDeepLink = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const unlisten = await listen<T>("deep-link-received", adaptCallback(handler));
  return adaptUnlisten(unlisten);
};

// ============================================================================
// Shell & Browser
// ============================================================================

export const openUrlInBrowser = async (url: string): Promise<void> => {
  const { open: openShell } = await import("@tauri-apps/plugin-shell");
  await openShell(url);
};
