// Shared types for adapters

/**
 * Runtime environment constants
 */
export const RunEnvs = {
  DESKTOP: "desktop",
  WEB: "web",
} as const;

/**
 * Runtime environment type - either desktop (Tauri) or web
 */
export type RunEnv = (typeof RunEnvs)[keyof typeof RunEnvs];

/**
 * Callback function for event handling
 */
export type EventCallback<T> = (event: { event: string; payload: T; id: number }) => void;

/**
 * Function to unsubscribe from an event
 */
export type UnlistenFn = () => Promise<void>;

/**
 * Logger interface with standard logging methods
 */
export interface Logger {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
}

// Addon types from SDK, re-exported with Tauri serialization adjustments
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
