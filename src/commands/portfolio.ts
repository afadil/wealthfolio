import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import {
  Holding,
  IncomeSummary,
  HistorySummary,
  PortfolioHistory,
  AccountSummary,
} from '@/lib/types';

export const calculate_historical_data = async (): Promise<HistorySummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('calculate_historical_data');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error calculating historical data:', error);
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
    console.error('Error computing holdings:', error);
    throw error;
  }
};

export const getIncomeSummary = async (): Promise<IncomeSummary> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_income_summary');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error fetching income summary:', error);
    throw error;
  }
};

export const getAccountHistory = async (accountId: string): Promise<PortfolioHistory[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_account_history', { accountId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error fetching account history:', error);
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
    console.error('Error fetching active accounts summary:', error);
    throw error;
  }
};

export const calculateHistoricalDataForAccounts = async (
  accountIds: string[],
): Promise<HistorySummary[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('calculate_accounts_historical_data', { accountIds });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error calculating historical data for specific accounts:', error);
    throw error;
  }
};
