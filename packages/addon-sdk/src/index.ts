/**
 * @wealthfolio/addon-sdk
 * 
 * TypeScript SDK for building Wealthfolio addons with enhanced functionality,
 * type safety, and comprehensive permission management.
 * 
 * @version 1.1.0
 * @author Wealthfolio Team
 * @license MIT
 */

// Core types
export type {
  AddonContext,
  AddonEnableFunction,
  SidebarItemHandle,
  SidebarItemConfig,
  RouteConfig,
  SidebarManager,
  RouterManager,
} from './types';

// Manifest and metadata types
export type {
  AddonManifest,
  AddonMetadata,
  AddonFile,
  ExtractedAddon,
  InstalledAddon,
  AddonInstallResult,
  AddonValidationResult,
  AddonStoreListing,
} from './manifest';

// Permission system
export type {
  RiskLevel,
  Permission,
  PermissionCategory,
  FunctionPermission,
} from './permissions';

export {
  PERMISSION_CATEGORIES,
  getPermissionCategory,
  getPermissionCategoriesByRisk,
  getFunctionRiskLevel,
  isPermissionRequired,
} from './permissions';

// Utilities
export {
  validateManifest,
  isCompatibleVersion,
  formatAddonSize,
  generateAddonId,
  isAddonManifest,
} from './utils';

import type { AddonContext } from './types';

// Global context access
declare global {
  var __WF_CTX__: AddonContext;
}

/**
 * Get the current addon context
 * This provides access to Wealthfolio's APIs for your addon
 */
export function getAddonContext(): AddonContext {
  if (typeof globalThis !== 'undefined' && globalThis.__WF_CTX__) {
    return globalThis.__WF_CTX__;
  }
  
  throw new Error(
    'Addon context not available. Make sure your addon is loaded within Wealthfolio.'
  );
}

/**
 * Default export for backward compatibility
 */
const ctx = typeof globalThis !== 'undefined' ? globalThis.__WF_CTX__ : undefined;
export default ctx; 