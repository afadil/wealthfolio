import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { logger } from '@/adapters';
import { HistorySummary } from '@/lib/types';

export const syncBrokers = async (): Promise<void> => {
    try {
        switch (getRunEnv()) {
            case RUN_ENV.DESKTOP:
                await invokeTauri('sync_all_accounts');
                return;
            default: 
                throw new Error('Unsupported');
        }
    } catch (error) {
        logger.error('Error syncing brokers.');
        throw error;
    }
};

export const updatePortfolio = async (params: {
    accountIds?: string[];
    forceFullCalculation: boolean;
  }): Promise<HistorySummary[]> => {
    try {
      switch (getRunEnv()) {
        case RUN_ENV.DESKTOP:
          await syncBrokers();
          return invokeTauri('calculate_historical_data', params);
        default:
          throw new Error(`Unsupported`);
      }
    } catch (error) {
      logger.error('Error calculating historical data.');
      throw error;
    }
  };
  
