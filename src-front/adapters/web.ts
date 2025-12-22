import { getAuthToken, notifyUnauthorized } from "@/lib/auth-token";
import type { EventCallback, UnlistenFn } from "./tauri";

const API_PREFIX = "/api/v1";
const EVENTS_ENDPOINT = `${API_PREFIX}/events/stream`;

type CommandMap = Record<string, { method: string; path: string }>;

const COMMANDS: CommandMap = {
  get_accounts: { method: "GET", path: "/accounts" },
  create_account: { method: "POST", path: "/accounts" },
  update_account: { method: "PUT", path: "/accounts" },
  delete_account: { method: "DELETE", path: "/accounts" },
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
  update_asset_data_source: { method: "PUT", path: "/assets/data-source" },
  // Market data
  search_symbol: { method: "GET", path: "/market-data/search" },
  get_quote_history: { method: "GET", path: "/market-data/quotes/history" },
  get_latest_quotes: { method: "POST", path: "/market-data/quotes/latest" },
  update_quote: { method: "PUT", path: "/market-data/quotes" },
  delete_quote: { method: "DELETE", path: "/market-data/quotes/id" },
  import_quotes_csv: { method: "POST", path: "/market-data/quotes/import" },
  synch_quotes: { method: "POST", path: "/market-data/sync/history" },
  sync_market_data: { method: "POST", path: "/market-data/sync" },
  // Secrets
  set_secret: { method: "POST", path: "/secrets" },
  get_secret: { method: "GET", path: "/secrets" },
  delete_secret: { method: "DELETE", path: "/secrets" },
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
  // Sync (web mode returns not implemented stub)
  get_sync_status: { method: "GET", path: "/sync/status" },
  generate_pairing_payload: { method: "POST", path: "/sync/generate-pairing-payload" },
  pair_and_sync: { method: "POST", path: "/sync/pair-and-sync" },
  force_full_sync_with_peer: { method: "POST", path: "/sync/force-full" },
  sync_now: { method: "POST", path: "/sync/sync-now" },
  initialize_sync_for_existing_data: { method: "POST", path: "/sync/initialize-existing" },
  probe_local_network_access: { method: "POST", path: "/sync/probe" },
};

export const invokeWeb = async <T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> => {
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
    case "update_asset_data_source": {
      const { id, dataSource } = payload as { id: string; dataSource: string };
      url += `/${encodeURIComponent(id)}`;
      body = JSON.stringify({ dataSource });
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
      const { symbols } = payload as { symbols: string[] };
      body = JSON.stringify({ symbols });
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
      const { providerId, secret } = payload as { providerId: string; secret: string };
      body = JSON.stringify({ providerId, secret });
      break;
    }
    case "get_secret": {
      const { providerId } = payload as { providerId: string };
      const params = new URLSearchParams();
      params.set("providerId", providerId);
      url += `?${params.toString()}`;
      break;
    }
    case "delete_secret": {
      const { providerId } = payload as { providerId: string };
      const params = new URLSearchParams();
      params.set("providerId", providerId);
      url += `?${params.toString()}`;
      break;
    }
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
    case "pair_and_sync":
    case "force_full_sync_with_peer": {
      const { payload: syncPayload } = payload as { payload: string };
      body = JSON.stringify({ payload: syncPayload });
      break;
    }
    case "sync_now": {
      const { payload: syncPayload } = payload as { payload: Record<string, unknown> };
      body = JSON.stringify({ payload: syncPayload });
      break;
    }
    case "probe_local_network_access": {
      const { host, port } = payload as { host: string; port: number };
      body = JSON.stringify({ host, port });
      break;
    }
    case "generate_pairing_payload":
    case "get_sync_status":
    case "initialize_sync_for_existing_data":
      break;
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
  if (res.status === 401) {
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
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
};

export const logger = {
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.warn(...args),
  debug: (...args: unknown[]) => console.warn(...args),
  trace: (...args: unknown[]) => console.warn(...args),
};

class ServerEventBridge {
  private eventSource: EventSource | null = null;
  private readonly listeners = new Map<string, Set<EventCallback<unknown>>>();
  private readonly eventHandlers = new Map<string, EventListener>();
  private nextEventId = 0;

  constructor(private readonly url: string) {}

  async listen<T>(eventName: string, handler: EventCallback<T>): Promise<UnlistenFn> {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      throw new Error("EventSource is not available in this environment.");
    }
    this.ensureConnection();
    this.addListener(eventName, handler as EventCallback<unknown>);
    return async () => {
      this.removeListener(eventName, handler as EventCallback<unknown>);
    };
  }

  private ensureConnection() {
    if (this.eventSource) {
      return;
    }
    const eventUrl = this.buildEventUrl();
    this.eventSource = new EventSource(eventUrl);
    this.eventSource.onerror = (error) => {
      logger.warn("Portfolio event stream error", error);
    };
  }

  private buildEventUrl(): string {
    const token = getAuthToken();
    if (!token) {
      return this.url;
    }

    const separator = this.url.includes("?") ? "&" : "?";
    return `${this.url}${separator}access_token=${encodeURIComponent(token)}`;
  }

  private addListener(eventName: string, handler: EventCallback<unknown>) {
    const listeners = this.listeners.get(eventName) ?? new Set<EventCallback<unknown>>();
    listeners.add(handler);
    this.listeners.set(eventName, listeners);

    if (!this.eventHandlers.has(eventName) && this.eventSource) {
      const listener = (event: MessageEvent) => {
        const payload = this.parsePayload(event.data);
        this.emit(eventName, payload);
      };
      this.eventSource.addEventListener(eventName, listener as EventListener);
      this.eventHandlers.set(eventName, listener as EventListener);
    }
  }

  private removeListener(eventName: string, handler: EventCallback<unknown>) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }
    listeners.delete(handler);
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
      const registered = this.eventHandlers.get(eventName);
      if (registered && this.eventSource) {
        this.eventSource.removeEventListener(eventName, registered);
      }
      this.eventHandlers.delete(eventName);
    }

    if (this.listeners.size === 0) {
      this.teardown();
    }
  }

  private teardown() {
    if (!this.eventSource) {
      return;
    }
    this.eventHandlers.forEach((handler, name) => {
      this.eventSource?.removeEventListener(name, handler);
    });
    this.eventHandlers.clear();
    this.eventSource.close();
    this.eventSource = null;
  }

  private parsePayload(raw: string | null): unknown {
    if (raw === null || raw === undefined || raw.length === 0 || raw === "null") {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return raw;
    }
  }

  private emit(eventName: string, payload: unknown) {
    const listeners = this.listeners.get(eventName);
    if (!listeners || listeners.size === 0) {
      return;
    }
    const eventObject = {
      event: eventName,
      id: ++this.nextEventId,
      payload,
      windowLabel: undefined,
    };
    listeners.forEach((listener) => {
      listener(eventObject as Parameters<EventCallback<unknown>>[0]);
    });
  }
}

const portfolioEventBridge = new ServerEventBridge(EVENTS_ENDPOINT);

export const listenPortfolioUpdateStartWeb = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("portfolio:update-start", handler);
};

export const listenPortfolioUpdateCompleteWeb = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("portfolio:update-complete", handler);
};

export const listenPortfolioUpdateErrorWeb = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("portfolio:update-error", handler);
};

export const listenMarketSyncStartWeb = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("market:sync-start", handler);
};

export const listenMarketSyncCompleteWeb = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return portfolioEventBridge.listen("market:sync-complete", handler);
};

// Helpers
function toBase64(data: Uint8Array | number[]): string {
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

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
