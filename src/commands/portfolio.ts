import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';
import {
  Holding,
  IncomeSummary,
  HistorySummary,
  PortfolioHistory,
  AccountSummary,
  CumulativeReturns,
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
        return invokeTauri('compute_holdings');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error computing holdings.');
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

export const calculateAccountCumulativeReturns = async (
  accountId: string,
  startDate: string,
  endDate: string,
  method: 'TWR' | 'MWR' = 'TWR',
): Promise<CumulativeReturns> => {
  try {
    return invokeTauri('calculate_account_cumulative_returns', {
      accountId,
      startDate,
      endDate,
      method,
    });
  } catch (error) {
    logger.error('Error calculating cumulative returns.');
    throw error;
  }
};

export const calculateSymbolCumulativeReturns = async (
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<CumulativeReturns> => {
  try {
    return invokeTauri('calculate_symbol_cumulative_returns', {
      symbol,
      startDate,
      endDate,
    });
  } catch (error) {
    logger.error('Error calculating symbol cumulative returns.');
    throw error;
  }
};
