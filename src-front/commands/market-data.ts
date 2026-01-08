import type { QuoteImport } from "@/lib/types/quote-import";
import {
  QuoteSummary,
  Asset,
  Quote,
  UpdateAssetProfile,
  MarketDataProviderInfo,
} from "@/lib/types";
import { invoke, logger } from "@/adapters";

// Provider capabilities from backend
export interface ProviderCapabilities {
  instruments: string;
  coverage: string;
  features: string[];
}

// Interface matching the backend struct
export interface MarketDataProviderSetting {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  priority: number;
  enabled: boolean;
  logoFilename: string | null;
  capabilities: ProviderCapabilities | null;
  requiresApiKey: boolean;
  hasApiKey: boolean;
  assetCount: number;
  errorCount: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  uniqueErrors: string[];
}

export const searchTicker = async (query: string): Promise<QuoteSummary[]> => {
  try {
    return await invoke("search_symbol", { query });
  } catch (error) {
    logger.error("Error searching for ticker.");
    throw error;
  }
};

export const syncHistoryQuotes = async (): Promise<void> => {
  try {
    await invoke("synch_quotes");
  } catch (error) {
    logger.error("Error syncing history quotes.");
    throw error;
  }
};

export const getAssetProfile = async (assetId: string): Promise<Asset> => {
  try {
    return await invoke("get_asset_profile", { assetId });
  } catch (error) {
    logger.error("Error loading asset data.");
    throw error;
  }
};

export const getAssets = async (): Promise<Asset[]> => {
  try {
    return await invoke("get_assets");
  } catch (error) {
    logger.error("Error loading assets.");
    throw error;
  }
};

export const getLatestQuotes = async (symbols: string[]): Promise<Record<string, Quote>> => {
  try {
    return await invoke("get_latest_quotes", { symbols });
  } catch (error) {
    logger.error("Error loading latest quotes.");
    throw error;
  }
};

export const updateAssetProfile = async (payload: UpdateAssetProfile): Promise<Asset> => {
  try {
    return await invoke("update_asset_profile", { id: payload.symbol, payload });
  } catch (error) {
    logger.error("Error updating asset profile.");
    throw error;
  }
};

export const deleteAsset = async (id: string): Promise<void> => {
  try {
    await invoke("delete_asset", { id });
  } catch (error) {
    logger.error("Error deleting asset.");
    throw error;
  }
};

export const updateAssetDataSource = async (symbol: string, dataSource: string): Promise<Asset> => {
  try {
    return await invoke("update_asset_data_source", { id: symbol, dataSource });
  } catch (error) {
    logger.error("Error updating asset data source.");
    throw error;
  }
};

export const updateQuote = async (symbol: string, quote: Quote): Promise<void> => {
  try {
    return await invoke("update_quote", { symbol, quote });
  } catch (error) {
    logger.error("Error updating quote");
    throw error;
  }
};

export const syncMarketData = async (symbols: string[], refetchAll: boolean): Promise<void> => {
  try {
    await invoke("sync_market_data", { symbols, refetchAll });
  } catch (error) {
    logger.error(`Error refreshing quotes for symbols: ${String(error)}`);
    throw error;
  }
};

export const deleteQuote = async (id: string): Promise<void> => {
  try {
    return await invoke("delete_quote", { id });
  } catch (error) {
    logger.error("Error deleting quote");
    throw error;
  }
};

export const getQuoteHistory = async (symbol: string): Promise<Quote[]> => {
  try {
    return await invoke("get_quote_history", { symbol });
  } catch (error) {
    logger.error(`Error fetching quote history for symbol ${symbol}.`);
    throw error;
  }
};

export const getMarketDataProviders = async (): Promise<MarketDataProviderInfo[]> => {
  try {
    return await invoke("get_market_data_providers");
  } catch (error) {
    logger.error("Error fetching market data providers.");
    throw error;
  }
};

export const getMarketDataProviderSettings = async (): Promise<MarketDataProviderSetting[]> => {
  try {
    return await invoke("get_market_data_providers_settings");
  } catch (error) {
    logger.error("Error fetching market data provider settings.");
    throw error;
  }
};

export const updateMarketDataProviderSettings = async (payload: {
  providerId: string;
  priority: number;
  enabled: boolean;
}): Promise<MarketDataProviderSetting> => {
  try {
    return await invoke("update_market_data_provider_settings", payload);
  } catch (error) {
    logger.error("Error updating market data provider settings.");
    throw error;
  }
};

export const importManualQuotes = async (quotes: QuoteImport[]): Promise<QuoteImport[]> => {
  try {
    const overwriteExisting = true;
    return await invoke("import_quotes_csv", { quotes, overwriteExisting });
  } catch (error) {
    logger.error("Error importing manual quotes.");
    throw error;
  }
};
