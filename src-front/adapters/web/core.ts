// Web adapter core - Internal invoke function, COMMANDS map, and helpers
// This module exports invoke, logger, and platform constants for shared modules

import { getAuthToken, notifyUnauthorized } from "@/lib/auth-token";
import type { Logger } from "../types";

/** True when running in the desktop (Tauri) environment */
export const isDesktop = false;

/** True when running in the web environment */
export const isWeb = true;

export const API_PREFIX = "/api/v1";
export const EVENTS_ENDPOINT = `${API_PREFIX}/events/stream`;
export const AI_CHAT_STREAM_ENDPOINT = `${API_PREFIX}/ai/chat/stream`;

type CommandMap = Record<string, { method: string; path: string }>;

export const COMMANDS: CommandMap = {
  get_accounts: { method: "GET", path: "/accounts" },
  create_account: { method: "POST", path: "/accounts" },
  update_account: { method: "PUT", path: "/accounts" },
  delete_account: { method: "DELETE", path: "/accounts" },
  switch_tracking_mode: { method: "POST", path: "/accounts" },
  get_settings: { method: "GET", path: "/settings" },
  update_settings: { method: "PUT", path: "/settings" },
  is_auto_update_check_enabled: { method: "GET", path: "/settings/auto-update-enabled" },
  get_app_info: { method: "GET", path: "/app/info" },
  check_update: { method: "GET", path: "/app/check-update" },
  backup_database: { method: "POST", path: "/utilities/database/backup" },
  backup_database_to_path: { method: "POST", path: "/utilities/database/backup-to-path" },
  restore_database: { method: "POST", path: "/utilities/database/restore" },
  get_holdings: { method: "GET", path: "/holdings" },
  get_holding: { method: "GET", path: "/holdings/item" },
  get_historical_valuations: { method: "GET", path: "/valuations/history" },
  get_latest_valuations: { method: "GET", path: "/valuations/latest" },
  get_portfolio_allocations: { method: "GET", path: "/allocations" },
  // Snapshot management
  get_snapshots: { method: "GET", path: "/snapshots" },
  get_snapshot_by_date: { method: "GET", path: "/snapshots/holdings" },
  delete_snapshot: { method: "DELETE", path: "/snapshots" },
  save_manual_holdings: { method: "POST", path: "/snapshots" },
  import_holdings_csv: { method: "POST", path: "/snapshots/import" },
  update_portfolio: { method: "POST", path: "/portfolio/update" },
  recalculate_portfolio: { method: "POST", path: "/portfolio/recalculate" },
  // Performance
  calculate_accounts_simple_performance: { method: "POST", path: "/performance/accounts/simple" },
  calculate_performance_history: { method: "POST", path: "/performance/history" },
  calculate_performance_summary: { method: "POST", path: "/performance/summary" },
  get_income_summary: { method: "GET", path: "/income/summary" },
  // Goals
  get_goals: { method: "GET", path: "/goals" },
  create_goal: { method: "POST", path: "/goals" },
  update_goal: { method: "PUT", path: "/goals" },
  delete_goal: { method: "DELETE", path: "/goals" },
  update_goal_allocations: { method: "POST", path: "/goals/allocations" },
  load_goals_allocations: { method: "GET", path: "/goals/allocations" },
  // FX
  get_latest_exchange_rates: { method: "GET", path: "/exchange-rates/latest" },
  update_exchange_rate: { method: "PUT", path: "/exchange-rates" },
  add_exchange_rate: { method: "POST", path: "/exchange-rates" },
  delete_exchange_rate: { method: "DELETE", path: "/exchange-rates" },
  // Activities
  search_activities: { method: "POST", path: "/activities/search" },
  create_activity: { method: "POST", path: "/activities" },
  update_activity: { method: "PUT", path: "/activities" },
  save_activities: { method: "POST", path: "/activities/bulk" },
  delete_activity: { method: "DELETE", path: "/activities" },
  // Activity import
  check_activities_import: { method: "POST", path: "/activities/import/check" },
  import_activities: { method: "POST", path: "/activities/import" },
  get_account_import_mapping: { method: "GET", path: "/activities/import/mapping" },
  save_account_import_mapping: { method: "POST", path: "/activities/import/mapping" },
  // Market data providers
  get_market_data_providers: { method: "GET", path: "/providers" },
  get_market_data_providers_settings: { method: "GET", path: "/providers/settings" },
  update_market_data_provider_settings: { method: "PUT", path: "/providers/settings" },
  // Contribution limits
  get_contribution_limits: { method: "GET", path: "/limits" },
  create_contribution_limit: { method: "POST", path: "/limits" },
  update_contribution_limit: { method: "PUT", path: "/limits" },
  delete_contribution_limit: { method: "DELETE", path: "/limits" },
  calculate_deposits_for_contribution_limit: { method: "GET", path: "/limits" },
  // Asset profile
  get_assets: { method: "GET", path: "/assets" },
  delete_asset: { method: "DELETE", path: "/assets" },
  get_asset_profile: { method: "GET", path: "/assets/profile" },
  update_asset_profile: { method: "PUT", path: "/assets/profile" },
  update_pricing_mode: { method: "PUT", path: "/assets/pricing-mode" },
  // Market data
  search_symbol: { method: "GET", path: "/market-data/search" },
  get_quote_history: { method: "GET", path: "/market-data/quotes/history" },
  get_latest_quotes: { method: "POST", path: "/market-data/quotes/latest" },
  update_quote: { method: "PUT", path: "/market-data/quotes" },
  delete_quote: { method: "DELETE", path: "/market-data/quotes/id" },
  check_quotes_import: { method: "POST", path: "/market-data/quotes/check" },
  import_quotes_csv: { method: "POST", path: "/market-data/quotes/import" },
  synch_quotes: { method: "POST", path: "/market-data/sync/history" },
  sync_market_data: { method: "POST", path: "/market-data/sync" },
  // Secrets
  set_secret: { method: "POST", path: "/secrets" },
  get_secret: { method: "GET", path: "/secrets" },
  delete_secret: { method: "DELETE", path: "/secrets" },
  // Taxonomies
  get_taxonomies: { method: "GET", path: "/taxonomies" },
  get_taxonomy: { method: "GET", path: "/taxonomies" },
  create_taxonomy: { method: "POST", path: "/taxonomies" },
  update_taxonomy: { method: "PUT", path: "/taxonomies" },
  delete_taxonomy: { method: "DELETE", path: "/taxonomies" },
  create_category: { method: "POST", path: "/taxonomies/categories" },
  update_category: { method: "PUT", path: "/taxonomies/categories" },
  delete_category: { method: "DELETE", path: "/taxonomies" },
  move_category: { method: "POST", path: "/taxonomies/categories/move" },
  import_taxonomy_json: { method: "POST", path: "/taxonomies/import" },
  export_taxonomy_json: { method: "GET", path: "/taxonomies" },
  get_asset_taxonomy_assignments: { method: "GET", path: "/taxonomies/assignments/asset" },
  assign_asset_to_category: { method: "POST", path: "/taxonomies/assignments" },
  remove_asset_taxonomy_assignment: { method: "DELETE", path: "/taxonomies/assignments" },
  get_migration_status: { method: "GET", path: "/taxonomies/migration/status" },
  migrate_legacy_classifications: { method: "POST", path: "/taxonomies/migration/run" },
  // Addons
  list_installed_addons: { method: "GET", path: "/addons/installed" },
  install_addon_zip: { method: "POST", path: "/addons/install-zip" },
  toggle_addon: { method: "POST", path: "/addons/toggle" },
  uninstall_addon: { method: "DELETE", path: "/addons" },
  load_addon_for_runtime: { method: "GET", path: "/addons/runtime" },
  get_enabled_addons_on_startup: { method: "GET", path: "/addons/enabled-on-startup" },
  extract_addon_zip: { method: "POST", path: "/addons/extract" },
  // Addon store + staging
  fetch_addon_store_listings: { method: "GET", path: "/addons/store/listings" },
  submit_addon_rating: { method: "POST", path: "/addons/store/ratings" },
  get_addon_ratings: { method: "GET", path: "/addons/store/ratings" },
  check_addon_update: { method: "POST", path: "/addons/store/check-update" },
  check_all_addon_updates: { method: "POST", path: "/addons/store/check-all" },
  update_addon_from_store_by_id: { method: "POST", path: "/addons/store/update" },
  download_addon_to_staging: { method: "POST", path: "/addons/store/staging/download" },
  install_addon_from_staging: { method: "POST", path: "/addons/store/install-from-staging" },
  clear_addon_staging: { method: "DELETE", path: "/addons/store/staging" },
  // Device Sync - Device management
  register_device: { method: "POST", path: "/sync/device/register" },
  get_device: { method: "GET", path: "/sync/device" },
  list_devices: { method: "GET", path: "/sync/devices" },
  update_device: { method: "PATCH", path: "/sync/device" },
  delete_device: { method: "DELETE", path: "/sync/device" },
  revoke_device: { method: "POST", path: "/sync/device" },
  // Device Sync - Team keys (E2EE)
  initialize_team_keys: { method: "POST", path: "/sync/keys/initialize" },
  commit_initialize_team_keys: { method: "POST", path: "/sync/keys/initialize/commit" },
  rotate_team_keys: { method: "POST", path: "/sync/keys/rotate" },
  commit_rotate_team_keys: { method: "POST", path: "/sync/keys/rotate/commit" },
  reset_team_sync: { method: "POST", path: "/sync/team/reset" },
  // Device Sync - Pairing (Issuer - Trusted Device)
  create_pairing: { method: "POST", path: "/sync/pairing" },
  get_pairing: { method: "GET", path: "/sync/pairing" },
  approve_pairing: { method: "POST", path: "/sync/pairing" },
  complete_pairing: { method: "POST", path: "/sync/pairing" },
  cancel_pairing: { method: "POST", path: "/sync/pairing" },
  // Device Sync - Pairing (Claimer - New Device)
  claim_pairing: { method: "POST", path: "/sync/pairing/claim" },
  get_pairing_messages: { method: "GET", path: "/sync/pairing" },
  confirm_pairing: { method: "POST", path: "/sync/pairing" },
  // Wealthfolio Connect (Broker Sync)
  store_sync_session: { method: "POST", path: "/connect/session" },
  clear_sync_session: { method: "DELETE", path: "/connect/session" },
  get_sync_session_status: { method: "GET", path: "/connect/session/status" },
  list_broker_connections: { method: "GET", path: "/connect/connections" },
  list_broker_accounts: { method: "GET", path: "/connect/accounts" },
  sync_broker_data: { method: "POST", path: "/connect/sync" },
  sync_broker_connections: { method: "POST", path: "/connect/sync/connections" },
  sync_broker_accounts: { method: "POST", path: "/connect/sync/accounts" },
  sync_broker_activities: { method: "POST", path: "/connect/sync/activities" },
  get_subscription_plans: { method: "GET", path: "/connect/plans" },
  get_subscription_plans_public: { method: "GET", path: "/connect/plans/public" },
  get_user_info: { method: "GET", path: "/connect/user" },
  // Local data queries (from local database)
  get_synced_accounts: { method: "GET", path: "/connect/synced-accounts" },
  get_platforms: { method: "GET", path: "/connect/platforms" },
  get_broker_sync_states: { method: "GET", path: "/connect/sync-states" },
  get_import_runs: { method: "GET", path: "/connect/import-runs" },
  // Device Sync / Enrollment
  get_device_sync_state: { method: "GET", path: "/connect/device/sync-state" },
  enable_device_sync: { method: "POST", path: "/connect/device/enable" },
  clear_device_sync_data: { method: "DELETE", path: "/connect/device/sync-data" },
  reinitialize_device_sync: { method: "POST", path: "/connect/device/reinitialize" },
  // Net Worth
  get_net_worth: { method: "GET", path: "/net-worth" },
  get_net_worth_history: { method: "GET", path: "/net-worth/history" },
  // AI Providers
  get_ai_providers: { method: "GET", path: "/ai/providers" },
  update_ai_provider_settings: { method: "PUT", path: "/ai/providers/settings" },
  set_default_ai_provider: { method: "POST", path: "/ai/providers/default" },
  list_ai_models: { method: "GET", path: "/ai/providers" },
  // AI Threads
  list_ai_threads: { method: "GET", path: "/ai/threads" },
  get_ai_thread: { method: "GET", path: "/ai/threads" },
  get_ai_thread_messages: { method: "GET", path: "/ai/threads" },
  update_ai_thread: { method: "PUT", path: "/ai/threads" },
  delete_ai_thread: { method: "DELETE", path: "/ai/threads" },
  add_ai_thread_tag: { method: "POST", path: "/ai/threads" },
  remove_ai_thread_tag: { method: "DELETE", path: "/ai/threads" },
  get_ai_thread_tags: { method: "GET", path: "/ai/threads" },
  update_tool_result: { method: "PATCH", path: "/ai/tool-result" },
  // Alternative Assets
  create_alternative_asset: { method: "POST", path: "/alternative-assets" },
  update_alternative_asset_valuation: { method: "PUT", path: "/alternative-assets" },
  delete_alternative_asset: { method: "DELETE", path: "/alternative-assets" },
  link_liability: { method: "POST", path: "/alternative-assets" },
  unlink_liability: { method: "DELETE", path: "/alternative-assets" },
  update_alternative_asset_metadata: { method: "PUT", path: "/alternative-assets" },
  get_alternative_holdings: { method: "GET", path: "/alternative-holdings" },
};

