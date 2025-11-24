import type { QuoteImport } from "@/lib/types/quote-import";
import {
  QuoteSummary,
  Asset,
  Quote,
  UpdateAssetProfile,
  MarketDataProviderInfo,
} from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";

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
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("search_symbol", { query });
      case RUN_ENV.WEB:
        return invokeWeb("search_symbol", { query });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error searching for ticker.");
    throw error;
  }
};

export const syncHistoryQuotes = async (): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("synch_quotes");
        return;
      case RUN_ENV.WEB:
        await invokeWeb("synch_quotes");
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error syncing history quotes.");
    throw error;
  }
};

export const getAssetProfile = async (assetId: string): Promise<Asset> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_asset_profile", { assetId });
      case RUN_ENV.WEB:
        return invokeWeb("get_asset_profile", { assetId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error loading asset data.");
    throw error;
  }
};

export const updateAssetProfile = async (payload: UpdateAssetProfile): Promise<Asset> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_asset_profile", { id: payload.symbol, payload });
      case RUN_ENV.WEB:
        return invokeWeb("update_asset_profile", { id: payload.symbol, payload });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating asset profile.");
    throw error;
  }
};

export const updateAssetDataSource = async (symbol: string, dataSource: string): Promise<Asset> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_asset_data_source", { id: symbol, dataSource });
      case RUN_ENV.WEB:
        return invokeWeb("update_asset_data_source", { id: symbol, dataSource });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating asset data source.");
    throw error;
  }
};

export const updateQuote = async (symbol: string, quote: Quote): Promise<void> => {
  try {
    const runEnv = getRunEnv();
    if (runEnv === RUN_ENV.DESKTOP) {
      return invokeTauri("update_quote", { symbol, quote: quote });
    }
    if (runEnv === RUN_ENV.WEB) {
      return invokeWeb("update_quote", { symbol, quote });
    }
  } catch (error) {
    logger.error("Error updating quote");
    throw error;
  }
};

export const syncMarketData = async (symbols: string[], refetchAll: boolean): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("sync_market_data", { symbols, refetchAll });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("sync_market_data", { symbols, refetchAll });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error(`Error refreshing quotes for symbols: ${String(error)}`);
    throw error;
  }
};

export const deleteQuote = async (id: string): Promise<void> => {
  try {
    const runEnv = getRunEnv();
    if (runEnv === RUN_ENV.DESKTOP) {
      return invokeTauri("delete_quote", { id });
    }
    if (runEnv === RUN_ENV.WEB) {
      return invokeWeb("delete_quote", { id });
    }
  } catch (error) {
    logger.error("Error deleting quote");
    throw error;
  }
};

export const getQuoteHistory = async (symbol: string): Promise<Quote[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return await invokeTauri("get_quote_history", { symbol });
      case RUN_ENV.WEB:
        return await invokeWeb("get_quote_history", { symbol });
      default:
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error(`Error fetching quote history for symbol ${symbol}.`);
    throw error;
  }
};

export const getMarketDataProviders = async (): Promise<MarketDataProviderInfo[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_market_data_providers");
      case RUN_ENV.WEB:
        return invokeWeb("get_market_data_providers");
      default:
        logger.error("Unsupported environment for getMarketDataProviders");
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error("Error fetching market data providers.");
    throw error;
  }
};

export const getMarketDataProviderSettings = async (): Promise<MarketDataProviderSetting[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_market_data_providers_settings");
      case RUN_ENV.WEB:
        return invokeWeb("get_market_data_providers_settings");
      default:
        throw new Error(`Unsupported environment`);
    }
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
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_market_data_provider_settings", payload);
      case RUN_ENV.WEB:
        return invokeWeb("update_market_data_provider_settings", payload);
      default:
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error("Error updating market data provider settings.");
    throw error;
  }
};

export const importManualQuotes = async (quotes: QuoteImport[]): Promise<QuoteImport[]> => {
  try {
    const overwriteExisting = true;
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("import_quotes_csv", { quotes, overwriteExisting });
      case RUN_ENV.WEB:
        return invokeWeb("import_quotes_csv", { quotes, overwriteExisting });
      default:
        throw new Error("Manual quote import is not supported in this environment.");
    }
  } catch (error) {
    logger.error("Error importing manual quotes.");
    throw error;
  }
};
