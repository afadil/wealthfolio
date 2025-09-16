const API_PREFIX = "/api/v1";

type CommandMap = Record<string, { method: string; path: string }>;

const COMMANDS: CommandMap = {
  get_accounts: { method: "GET", path: "/accounts" },
  create_account: { method: "POST", path: "/accounts" },
  update_account: { method: "PUT", path: "/accounts" },
  delete_account: { method: "DELETE", path: "/accounts" },
  get_settings: { method: "GET", path: "/settings" },
  update_settings: { method: "PUT", path: "/settings" },
  get_holdings: { method: "GET", path: "/holdings" },
  get_historical_valuations: { method: "GET", path: "/valuations/history" },
  get_latest_valuations: { method: "GET", path: "/valuations/latest" },
  update_portfolio: { method: "POST", path: "/portfolio/update" },
  recalculate_portfolio: { method: "POST", path: "/portfolio/recalculate" },
  // Performance
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
  get_asset_profile: { method: "GET", path: "/assets/profile" },
  update_asset_profile: { method: "PUT", path: "/assets/profile" },
  update_asset_data_source: { method: "PUT", path: "/assets/data-source" },
  // Market data
  search_symbol: { method: "GET", path: "/market-data/search" },
  get_quote_history: { method: "GET", path: "/market-data/quotes/history" },
  update_quote: { method: "PUT", path: "/market-data/quotes" },
  delete_quote: { method: "DELETE", path: "/market-data/quotes/id" },
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
  download_addon_to_staging: { method: "POST", path: "/addons/store/staging/download" },
  install_addon_from_staging: { method: "POST", path: "/addons/store/install-from-staging" },
  clear_addon_staging: { method: "DELETE", path: "/addons/store/staging" },
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
  }

  const res = await fetch(url, {
    method: config.method,
    headers: { "Content-Type": "application/json" },
    body,
  });
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
