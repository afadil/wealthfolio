import {
  AssetData,
  QuoteSummary,
  Asset,
  Quote,
  QuoteUpdate,
  UpdateAssetProfile,
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

export const updateQuote = async (symbol: string, quote: Quote): Promise<void> => {
  try {
    const runEnv = await getRunEnv();
    if (runEnv === RUN_ENV.DESKTOP) {
      // Convert Date to YYYY-MM-DD format
      const formatDate = (date: Date | string) => {
        const d = date instanceof Date ? date : new Date(date);
        return d.toISOString().split('T')[0];
      };

      // Create QuoteUpdate object
      const quoteUpdate: QuoteUpdate = {
        date: formatDate(quote.date),
        symbol,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
        close: quote.close,
        dataSource: 'MANUAL',
      };

      return invokeTauri('update_quote', { symbol, quote: quoteUpdate });
    }
  } catch (error) {
    logger.error('Error updating quote');
    throw error;
  }
};

export const refreshQuotesForSymbols = async (symbols: string[]): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri('refresh_quotes_for_symbols', { symbols });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error refreshing quotes for symbols.');
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
