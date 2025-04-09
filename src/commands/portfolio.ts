import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';
import {
  Holding,
  IncomeSummary,
  HistorySummary,
  PortfolioHistory,
  AccountSummary,
  PerformanceData,
} from '@/lib/types';

export const calculateHistoricalData = async (params: {
  accountIds?: string[];
  forceFullCalculation: boolean;
}): Promise<HistorySummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('calculate_historical_data', params);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error calculating historical data.');
    throw error;
  }
};

export const recalculatePortfolio = async (): Promise<HistorySummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('recalculate_portfolio');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error recalculating portfolio.');
    throw error;
  }
};

export const computeHoldings = async (): Promise<Holding[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_portfolio_holdings');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error computing holdings.');
    throw error;
  }
};

export const getHoldings = async (accountId: string): Promise<Holding[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_holdings', { accountId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error fetching holdings.');
    throw error;
  }
};


export const getIncomeSummary = async (): Promise<IncomeSummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_income_summary');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error fetching income summary.');
    throw error;
  }
};

export const getHistory = async (accountId?: string): Promise<PortfolioHistory[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_portfolio_history', accountId ? { accountId } : undefined);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error fetching portfolio history.');
    throw error;
  }
};

export const getAccountsSummary = async (): Promise<AccountSummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_accounts_summary');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error fetching active accounts summary.');
    throw error;
  }
};

export const calculatePerformance = async (
  itemType: 'account' | 'symbol',
  itemId: string,
  startDate: string,
  endDate: string,
): Promise<PerformanceData> => {
  try {
    const response = await invokeTauri('calculate_performance', {
      itemType,
      itemId,
      startDate,
      endDate,
    });
    
    // Check if the response is an error message (string) instead of the expected object
    if (typeof response === 'string' || !response || Object.keys(response).length === 0) {
      throw new Error(typeof response === 'string' ? response : 'Failed to calculate cumulative returns');
    }
    
    return response as PerformanceData;
  } catch (error) {
    logger.error('Error calculating cumulative returns.');
    throw error;
  }
};
