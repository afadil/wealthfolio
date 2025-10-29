/**
 * Addon manifest and metadata types
 */

import type { Permission } from './permissions';

/**
 * Unified addon manifest structure that handles both development and runtime scenarios
 * This represents both what developers write in their manifest.json and installed addon metadata
 */
export interface AddonManifest {
  // Core manifest fields (always present)
  /** Unique addon identifier (lowercase, no spaces, hyphens allowed) */
  id: string;
  /** Human-readable addon name */
  name: string;
  /** Semantic version (e.g., "1.0.0") */
  version: string;
  /** Brief description of the addon's functionality */
  description?: string;
  /** Author name or organization */
  author?: string;
  /** Compatible SDK version */
  sdkVersion?: string;
  /** Main entry point file (relative to addon root) */
  main?: string;
  /** Whether the addon is enabled by default */
  enabled?: boolean;
  /** Permission declarations for security review */
  permissions?: Permission[];
  /** Addon homepage or documentation URL */
  homepage?: string;
  /** Support or issues URL */
  repository?: string;
  /** License identifier (e.g., "MIT", "Apache-2.0") */
  license?: string;
  /** Minimum Wealthfolio version required */
  minWealthfolioVersion?: string;
  /** Keywords for discoverability */
  keywords?: string[];
  /** Addon icon (base64 or relative path) */
  icon?: string;

  // Runtime fields (only present after installation)
  /** Installation timestamp in ISO format */
  installedAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
  /** Installation source */
  source?: 'local' | 'store' | 'sideload';
  /** File size in bytes */
  size?: number;
}

/**
 * Type guard to check if a manifest has been installed (has runtime fields)
 */
export function isInstalledManifest(
  manifest: AddonManifest,
): manifest is Required<Pick<AddonManifest, 'main' | 'enabled' | 'installedAt'>> &
  AddonManifest {
  return !!(
    manifest.installedAt &&
    manifest.main !== undefined &&
    manifest.enabled !== undefined
  );
}

/**
 * Helper type for development manifests (without runtime fields)
 */
export type DevelopmentManifest = Omit<
  AddonManifest,
  'installedAt' | 'updatedAt' | 'source' | 'size'
>;

/**
 * Helper type for installed manifests (with runtime fields)
 */
export type InstalledManifest = Required<
  Pick<AddonManifest, 'main' | 'enabled' | 'installedAt'>
> &
  AddonManifest;

/**
 * Addon file information
 */
export interface AddonFile {
  /** File name */
  name: string;
  /** File content */
  content: string;
  /** Whether this is the main entry point */
  is_main: boolean;
  /** File size in bytes */
  size?: number;
}

/**
 * Extracted addon package
 */
export interface ExtractedAddon {
  /** Addon metadata from manifest */
  metadata: AddonManifest;
  /** List of files in the addon package */
  files: AddonFile[];
}

/**
 * Installed addon information
 */
export interface InstalledAddon {
  /** Addon metadata */
  metadata: AddonManifest;
  /** Installation path */
  path?: string;
  /** Whether the addon is currently active */
  active?: boolean;
}

/**
 * Addon installation result
 */
export interface AddonInstallResult {
  /** Whether installation was successful */
  success: boolean;
  /** Error message if installation failed */
  error?: string;
  /** Installed addon metadata */
  addon?: AddonManifest;
}

/**
 * Addon validation result
 */
export interface AddonValidationResult {
  /** Whether the addon is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

/**
 * Addon update information
 */
export interface AddonUpdateInfo {
  /** Current installed version */
  currentVersion: string;
  /** Latest available version */
  latestVersion: string;
  /** Whether an update is available */
  updateAvailable: boolean;
  /** Download URL for the update */
  downloadUrl?: string;
  /** Release notes for the latest version */
  releaseNotes?: string;
  /** Release date of the latest version */
  releaseDate?: string;
  /** Changelog URL */
  changelogUrl?: string;
  /** Whether this is a critical security update */
  isCritical?: boolean;
  /** Breaking changes in this update */
  hasBreakingChanges?: boolean;
  /** Minimum Wealthfolio version required for this update */
  minWealthfolioVersion?: string;
}

/**
 * Addon update check result
 */
export interface AddonUpdateCheckResult {
  /** Addon ID */
  addonId: string;
  /** Update information */
  updateInfo: AddonUpdateInfo;
  /** Any errors during update check */
  error?: string;
}

/**
 * Addon store listing
 */
export interface AddonStoreListing {
  /** Addon metadata */
  metadata: AddonManifest;
  /** Download URL */
  downloadUrl: string;
  /** Number of downloads */
  downloads?: number;
  /** Average rating */
  rating?: number;
  /** Number of reviews */
  reviewCount?: number;
  /** Whether it's verified by Wealthfolio team */
  verified?: boolean;
  /** Last update date */
  lastUpdated?: string;
  /** Screenshots or images */
  images?: string[];
  /** Release notes for the latest version */
  releaseNotes?: string;
  /** Changelog URL */
  changelogUrl?: string;
}
