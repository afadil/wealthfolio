import {
  AssetData,
  QuoteSummary,
  Asset,
  Quote,
  UpdateAssetProfile,
  MarketDataProviderInfo,
} from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';

export const searchTicker = async (query: string): Promise<QuoteSummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('search_symbol', { query });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error searching for ticker.');
    throw error;
  }
};

export const syncHistoryQuotes = async (): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri('synch_quotes');
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error syncing history quotes.');
    throw error;
  }
};

export const getAssetData = async (assetId: string): Promise<AssetData> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_asset_data', { assetId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error loading asset data.');
    throw error;
  }
};

export const updateAssetProfile = async (payload: UpdateAssetProfile): Promise<Asset> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_asset_profile', { id: payload.symbol, payload });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error updating asset profile.');
    throw error;
  }
};

export const updateAssetDataSource = async (symbol: string, dataSource: string): Promise<Asset> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_asset_data_source', { id: symbol, dataSource });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error updating asset data source.');
    throw error;
  }
};

export const updateQuote = async (symbol: string, quote: Quote): Promise<void> => {
  try {
    const runEnv = await getRunEnv();
    if (runEnv === RUN_ENV.DESKTOP) {
      return invokeTauri('update_quote', { symbol, quote: quote });
    }
  } catch (error) {
    logger.error('Error updating quote');
    throw error;
  }
};

export const syncMarketData = async (symbols: string[], refetchAll: boolean): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri('sync_market_data', { symbols, refetchAll });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error(`Error refreshing quotes for symbols: ${error}`);
    throw error;
  }
};

export const deleteQuote = async (id: string): Promise<void> => {
  try {
    const runEnv = await getRunEnv();
    if (runEnv === RUN_ENV.DESKTOP) {
      return invokeTauri('delete_quote', { id });
    }
  } catch (error) {
    logger.error('Error deleting quote');
    throw error;
  }
};


export const getQuoteHistory = async (symbol: string): Promise<Quote[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return await invokeTauri('get_quote_history', { symbol });
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
        return invokeTauri('get_market_data_providers');
      default:
        logger.error('Unsupported environment for getMarketDataProviders');
        throw new Error(`Unsupported environment`);
    }
  } catch (error) {
    logger.error('Error fetching market data providers.');
    throw error;
  }
};
