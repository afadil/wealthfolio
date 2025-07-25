/**
 * Utility functions for addon permission management
 * 
 * The main approach is to read permissions directly from addon metadata,
 * which contains pre-computed permissions from installation time.
 */

import { getDetectedPermissionsFromMetadata, redetectAddonPermissions, analyzeAddonPermissions } from './permissions';
import type { PermissionCategory, AddonMetadata } from '@wealthfolio/addon-sdk';

export interface AddonPermissionInfo {
  detectedFunctions: string[];
  categories: PermissionCategory[];
  riskLevel: 'low' | 'medium' | 'high';
  source: 'cached' | 'redetected' | 'runtime';
  detectedAt?: string;
  // Enhanced permission analysis
  declaredFunctions: string[];
  undeclaredFunctions: string[];
  hasUndeclaredPermissions: boolean;
}

/**
 * Get addon permissions (primary method)
 * 
 * For installed addons: Use metadata.detected_permissions (fastest)
 * For addon preview: Use runtime analysis on provided code
 */
export function getAddonPermissions(
  metadata: AddonMetadata,
  addonCode?: string
): AddonPermissionInfo {
  // First, try to get permissions from metadata (normal case for installed addons)
  const fromMetadata = getDetectedPermissionsFromMetadata(metadata);
  if (fromMetadata) {
    return {
      ...fromMetadata,
      source: 'cached',
      detectedAt: metadata.permissions?.find((p: any) => p.is_detected)?.detected_at,
      hasUndeclaredPermissions: fromMetadata.undeclaredFunctions.length > 0
    };
  }

  // Fallback for addon preview (before installation)
  if (addonCode) {
    console.log(`No cached permissions for addon ${metadata.id}, using runtime analysis for preview`);
    const runtime = analyzeAddonPermissions(addonCode);
    return {
      ...runtime,
      source: 'runtime',
      declaredFunctions: [], // No declared permissions in preview
      undeclaredFunctions: runtime.detectedFunctions, // All are undeclared in preview
      hasUndeclaredPermissions: runtime.detectedFunctions.length > 0
    };
  }

  // This shouldn't happen for properly installed addons
  throw new Error(`No permissions available for addon ${metadata.id}. This addon may have been installed before permission caching was implemented.`);
}

/**
 * Force re-detection of permissions (rarely needed)
 * Use only for legacy addons or manual debugging
 */
export async function refreshAddonPermissions(addonId: string): Promise<AddonPermissionInfo> {
  try {
    const redetected = await redetectAddonPermissions(addonId);
    return {
      ...redetected,
      source: 'redetected',
      hasUndeclaredPermissions: redetected.undeclaredFunctions.length > 0
    };
  } catch (error) {
    console.error(`Failed to refresh permissions for addon ${addonId}:`, error);
    throw error;
  }
}

/**
 * Compare detected permissions with declared permissions in manifest
 */
export function validateAddonPermissions(
  detectedPermissions: AddonPermissionInfo,
  declaredPermissions?: any[]
): {
  isValid: boolean;
  missingPermissions: string[];
  extraPermissions: string[];
  warnings: string[];
} {
  const declaredFunctions = declaredPermissions?.flatMap(permission => 
    permission.functions || []
  ) || [];
  
  const missingPermissions = detectedPermissions.detectedFunctions.filter(
    func => !declaredFunctions.includes(func)
  );
  
  const extraPermissions = declaredFunctions.filter(
    func => !detectedPermissions.detectedFunctions.includes(func)
  );

  const warnings = [];
  
  if (detectedPermissions.source === 'runtime') {
    warnings.push('Permissions analyzed at runtime - consider installing addon for better performance');
  }
  
  if (detectedPermissions.riskLevel === 'high' && missingPermissions.length > 0) {
    warnings.push('High-risk addon with undeclared permissions detected');
  }

  return {
    isValid: missingPermissions.length === 0,
    missingPermissions,
    extraPermissions,
    warnings
  };
}

/**
 * Get a human-readable description of addon permissions
 */
export function formatAddonPermissionSummary(permissions: AddonPermissionInfo): string {
  if (permissions.categories.length === 0) {
    return 'This addon will have minimal access to your data.';
  }
  
  const categoryNames = permissions.categories.map(cat => cat.name).join(', ');
  const riskIndicator = permissions.riskLevel === 'high' ? ' ⚠️' : 
                        permissions.riskLevel === 'medium' ? ' ⚡' : '';
  
  return `This addon will access: ${categoryNames}${riskIndicator}`;
}

/**
 * Performance monitoring for permission detection methods
 */
export function benchmarkPermissionDetection(
  metadata: AddonMetadata,
  addonCode?: string
): {
  cached: { duration: number; success: boolean };
  runtime?: { duration: number; success: boolean };
} {
  const results: any = {};

  // Test cached permissions (reading from metadata)
  const cachedStart = performance.now();
  try {
    getDetectedPermissionsFromMetadata(metadata);
    results.cached = { duration: performance.now() - cachedStart, success: true };
  } catch {
    results.cached = { duration: performance.now() - cachedStart, success: false };
  }

  // Test runtime analysis if code provided
  if (addonCode) {
    const runtimeStart = performance.now();
    try {
      analyzeAddonPermissions(addonCode);
      results.runtime = { duration: performance.now() - runtimeStart, success: true };
    } catch {
      results.runtime = { duration: performance.now() - runtimeStart, success: false };
    }
  }

  return results;
}
