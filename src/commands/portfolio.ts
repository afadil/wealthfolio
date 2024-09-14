import { FinancialHistory, Holding, IncomeSummary } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

export const getHistorical = async (): Promise<FinancialHistory[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_historical');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error fetching accounts:', error);
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
