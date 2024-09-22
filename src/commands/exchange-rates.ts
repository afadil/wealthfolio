import type { ExchangeRate, Quote } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

export const getExchangeRateSymbols = async (): Promise<ExchangeRate[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_exchange_rate_symbols');
      default:
        throw new Error('Unsupported environment');
    }
  } catch (error) {
    console.error('Error fetching exchange rate symbols:', error);
    return [];
  }
};

export const getLatestQuotes = async (symbols: string[]): Promise<Quote[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_latest_quotes', { symbols });
      default:
        throw new Error('Unsupported environment');
    }
  } catch (error) {
    console.error('Error fetching latest quotes:', error);
    return [];
  }
};

export const updateExchangeRate = async (updatedRate: ExchangeRate): Promise<ExchangeRate> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_exchange_rate', { updatedRate });
      default:
        throw new Error('Unsupported environment');
    }
  } catch (error) {
    console.error('Error updating exchange rate:', error);
    throw error;
  }
};
export const getLatestQuote = async (symbol: string): Promise<Quote | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_latest_quote', { symbol });
      default:
        throw new Error('Unsupported environment');
    }
  } catch (error) {
    console.error('Error fetching latest quote:', error);
    return null;
  }
};
