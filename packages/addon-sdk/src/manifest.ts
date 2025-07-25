/**
 * Addon manifest and metadata types
 */

import type { Permission } from './permissions';

/**
 * Addon manifest structure for ZIP packages
 */
export interface AddonManifest {
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
}

/**
 * Addon metadata with runtime information
 */
export interface AddonMetadata extends AddonManifest {
  /** Installation timestamp */
  installedAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
  /** Installation source */
  source?: 'local' | 'store' | 'sideload';
  /** File size in bytes */
  size?: number;
  /** Whether the addon is currently enabled (runtime field) */
  enabled: boolean;
  /** Installation timestamp in ISO format (runtime field) */
  installed_at: string;
}

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
  metadata: AddonMetadata;
  /** List of files in the addon package */
  files: AddonFile[];
}

/**
 * Installed addon information
 */
export interface InstalledAddon {
  /** Addon metadata */
  metadata: AddonMetadata;
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
  addon?: AddonMetadata;
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
 * Addon store listing
 */
export interface AddonStoreListing {
  /** Addon metadata */
  metadata: AddonMetadata;
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
}
