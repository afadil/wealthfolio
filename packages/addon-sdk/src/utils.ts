/**
 * Utility functions for addon development
 */

import type { AddonManifest, AddonValidationResult } from './manifest';
import type { PermissionCategory, RiskLevel } from './permissions';
import { PERMISSION_CATEGORIES } from './permissions';

/**
 * Validates an addon manifest
 */
export function validateManifest(manifest: AddonManifest): AddonValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!manifest.id) {
    errors.push('Addon ID is required');
  } else if (!/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('Addon ID must contain only lowercase letters, numbers, and hyphens');
  }

  if (!manifest.name) {
    errors.push('Addon name is required');
  }

  if (!manifest.version) {
    errors.push('Addon version is required');
  } else if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    warnings.push('Version should follow semantic versioning (e.g., 1.0.0)');
  }

  // Optional but recommended fields
  if (!manifest.description) {
    warnings.push('Description is recommended for better discoverability');
  }

  if (!manifest.author) {
    warnings.push('Author information is recommended');
  }

  if (!manifest.main) {
    warnings.push('Main entry point not specified, defaulting to "addon.js"');
  }

  // Validate permissions if present
  if (manifest.permissions) {
    manifest.permissions.forEach((permission, index) => {
      if (!permission.category) {
        errors.push(`Permission ${index}: category is required`);
      }
      if (!permission.functions || permission.functions.length === 0) {
        errors.push(`Permission ${index}: at least one function must be specified`);
      }
      if (!permission.purpose) {
        warnings.push(`Permission ${index}: purpose explanation is recommended`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Creates a basic addon manifest template
 */
export function createManifestTemplate(options: {
  id: string;
  name: string;
  author?: string;
  description?: string;
}): AddonManifest {
  return {
    id: options.id,
    name: options.name,
    version: '1.0.0',
    description: options.description || `${options.name} addon for Wealthfolio`,
    author: options.author || 'Unknown Author',
    main: 'dist/addon.js',
    sdkVersion: '1.1.0',
    enabled: true,
    permissions: [],
    dataAccess: []
  };
}

/**
 * Analyzes code to detect API usage and suggest permissions
 */
export function analyzeCodePermissions(code: string): {
  detectedFunctions: string[];
  suggestedCategories: PermissionCategory[];
  riskLevel: RiskLevel;
} {
  const detectedFunctions: string[] = [];
  
  // Search for API function calls in the code
  PERMISSION_CATEGORIES.forEach(category => {
    category.functions.forEach(func => {
      // Look for various patterns of function calls
      const patterns = [
        new RegExp(`\\.${func}\\s*\\(`, 'g'), // object.function()
        new RegExp(`\\b${func}\\s*\\(`, 'g'),  // function()
        new RegExp(`["']${func}["']`, 'g'),    // "function" as string
      ];
      
      patterns.forEach(pattern => {
        if (pattern.test(code)) {
          if (!detectedFunctions.includes(func)) {
            detectedFunctions.push(func);
          }
        }
      });
    });
  });
  
  // Find categories that have detected functions
  const suggestedCategories = PERMISSION_CATEGORIES.filter(category =>
    category.functions.some(func => detectedFunctions.includes(func))
  );
  
  // Determine overall risk level
  let riskLevel: RiskLevel = 'low';
  if (suggestedCategories.some(cat => cat.riskLevel === 'high')) {
    riskLevel = 'high';
  } else if (suggestedCategories.some(cat => cat.riskLevel === 'medium')) {
    riskLevel = 'medium';
  }
  
  return {
    detectedFunctions,
    suggestedCategories,
    riskLevel
  };
}

/**
 * Checks if an addon version is compatible with the current SDK
 */
export function isCompatibleVersion(addonSdkVersion?: string, currentSdkVersion = '1.1.0'): boolean {
  if (!addonSdkVersion) return true; // Assume compatible if not specified
  
  const [addonMajor, addonMinor] = addonSdkVersion.split('.').map(Number);
  const [currentMajor, currentMinor] = currentSdkVersion.split('.').map(Number);
  
  // Same major version, and addon minor version <= current minor version
  return addonMajor === currentMajor && addonMinor <= currentMinor;
}

/**
 * Formats addon size in human-readable format
 */
export function formatAddonSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  
  return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * Generates a unique addon ID from a name
 */
export function generateAddonId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Type guard to check if an object is a valid addon manifest
 */
export function isAddonManifest(obj: any): obj is AddonManifest {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.version === 'string'
  );
}
