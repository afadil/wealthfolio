import type { QuoteImport } from "@/lib/types/quote-import";
import {
  QuoteSummary,
  Asset,
  Quote,
  UpdateAssetProfile,
  MarketDataProviderInfo,
} from "@/lib/types";
import { invokeTauri, logger } from "@/adapters";

// Interface matching the backend struct
export interface MarketDataProviderSetting {
  id: string;
  name: string;
  description: string;
  url: string | null;
  priority: number;
  enabled: boolean;
  logoFilename: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export const searchTicker = async (query: string): Promise<QuoteSummary[]> => {
  try {
    return invokeTauri("search_symbol", { query });
  } catch (error) {
    logger.error("Error searching for ticker.");
    throw error;
  }
};

export const syncHistoryQuotes = async (): Promise<void> => {
  try {
    await invokeTauri("synch_quotes");
    return;
  } catch (error) {
    logger.error("Error syncing history quotes.");
    throw error;
  }
};

export const getAssetProfile = async (assetId: string): Promise<Asset> => {
  try {
    return invokeTauri("get_asset_profile", { assetId });
  } catch (error) {
    logger.error("Error loading asset data.");
    throw error;
  }
};

export const getAssets = async (): Promise<Asset[]> => {
  try {
    return invokeTauri("get_assets");
  } catch (error) {
    logger.error("Error loading assets.");
    throw error;
  }
};

export const getLatestQuotes = async (symbols: string[]): Promise<Record<string, Quote>> => {
  try {
    return invokeTauri("get_latest_quotes", { symbols });
  } catch (error) {
    logger.error("Error loading latest quotes.");
    throw error;
  }
};

export const updateAssetProfile = async (payload: UpdateAssetProfile): Promise<Asset> => {
  try {
    return invokeTauri("update_asset_profile", { id: payload.symbol, payload });
  } catch (error) {
    logger.error("Error updating asset profile.");
    throw error;
  }
};

export const deleteAsset = async (id: string): Promise<void> => {
  try {
    await invokeTauri("delete_asset", { id });
    return;
  } catch (error) {
    logger.error("Error deleting asset.");
    throw error;
  }
};

export const updateAssetDataSource = async (symbol: string, dataSource: string): Promise<Asset> => {
  try {
    return invokeTauri("update_asset_data_source", { id: symbol, dataSource });
  } catch (error) {
    logger.error("Error updating asset data source.");
    throw error;
  }
};

export const updateQuote = async (symbol: string, quote: Quote): Promise<void> => {
  try {
    return invokeTauri("update_quote", { symbol, quote: quote });
  } catch (error) {
    logger.error("Error updating quote");
    throw error;
  }
};

export const syncMarketData = async (symbols: string[], refetchAll: boolean): Promise<void> => {
  try {
    await invokeTauri("sync_market_data", { symbols, refetchAll });
    return;
  } catch (error) {
    logger.error(`Error refreshing quotes for symbols: ${String(error)}`);
    throw error;
  }
};

export const deleteQuote = async (id: string): Promise<void> => {
  try {
    return invokeTauri("delete_quote", { id });
  } catch (error) {
    logger.error("Error deleting quote");
    throw error;
  }
};

export const getQuoteHistory = async (symbol: string): Promise<Quote[]> => {
  try {
    return await invokeTauri("get_quote_history", { symbol });
  } catch (error) {
    logger.error(`Error fetching quote history for symbol ${symbol}.`);
    throw error;
  }
};

export const getMarketDataProviders = async (): Promise<MarketDataProviderInfo[]> => {
  try {
    return invokeTauri("get_market_data_providers");
  } catch (error) {
    logger.error("Error fetching market data providers.");
    throw error;
  }
};

export const getMarketDataProviderSettings = async (): Promise<MarketDataProviderSetting[]> => {
  try {
    return invokeTauri("get_market_data_providers_settings");
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
    return invokeTauri("update_market_data_provider_settings", payload);
  } catch (error) {
    logger.error("Error updating market data provider settings.");
    throw error;
  }
};

export const importManualQuotes = async (
  quotes: QuoteImport[],
  overwriteExisting: boolean = true,
): Promise<QuoteImport[]> => {
  try {
    return invokeTauri("import_quotes_csv", { quotes, overwriteExisting });
  } catch (error) {
    logger.error("Error importing manual quotes.");
    throw error;
  }
};
