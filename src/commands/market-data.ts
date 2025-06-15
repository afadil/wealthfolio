import {
  AssetData,
  QuoteSummary,
  Asset,
  Quote,
  UpdateAssetProfile,
  MarketDataProviderInfo,
} from '@/lib/types';
import { DataSource } from '@/lib/constants';
import { eachDayOfInterval } from 'date-fns';
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

// Helper function to fill gaps in manual quote data
const fillQuoteGaps = (quotes: Quote[]): Quote[] => {
  if (quotes.length === 0) return quotes;

  // Sort quotes by timestamp
  const sortedQuotes = [...quotes].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const startDate = new Date(sortedQuotes[0].timestamp);
  // Fill from first quote to today (or current date)
  const endDate = new Date();
  // Set endDate to end of day to include today
  endDate.setHours(23, 59, 59, 999);
  
  // Create a map of date string to quote for quick lookup
  const quoteMap = new Map<string, Quote>();
  sortedQuotes.forEach(quote => {
    const dateKey = new Date(quote.timestamp).toISOString().split('T')[0];
    quoteMap.set(dateKey, quote);
  });
  
  // Generate all days from first quote to today
  const allDays = eachDayOfInterval({ start: startDate, end: endDate });
  
  // Fill the data with forward-filled values
  const filledQuotes: Quote[] = [];
  let lastKnownQuote = sortedQuotes[0];
  
  allDays.forEach(day => {
    const dateKey = day.toISOString().split('T')[0];
    const existingQuote = quoteMap.get(dateKey);
    
    if (existingQuote) {
      // We have actual data for this day
      lastKnownQuote = existingQuote;
      filledQuotes.push(existingQuote);
    } else {
      // Forward fill with last known values
      const filledQuote: Quote = {
        ...lastKnownQuote,
        id: `${dateKey}_${lastKnownQuote.symbol}_FILLED`,
        timestamp: day.toISOString(),
      };
      filledQuotes.push(filledQuote);
    }
  });
  
  return filledQuotes;
};

export const getQuoteHistory = async (symbol: string, dataSource?: DataSource): Promise<Quote[]> => {
  try {
    let quotes: Quote[];
    
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        quotes = await invokeTauri('get_quote_history', { symbol });
        break;
      default:
        throw new Error(`Unsupported environment`);
    }
    
    // Apply gap filling for manual data sources
    if (dataSource === DataSource.MANUAL && quotes.length > 0) {
      return fillQuoteGaps(quotes);
    }
    
    return quotes;
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
