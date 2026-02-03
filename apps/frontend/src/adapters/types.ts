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

// Provider capabilities from backend
export interface ProviderCapabilities {
  instruments: string;
  coverage: string;
  features: string[];
}

// Interface matching the backend struct
export interface MarketDataProviderSetting {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  priority: number;
  enabled: boolean;
  logoFilename: string | null;
  capabilities: ProviderCapabilities | null;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  assetCount: number;
  errorCount: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  uniqueErrors: string[];
}

// ============================================================================
// Shared Request/Response Types
// ============================================================================

/**
 * Request for fetching import runs with pagination and filtering.
 */
export interface ImportRunsRequest {
  runType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Request for updating thread title or pinned status.
 */
export interface UpdateThreadRequest {
  id: string;
  title?: string;
  isPinned?: boolean;
}

/**
 * Request to update a tool result with additional data.
 */
export interface UpdateToolResultRequest {
  threadId: string;
  toolCallId: string;
  resultPatch: Record<string, unknown>;
}

/**
 * Application info including version and paths.
 */
export interface AppInfo {
  version: string;
  dbPath: string;
  logsDir: string;
}

/**
 * Result from checking for application updates.
 */
export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion: string;
  notes?: string;
  pubDate?: string;
  downloadUrl?: string;
}

/**
 * Payload for update check requests.
 */
export interface UpdateCheckPayload {
  currentVersion: string;
}

/**
 * Platform information for the current runtime environment.
 */
export interface PlatformInfo {
  os: string;
  is_mobile: boolean;
  is_desktop: boolean;
}

// ============================================================================
// Device Sync Types
// ============================================================================

import type { DeviceSyncState, TrustedDeviceSummary } from "@/features/devices-sync/types";

/**
 * Result from get_device_sync_state command.
 */
export interface BackendSyncStateResult {
  state: DeviceSyncState;
  deviceId: string | null;
  deviceName: string | null;
  keyVersion: number | null;
  serverKeyVersion: number | null;
  isTrusted: boolean;
  trustedDevices: TrustedDeviceSummary[];
}

/**
 * Result from enable_device_sync command.
 */
export interface BackendEnableSyncResult {
  deviceId: string;
  state: DeviceSyncState;
  keyVersion: number | null;
  serverKeyVersion: number | null;
  needsPairing: boolean;
  trustedDevices: TrustedDeviceSummary[];
}

/**
 * Ephemeral key pair for secure pairing operations.
 */
export interface EphemeralKeyPair {
  publicKey: string; // Base64
  secretKey: string; // Base64
}
