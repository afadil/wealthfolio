// Web adapter - Browser implementation
// This file re-exports shared modules and platform-specific modules

import type { RunEnv } from "../types";
import { RunEnvs } from "../types";

// Platform constants
export { isDesktop, isWeb, logger } from "./core";

// Re-export types and constants from shared types
export { RunEnvs } from "../types";
export type {
  AddonFile,
  AddonInstallResult,
  AddonManifest,
  AddonUpdateCheckResult,
  AddonUpdateInfo,
  AddonValidationResult,
  EventCallback,
  ExtractedAddon,
  FunctionPermission,
  InstalledAddon,
  Permission,
  RunEnv,
  UnlistenFn,
  MarketDataProviderSetting,
  ProviderCapabilities,
  ImportRunsRequest,
  UpdateThreadRequest,
  UpdateToolResultRequest,
  AppInfo,
  UpdateCheckResult,
  UpdateCheckPayload,
  PlatformInfo,
  BackendSyncStateResult,
  BackendEnableSyncResult,
  EphemeralKeyPair,
  Logger,
} from "../types";

// Re-export AI types from features/ai-assistant
export type {
  AiChatMessage,
  AiChatModelConfig,
  AiSendMessageRequest,
  AiStreamEvent,
  AiThread,
  AiToolCall,
  AiToolResult,
  AiUsageStats,
  ListThreadsRequest,
  ThreadPage,
} from "@/features/ai-assistant/types";

/**
 * Runtime environment identifier - always "web" for web builds
 */
export const RUN_ENV: RunEnv = RunEnvs.WEB;

// ============================================================================
// Shared domain modules (identical logic for both platforms)
// ============================================================================