/**
 * Logger implementation using console
 */
export const logger: Logger = {
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.info(...args),
  debug: (...args: unknown[]) => console.debug(...args),
  trace: (...args: unknown[]) => console.trace(...args),
};

/**
 * Convert Uint8Array or number[] to base64 string
 */
export function toBase64(data: Uint8Array | number[]): string {
  const bytes = Array.isArray(data) ? new Uint8Array(data) : data;
  // Fast base64 encoding without TextEncoder for binary
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa expects binary string
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Invoke a command via REST API (internal - use typed adapter functions instead)
 */
export const invoke = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  const config = COMMANDS[command];
  if (!config) throw new Error(`Unsupported command ${command}`);
  let url = `${API_PREFIX}${config.path}`;
  let body: BodyInit | undefined;

  switch (command) {
    case "update_account": {
      const data = payload as { accountUpdate: { id: string } & Record<string, unknown> };
      url += `/${data.accountUpdate.id}`;
      body = JSON.stringify(data.accountUpdate);
      break;
    }
    case "delete_account": {
      const data = payload as { accountId: string };
      url += `/${data.accountId}`;
      break;
    }
    case "switch_tracking_mode": {
      const { accountId, newMode } = payload as { accountId: string; newMode: string };
      url += `/${accountId}/switch-tracking-mode`;
      body = JSON.stringify({ newMode });
      break;
    }
    case "create_account": {
      const data = payload as { account: Record<string, unknown> };
      body = JSON.stringify(data.account);
      break;
    }
    case "backup_database_to_path": {
      const { backupDir } = payload as { backupDir: string };
      body = JSON.stringify({ backupDir });
      break;
    }
    case "restore_database": {
      const { backupFilePath } = payload as { backupFilePath: string };
      body = JSON.stringify({ backupFilePath });
      break;
    }
    case "update_settings": {
      const data = payload as { settingsUpdate: Record<string, unknown> };
      body = JSON.stringify(data.settingsUpdate);
      break;
    }
    case "get_holdings": {
      const p = payload as { accountId: string };
      url += `?accountId=${encodeURIComponent(p.accountId)}`;
      break;
    }
    case "get_holding": {
      const { accountId, assetId } = payload as { accountId: string; assetId: string };
      const params = new URLSearchParams();
      params.set("accountId", accountId);
      params.set("assetId", assetId);
      url += `?${params.toString()}`;
      break;
    }
    case "get_historical_valuations": {
      const p = payload as { accountId?: string; startDate?: string; endDate?: string };
      const params = new URLSearchParams();
      if (p?.accountId) params.set("accountId", p.accountId);
      if (p?.startDate) params.set("startDate", p.startDate);
      if (p?.endDate) params.set("endDate", p.endDate);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      break;
    }
    case "get_latest_valuations": {
      const p = payload as { accountIds?: string[] };
      const params = new URLSearchParams();
      if (Array.isArray(p?.accountIds)) {
        for (const id of p.accountIds) params.append("accountIds[]", id);
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      break;
    }
    case "get_portfolio_allocations": {
      const { accountId } = payload as { accountId: string };
      const params = new URLSearchParams();
      params.set("accountId", accountId);
      url += `?${params.toString()}`;
      break;
    }
    // Snapshot management
    case "get_snapshots": {
      const { accountId, dateFrom, dateTo } = payload as {
        accountId: string;
        dateFrom?: string;
        dateTo?: string;
      };
      const params = new URLSearchParams();
      params.set("accountId", accountId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      url += `?${params.toString()}`;
      break;
    }
    case "get_snapshot_by_date": {
      const { accountId, date } = payload as { accountId: string; date: string };
      const params = new URLSearchParams();
      params.set("accountId", accountId);
      params.set("date", date);
      url += `?${params.toString()}`;
      break;
    }
    case "delete_snapshot": {
      const { accountId, date } = payload as { accountId: string; date: string };
      const params = new URLSearchParams();
      params.set("accountId", accountId);
      params.set("date", date);
      url += `?${params.toString()}`;
      break;
    }
    case "save_manual_holdings": {
      const { accountId, holdings, cashBalances, snapshotDate } = payload as {
        accountId: string;
        holdings: unknown[];
        cashBalances: Record<string, string>;
        snapshotDate?: string;
      };
      body = JSON.stringify({ accountId, holdings, cashBalances, snapshotDate });
      break;
    }
    case "import_holdings_csv": {
      const { accountId, snapshots } = payload as {
        accountId: string;
        snapshots: unknown[];
      };
      body = JSON.stringify({ accountId, snapshots });
      break;
    }
    case "calculate_accounts_simple_performance": {
      const { accountIds } = (payload ?? {}) as { accountIds?: string[] };
      body = JSON.stringify({ accountIds });
      break;
    }
    case "get_accounts":
      break;
    case "calculate_performance_history": {
      const { itemType, itemId, startDate, endDate } = payload as {
        itemType: string;
        itemId: string;
        startDate?: string;
        endDate?: string;
      };
      body = JSON.stringify({ itemType, itemId, startDate, endDate });
      break;
    }
    case "calculate_performance_summary": {
      const { itemType, itemId, startDate, endDate } = payload as {
        itemType: string;
        itemId: string;
        startDate?: string;
        endDate?: string;
      };
      body = JSON.stringify({ itemType, itemId, startDate, endDate });
      break;
    }
    case "check_update": {
      const { currentVersion, target, arch } = (payload ?? {}) as {
        currentVersion?: string;
        target?: string;
        arch?: string;
      };
      const params = new URLSearchParams();
      if (currentVersion) params.set("currentVersion", currentVersion);
      if (target) params.set("target", target);
      if (arch) params.set("arch", arch);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      break;
    }
    case "get_income_summary":
      break;
    case "delete_goal": {
      const { goalId } = payload as { goalId: string };
      url += `/${encodeURIComponent(goalId)}`;
      break;
    }
    case "create_goal": {
      const { goal } = payload as { goal: Record<string, unknown> };
      body = JSON.stringify(goal);
      break;
    }
    case "update_goal": {
      const { goal } = payload as { goal: Record<string, unknown> };
      body = JSON.stringify(goal);
      break;
    }
    case "update_goal_allocations": {
      const { allocations } = payload as { allocations: Record<string, unknown> };
      body = JSON.stringify(allocations);
      break;
    }
    case "update_exchange_rate": {
      const { rate } = payload as { rate: Record<string, unknown> };
      body = JSON.stringify(rate);
      break;
    }
    case "add_exchange_rate": {
      const { newRate } = payload as { newRate: Record<string, unknown> };
      body = JSON.stringify(newRate);
      break;
    }
    case "delete_exchange_rate": {
      const { rateId } = payload as { rateId: string };
      url += `/${encodeURIComponent(rateId)}`;
      break;
    }
    case "synch_quotes":
      break;
    case "search_activities": {
      body = JSON.stringify(payload);
      break;
    }
    case "create_activity": {
      const { activity } = payload as { activity: Record<string, unknown> };
      body = JSON.stringify(activity);
      break;
    }
    case "update_activity": {
      const { activity } = payload as { activity: Record<string, unknown> };
      body = JSON.stringify(activity);
      break;
    }
    case "save_activities": {
      const { request } = payload as { request: Record<string, unknown> };
      body = JSON.stringify(request);
      break;
    }
    case "delete_activity": {
      const { activityId } = payload as { activityId: string };
      url += `/${encodeURIComponent(activityId)}`;
      break;
    }
    case "check_activities_import":
    case "import_activities": {
      body = JSON.stringify(payload);
      break;
    }
    case "get_account_import_mapping": {
      const { accountId } = payload as { accountId: string };
      const params = new URLSearchParams();
      params.set("accountId", accountId);
      url += `?${params.toString()}`;
      break;
    }
    case "save_account_import_mapping": {
      const { mapping } = payload as { mapping: Record<string, unknown> };
      body = JSON.stringify({ mapping });
      break;
    }
    case "update_market_data_provider_settings": {
      body = JSON.stringify(payload);
      break;
    }
    case "create_contribution_limit": {
      const { newLimit } = payload as { newLimit: Record<string, unknown> };
      body = JSON.stringify(newLimit);
      break;
    }
    case "update_contribution_limit": {
      const { id, updatedLimit } = payload as { id: string; updatedLimit: Record<string, unknown> };
      url += `/${encodeURIComponent(id)}`;
      body = JSON.stringify(updatedLimit);
      break;
    }
    case "delete_contribution_limit": {
      const { id } = payload as { id: string };
      url += `/${encodeURIComponent(id)}`;
      break;
    }
    case "delete_asset": {
      const { id } = payload as { id: string };
      url += `/${encodeURIComponent(id)}`;
      break;
    }
    case "calculate_deposits_for_contribution_limit": {
      const { limitId } = payload as { limitId: string };
      url += `/${encodeURIComponent(limitId)}/deposits`;
      break;
    }
    case "get_asset_profile": {
      const { assetId } = payload as { assetId: string };
      const params = new URLSearchParams();
      params.set("assetId", assetId);
      url += `?${params.toString()}`;
      break;
    }
    case "update_asset_profile": {
      const { id, payload: bodyPayload } = payload as {
        id: string;
        payload: Record<string, unknown>;
      };
      url += `/${encodeURIComponent(id)}`;
      body = JSON.stringify(bodyPayload);
      break;
    }
    case "update_pricing_mode": {
      const { id, pricingMode } = payload as { id: string; pricingMode: string };
      url += `/${encodeURIComponent(id)}`;
      body = JSON.stringify({ pricing_mode: pricingMode });
      break;
    }
    case "search_symbol": {
      const { query } = payload as { query: string };
      const params = new URLSearchParams();
      params.set("query", query);
      url += `?${params.toString()}`;
      break;
    }
    case "get_quote_history": {
      const { symbol } = payload as { symbol: string };
      const params = new URLSearchParams();
      params.set("symbol", symbol);
      url += `?${params.toString()}`;
      break;
    }
    case "get_latest_quotes": {
      const { assetIds } = payload as { assetIds: string[] };
      body = JSON.stringify({ assetIds });
      break;
    }
    case "update_quote": {
      const { symbol, quote } = payload as { symbol: string; quote: Record<string, unknown> };
      url += `/${encodeURIComponent(symbol)}`;
      body = JSON.stringify(quote);
      break;
    }
    case "delete_quote": {
      const { id } = payload as { id: string };
      url += `/${encodeURIComponent(id)}`;
      break;
    }
    case "check_quotes_import": {
      const { content, hasHeaderRow } = payload as { content: number[]; hasHeaderRow: boolean };
      body = JSON.stringify({ content, hasHeaderRow });
      break;
    }
    case "import_quotes_csv": {
      const { quotes, overwriteExisting } = payload as {
        quotes: unknown;
        overwriteExisting: boolean;
      };
      body = JSON.stringify({ quotes, overwriteExisting });
      break;
    }
    case "sync_market_data": {
      body = JSON.stringify(payload);
      break;
    }
    case "set_secret": {
      const { secretKey, secret } = payload as { secretKey: string; secret: string };
      body = JSON.stringify({ secretKey, secret });
      break;
    }
    case "get_secret": {
      const { secretKey } = payload as { secretKey: string };
      const params = new URLSearchParams();
      params.set("secretKey", secretKey);
      url += `?${params.toString()}`;
      break;
    }
    case "delete_secret": {
      const { secretKey } = payload as { secretKey: string };
      const params = new URLSearchParams();
      params.set("secretKey", secretKey);
      url += `?${params.toString()}`;
      break;
    }
    // Taxonomy commands
    case "get_taxonomies":
      break;
    case "get_taxonomy": {
      const { id } = payload as { id: string };
      url += `/${encodeURIComponent(id)}`;
      break;
    }
    case "create_taxonomy": {
      const { taxonomy } = payload as { taxonomy: Record<string, unknown> };
      body = JSON.stringify(taxonomy);
      break;
    }
    case "update_taxonomy": {
      const { taxonomy } = payload as { taxonomy: Record<string, unknown> };
      body = JSON.stringify(taxonomy);
      break;
    }
    case "delete_taxonomy": {
      const { id } = payload as { id: string };
      url += `/${encodeURIComponent(id)}`;
      break;
    }
    case "create_category": {
      const { category } = payload as { category: Record<string, unknown> };
      body = JSON.stringify(category);
      break;
    }
    case "update_category": {
      const { category } = payload as { category: Record<string, unknown> };
      body = JSON.stringify(category);
      break;
    }
    case "delete_category": {
      const { taxonomyId, categoryId } = payload as { taxonomyId: string; categoryId: string };
      url += `/${encodeURIComponent(taxonomyId)}/categories/${encodeURIComponent(categoryId)}`;
      break;
    }
    case "move_category": {
      const { taxonomyId, categoryId, newParentId, position } = payload as {
        taxonomyId: string;
        categoryId: string;
        newParentId: string | null;
        position: number;
      };
      body = JSON.stringify({ taxonomyId, categoryId, newParentId, position });
      break;
    }
    case "import_taxonomy_json": {
      const { jsonStr } = payload as { jsonStr: string };
      body = JSON.stringify({ jsonStr });
      break;
    }
    case "export_taxonomy_json": {
      const { id } = payload as { id: string };
      url += `/${encodeURIComponent(id)}/export`;
      break;
    }
    case "get_asset_taxonomy_assignments": {
      const { assetId } = payload as { assetId: string };
      url += `/${encodeURIComponent(assetId)}`;
      break;
    }
    case "assign_asset_to_category": {
      const { assignment } = payload as { assignment: Record<string, unknown> };
      body = JSON.stringify(assignment);
      break;
    }
    case "remove_asset_taxonomy_assignment": {
      const { id } = payload as { id: string };
      url += `/${encodeURIComponent(id)}`;
      break;
    }
    case "get_migration_status":
      break;
    case "migrate_legacy_classifications":
      break;
    // Addons
    case "install_addon_zip": {
      const { zipData, enableAfterInstall } = payload as {
        zipData: Uint8Array | number[];
        enableAfterInstall?: boolean;
      };
      // Send compact base64 payload to avoid gigantic JSON arrays of numbers
      const zipDataB64 = toBase64(zipData);
      body = JSON.stringify({ zipDataB64, enableAfterInstall });
      break;
    }
    case "toggle_addon": {
      const { addonId, enabled } = payload as { addonId: string; enabled: boolean };
      body = JSON.stringify({ addonId, enabled });
      break;
    }
    case "uninstall_addon": {
      const { addonId } = payload as { addonId: string };
      url += `/${encodeURIComponent(addonId)}`;
      break;
    }
    case "load_addon_for_runtime": {
      const { addonId } = payload as { addonId: string };
      url += `/${encodeURIComponent(addonId)}`;
      break;
    }
    case "extract_addon_zip": {
      const { zipData } = payload as { zipData: Uint8Array | number[] };
      const zipDataB64 = toBase64(zipData);
      body = JSON.stringify({ zipDataB64 });
      break;
    }
    case "check_addon_update":
    case "update_addon_from_store_by_id": {
      const { addonId } = payload as { addonId: string };
      body = JSON.stringify({ addonId });
      break;
    }
    case "check_all_addon_updates":
      break;
    case "download_addon_to_staging": {
      const { addonId } = payload as { addonId: string };
      body = JSON.stringify({ addonId });
      break;
    }
    case "install_addon_from_staging": {
      const { addonId, enableAfterInstall } = payload as {
        addonId: string;
        enableAfterInstall?: boolean;
      };
      body = JSON.stringify({ addonId, enableAfterInstall });
      break;
    }
    case "clear_addon_staging": {
      const { addonId } = (payload ?? {}) as { addonId?: string };
      if (addonId) {
        const params = new URLSearchParams();
        params.set("addonId", addonId);
        url += `?${params.toString()}`;
      }
      break;
    }
    case "submit_addon_rating": {
      const { addonId, rating, review } = payload as {
        addonId: string;
        rating: number;
        review?: string;
      };
      body = JSON.stringify({ addonId, rating, review });
      break;
    }
    case "get_addon_ratings": {
      const { addonId } = payload as { addonId: string };
      const params = new URLSearchParams();
      params.set("addonId", addonId);
      url += `?${params.toString()}`;
      break;
    }
    // Device Sync commands - Device management
    case "register_device": {
      const { displayName, instanceId } = payload as {
        displayName: string;
        instanceId: string;
      };
      // Detect platform from browser user agent
      const userAgent = navigator.userAgent.toLowerCase();
      let platform = "server"; // default fallback
      if (userAgent.includes("mac")) platform = "macos";
      else if (userAgent.includes("win")) platform = "windows";
      else if (userAgent.includes("linux") && !userAgent.includes("android")) platform = "linux";
      else if (userAgent.includes("android")) platform = "android";
      else if (userAgent.includes("iphone") || userAgent.includes("ipad")) platform = "ios";

      body = JSON.stringify({ displayName, platform, instanceId });
      break;
    }
    case "get_device": {
      const { deviceId } = (payload ?? {}) as { deviceId?: string };
      if (deviceId) {
        url += `/${encodeURIComponent(deviceId)}`;
      } else {
        url += "/current";
      }
      break;
    }
    case "update_device": {
      const { deviceId, displayName } = payload as { deviceId: string; displayName: string };
      url += `/${encodeURIComponent(deviceId)}`;
      body = JSON.stringify({ displayName });
      break;
    }
    case "delete_device": {
      const { deviceId } = payload as { deviceId: string };
      url += `/${encodeURIComponent(deviceId)}`;
      break;
    }
    case "revoke_device": {
      const { deviceId } = payload as { deviceId: string };
      url += `/${encodeURIComponent(deviceId)}/revoke`;
      break;
    }
    // Device Sync commands - Team keys (E2EE)
    case "commit_initialize_team_keys": {
      const { keyVersion, deviceKeyEnvelope, signature, challengeResponse, recoveryEnvelope } =
        payload as {
          keyVersion: number;
          deviceKeyEnvelope: string;
          signature: string;
          challengeResponse?: string;
          recoveryEnvelope?: string;
        };
      body = JSON.stringify({
        keyVersion,
        deviceKeyEnvelope,
        signature,
        challengeResponse,
        recoveryEnvelope,
      });
      break;
    }
    case "commit_rotate_team_keys": {
      const { newKeyVersion, envelopes, signature, challengeResponse } = payload as {
        newKeyVersion: number;
        envelopes: { deviceId: string; deviceKeyEnvelope: string }[];
        signature: string;
        challengeResponse?: string;
      };
      body = JSON.stringify({ newKeyVersion, envelopes, signature, challengeResponse });
      break;
    }
    case "reset_team_sync": {
      const { reason } = (payload ?? {}) as { reason?: string };
      if (reason) {
        body = JSON.stringify({ reason });
      }
      break;
    }
    // Device Sync commands - Pairing (Issuer - Trusted Device)
    case "create_pairing": {
      const { codeHash, ephemeralPublicKey } = payload as {
        codeHash: string;
        ephemeralPublicKey: string;
      };
      body = JSON.stringify({ codeHash, ephemeralPublicKey });
      break;
    }
    case "get_pairing": {
      const { pairingId } = payload as { pairingId: string };
      url += `/${encodeURIComponent(pairingId)}`;
      break;
    }
    case "approve_pairing": {
      const { pairingId } = payload as { pairingId: string };
      url += `/${encodeURIComponent(pairingId)}/approve`;
      break;
    }
    case "complete_pairing": {
      const { pairingId, encryptedKeyBundle, sasProof, signature } = payload as {
        pairingId: string;
        encryptedKeyBundle: string;
        sasProof: string | Record<string, unknown>;
        signature: string;
      };
      url += `/${encodeURIComponent(pairingId)}/complete`;
      body = JSON.stringify({ encryptedKeyBundle, sasProof, signature });
      break;
    }
    case "cancel_pairing": {
      const { pairingId } = payload as { pairingId: string };
      url += `/${encodeURIComponent(pairingId)}/cancel`;
      break;
    }
    // Claimer-side pairing commands
    case "claim_pairing": {
      const { code, ephemeralPublicKey } = payload as {
        code: string;
        ephemeralPublicKey: string;
      };
      body = JSON.stringify({ code, ephemeralPublicKey });
      break;
    }
    case "get_pairing_messages": {
      const { pairingId } = payload as { pairingId: string };
      url += `/${encodeURIComponent(pairingId)}/messages`;
      break;
    }
    case "confirm_pairing": {
      const { pairingId, proof } = payload as { pairingId: string; proof?: string };
      url += `/${encodeURIComponent(pairingId)}/confirm`;
      body = JSON.stringify({ proof });
      break;
    }
    // Wealthfolio Connect commands
    case "store_sync_session": {
      const { accessToken, refreshToken } = payload as {
        accessToken?: string;
        refreshToken: string;
      };
      body = JSON.stringify({ accessToken, refreshToken });
      break;
    }
    case "list_devices":
    case "initialize_team_keys":
    case "rotate_team_keys":
    case "clear_sync_session":
    case "get_sync_session_status":
    case "list_broker_connections":
    case "list_broker_accounts":
    case "sync_broker_data":
    case "sync_broker_connections":
    case "sync_broker_accounts":
    case "sync_broker_activities":
    case "get_subscription_plans":
    case "get_subscription_plans_public":
    case "get_user_info":
    case "get_synced_accounts":
    case "get_platforms":
    case "get_broker_sync_states":
    // Device Sync / Enrollment (falls through)
    // eslint-disable-next-line no-fallthrough
    case "get_device_sync_state":
    case "enable_device_sync":
    case "clear_device_sync_data":
    case "reinitialize_device_sync":
      break;
    case "get_import_runs": {
      const { runType, limit, offset } = (payload ?? {}) as {
        runType?: string;
        limit?: number;
        offset?: number;
      };
      const params = new URLSearchParams();
      if (runType) params.set("runType", runType);
      if (limit !== undefined) params.set("limit", String(limit));
      if (offset !== undefined) params.set("offset", String(offset));
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      break;
    }
    // Net Worth commands
    case "get_net_worth": {
      const { date } = (payload ?? {}) as { date?: string };
      if (date) {
        const params = new URLSearchParams();
        params.set("date", date);
        url += `?${params.toString()}`;
      }
      break;
    }
    case "get_net_worth_history": {
      const { startDate, endDate } = payload as { startDate: string; endDate: string };
      const params = new URLSearchParams();
      params.set("startDate", startDate);
      params.set("endDate", endDate);
      url += `?${params.toString()}`;
      break;
    }
    // Alternative Assets commands
    case "create_alternative_asset": {
      const { request } = payload as { request: Record<string, unknown> };
      body = JSON.stringify(request);
      break;
    }
    case "update_alternative_asset_valuation": {
      const { assetId, request } = payload as { assetId: string; request: Record<string, unknown> };
      url += `/${encodeURIComponent(assetId)}/valuation`;
      body = JSON.stringify(request);
      break;
    }
    case "delete_alternative_asset": {
      const { assetId } = payload as { assetId: string };
      url += `/${encodeURIComponent(assetId)}`;
      break;
    }
    case "link_liability": {
      const { liabilityId, request } = payload as {
        liabilityId: string;
        request: Record<string, unknown>;
      };
      url += `/${encodeURIComponent(liabilityId)}/link`;
      body = JSON.stringify(request);
      break;
    }
    case "unlink_liability": {
      const { liabilityId } = payload as { liabilityId: string };
      url += `/${encodeURIComponent(liabilityId)}/unlink`;
      break;
    }
    case "update_alternative_asset_metadata": {
      const { assetId, metadata } = payload as {
        assetId: string;
        metadata: Record<string, string>;
      };
      url += `/${encodeURIComponent(assetId)}/metadata`;
      body = JSON.stringify(metadata);
      break;
    }
    case "get_alternative_holdings":
      break;
    // AI Providers
    case "get_ai_providers":
      break;
    case "update_ai_provider_settings": {
      const { request } = payload as { request: Record<string, unknown> };
      body = JSON.stringify(request);
      break;
    }
    case "set_default_ai_provider": {
      const { request } = payload as { request: Record<string, unknown> };
      body = JSON.stringify(request);
      break;
    }
    case "list_ai_models": {
      const { providerId } = payload as { providerId: string };
      url += `/${encodeURIComponent(providerId)}/models`;
      break;
    }
    // AI Threads
    case "list_ai_threads": {
      const { cursor, limit, search } = (payload ?? {}) as {
        cursor?: string;
        limit?: number;
        search?: string;
      };
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (limit !== undefined) params.set("limit", String(limit));
      if (search) params.set("search", search);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      break;
    }
    case "get_ai_thread": {
      const { threadId } = payload as { threadId: string };
      url += `/${encodeURIComponent(threadId)}`;
      break;
    }
    case "get_ai_thread_messages": {
      const { threadId } = payload as { threadId: string };
      url += `/${encodeURIComponent(threadId)}/messages`;
      break;
    }
    case "update_tool_result": {
      const { request } = payload as {
        request: { threadId: string; toolCallId: string; resultPatch: unknown };
      };
      body = JSON.stringify({
        threadId: request.threadId,
        toolCallId: request.toolCallId,
        resultPatch: request.resultPatch,
      });
      break;
    }
    case "update_ai_thread": {
      const { request } = payload as {
        request: { id: string; title?: string; isPinned?: boolean };
      };
      url += `/${encodeURIComponent(request.id)}`;
      body = JSON.stringify({ title: request.title, isPinned: request.isPinned });
      break;
    }
    case "delete_ai_thread": {
      const { threadId } = payload as { threadId: string };
      url += `/${encodeURIComponent(threadId)}`;
      break;
    }
    case "add_ai_thread_tag": {
      const { threadId, tag } = payload as { threadId: string; tag: string };
      url += `/${encodeURIComponent(threadId)}/tags`;
      body = JSON.stringify({ tag });
      break;
    }
    case "remove_ai_thread_tag": {
      const { threadId, tag } = payload as { threadId: string; tag: string };
      url += `/${encodeURIComponent(threadId)}/tags/${encodeURIComponent(tag)}`;
      break;
    }
    case "get_ai_thread_tags": {
      const { threadId } = payload as { threadId: string };
      url += `/${encodeURIComponent(threadId)}/tags`;
      break;
    }
  }

  const headers: HeadersInit = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: config.method,
    headers,
    body,
  });

  // Only notify unauthorized for app auth failures, not for connect cloud token issues
  // Connect endpoints return 401 when cloud token isn't configured - that's not an app auth failure
  const connectCommands = [
    "get_subscription_plans",
    "get_user_info",
    "get_connect_portal",
    "sync_broker_connections",
    "sync_broker_accounts",
    "sync_broker_activities",
  ];
  if (res.status === 401 && !connectCommands.includes(command)) {
    notifyUnauthorized();
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      msg = (err?.message ?? msg) as string;
    } catch (_e) {
      // ignore JSON parse error from non-JSON error bodies
      void 0;
    }
    console.error(`[Invoke] Command "${command}" failed: ${msg}`);
    throw new Error(msg);
  }
  if (command === "backup_database") {
    const parsed = (await res.json()) as { filename: string; dataB64: string };
    return {
      filename: parsed.filename,
      data: fromBase64(parsed.dataB64),
    } as T;
  }
  if (command === "backup_database_to_path") {
    const parsed = (await res.json()) as { path: string };
    return parsed.path as T;
  }
  // Handle responses with no body (204 No Content, 202 Accepted)
  if (res.status === 204 || res.status === 202) {
    return undefined as T;
  }
  return (await res.json()) as T;
};
