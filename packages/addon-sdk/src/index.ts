/**
 * @wealthfolio/addon-sdk
 * 
 * TypeScript SDK for building Wealthfolio addons with enhanced functionality,
 * type safety, and comprehensive permission management.
 * 
 * @version 1.0.0
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
  EventCallback,
  UnlistenFn,
} from './types';

// Host API interface
export type { HostAPI } from './host-api';

// Comprehensive data types
export type * from './data-types';

// Manifest and metadata types
export type {
  AddonManifest,
  DevelopmentManifest,
  InstalledManifest,
  AddonFile,
  ExtractedAddon,
  InstalledAddon,
  AddonInstallResult,
  AddonValidationResult,
  AddonStoreListing,
  AddonUpdateInfo,
  AddonUpdateCheckResult,
} from './manifest';

export {
  isInstalledManifest,
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

/**
 * Addons receive their context as a parameter to the enable() function.
 * Each addon gets its own isolated context with scoped secret storage.
 * 
 * Example:
 * export default function enable(ctx: AddonContext) {
 *   // Use ctx.api.secrets.set/get/delete for secure storage
 *   // Use ctx.sidebar.addItem() to add navigation
 *   // Use ctx.router.add() to register routes
 * }
 */ 