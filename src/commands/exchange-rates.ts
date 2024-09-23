import type { ExchangeRate } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

export const getExchangeRates = async (): Promise<ExchangeRate[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_exchange_rates');
      default:
        throw new Error('Unsupported environment');
    }
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return [];
  }
};

export const updateExchangeRate = async (updatedRate: ExchangeRate): Promise<ExchangeRate> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_exchange_rate', { rate: updatedRate });
      default:
        throw new Error('Unsupported environment');
    }
  } catch (error) {
    console.error('Error updating exchange rate:', error);
    throw error;
  }
};