// Account Commands
export {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from "../shared/accounts";

// Activity Commands
export {
  getActivities,
  searchActivities,
  createActivity,
  updateActivity,
  saveActivities,
  deleteActivity,
  importActivities,
  checkActivitiesImport,
  getAccountImportMapping,
  saveAccountImportMapping,
  checkExistingDuplicates,
} from "../shared/activities";
export { parseCsv } from "./activities";

// Goal Commands
export {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  updateGoalsAllocations,
  getGoalsAllocation,
} from "../shared/goals";

// Secrets Commands
export { setSecret, getSecret, deleteSecret } from "../shared/secrets";

// Taxonomy Commands
export {
  getTaxonomies,
  getTaxonomy,
  createTaxonomy,
  updateTaxonomy,
  deleteTaxonomy,
  createCategory,
  updateCategory,
  deleteCategory,
  moveCategory,
  importTaxonomyJson,
  exportTaxonomyJson,
  getAssetTaxonomyAssignments,
  assignAssetToCategory,
  removeAssetTaxonomyAssignment,
  getMigrationStatus,
  migrateLegacyClassifications,
} from "../shared/taxonomies";

// Portfolio Commands
export {
  updatePortfolio,
  recalculatePortfolio,
  getHoldings,
  getIncomeSummary,
  getHistoricalValuations,
  getLatestValuations,
  calculatePerformanceHistory,
  calculatePerformanceSummary,
  calculateAccountsSimplePerformance,
  getHolding,
  getPortfolioAllocations,
} from "../shared/portfolio";

// Market Data Commands
export {
  searchTicker,
  syncHistoryQuotes,
  getAssetProfile,
  getAssets,
  getLatestQuotes,
  updateAssetProfile,
  deleteAsset,
  updatePricingMode,
  updateQuote,
  syncMarketData,
  deleteQuote,
  getQuoteHistory,
  getMarketDataProviders,
  getMarketDataProviderSettings,
  updateMarketDataProviderSettings,
  importManualQuotes,
} from "../shared/market-data";

// Contribution Limits Commands
export {
  getContributionLimit,
  createContributionLimit,
  updateContributionLimit,
  deleteContributionLimit,
  calculateDepositsForLimit,
} from "../shared/contribution-limits";

// Exchange Rates Commands
export {
  getExchangeRates,
  updateExchangeRate,
  addExchangeRate,
  deleteExchangeRate,
} from "../shared/exchange-rates";

// Alternative Assets Commands
export {
  createAlternativeAsset,
  updateAlternativeAssetValuation,
  deleteAlternativeAsset,
  linkLiability,
  unlinkLiability,
  getNetWorth,
  updateAlternativeAssetMetadata,
  getAlternativeHoldings,
  getNetWorthHistory,
} from "../shared/alternative-assets";

// Connect Commands (Broker + Device Sync + Auth)
export {
  syncBrokerData,
  getSyncedAccounts,
  getPlatforms,
  listBrokerConnections,
  listBrokerAccounts,
  getSubscriptionPlans,
  getSubscriptionPlansPublic,
  getUserInfo,
  getBrokerSyncStates,
  getImportRuns,
  getDeviceSyncState,
  enableDeviceSync,
  clearDeviceSyncData,
  reinitializeDeviceSync,
  getDevice,
  listDevices,
  updateDevice,
  deleteDevice,
  revokeDevice,
  resetTeamSync,
  createPairing,
  getPairing,
  approvePairing,
  completePairing,
  cancelPairing,
  claimPairing,
  getPairingMessages,
  confirmPairing,
  storeSyncSession,
  clearSyncSession,
} from "../shared/connect";

// AI Providers Commands
export {
  getAiProviders,
  updateAiProviderSettings,
  setDefaultAiProvider,
  listAiModels,
} from "../shared/ai-providers";

// AI Threads Commands
export {
  listAiThreads,
  getAiThread,
  getAiThreadMessages,
  updateAiThread,
  deleteAiThread,
  addAiThreadTag,
  removeAiThreadTag,
  getAiThreadTags,
  updateToolResult,
} from "../shared/ai-threads";

// Health Center Commands
export {
  getHealthStatus,
  runHealthChecks,
  dismissHealthIssue,
  restoreHealthIssue,
  getDismissedHealthIssues,
  executeHealthFix,
  getHealthConfig,
  updateHealthConfig,
} from "../shared/health";

// ============================================================================
// Platform-specific modules (different implementations for web vs desktop)
// ============================================================================

// AI Streaming (web-specific HTTP fetch implementation)
export { streamAiChat } from "./ai-streaming";

// Event Listeners (web-specific SSE implementation)
export {
  listenPortfolioUpdateStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenMarketSyncStart,
  listenMarketSyncComplete,
  listenFileDropHover,
  listenFileDrop,
  listenFileDropCancelled,
  listenDatabaseRestored,
  listenNavigateToRoute,
  listenDeepLink,
  listenBrokerSyncStart,
  listenBrokerSyncComplete,
  listenBrokerSyncError,
} from "./events";

// File Dialogs (web-specific implementations)
export {
  openCsvFileDialog,
  openFolderDialog,
  openDatabaseFileDialog,
  openFileSaveDialog,
  openUrlInBrowser,
} from "./files";

// Settings Commands (web-specific API for backups and updates)
export {
  getSettings,
  updateSettings,
  isAutoUpdateCheckEnabled,
  backupDatabase,
  backupDatabaseToPath,
  restoreDatabase,
  getAppInfo,
  checkForUpdates,
  installUpdate,
  getPlatform,
} from "./settings";

// Addon Commands (web-specific implementations)
export {
  extractAddonZip,
  installAddonZip,
  installAddonFile,
  listInstalledAddons,
  toggleAddon,
  uninstallAddon,
  loadAddonForRuntime,
  getEnabledAddonsOnStartup,
  getInstalledAddons,
  loadAddon,
  extractAddon,
  installAddon,
  getEnabledAddons,
  checkAddonUpdate,
  checkAllAddonUpdates,
  updateAddon,
  downloadAddonForReview,
  installFromStaging,
  clearAddonStaging,
  getAddonRatings,
  submitAddonRating,
  fetchAddonStoreListings,
} from "./addons";

// Crypto Commands (web stubs - not available in web mode)
export {
  syncGenerateRootKey,
  syncDeriveDek,
  syncGenerateKeypair,
  syncComputeSharedSecret,
  syncDeriveSessionKey,
  syncEncrypt,
  syncDecrypt,
  syncGeneratePairingCode,
  syncHashPairingCode,
  syncComputeSas,
  syncGenerateDeviceId,
} from "./crypto";
