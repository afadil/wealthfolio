import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';
import {
  Holding,
  IncomeSummary,
  AccountValuation,
  PerformanceMetrics,
  SimplePerformanceMetrics,
} from '@/lib/types';


export const updatePortfolio = async (): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_portfolio');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error updating portfolio.');
    throw error;
  }
};

export const recalculatePortfolio = async (): Promise<void> => {
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

export const getHistoricalValuations = async (
  accountId?: string,
  startDate?: string,
  endDate?: string,
): Promise<AccountValuation[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        const params: { accountId?: string; startDate?: string; endDate?: string } = {};
        if (accountId) params.accountId = accountId;
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;

        return invokeTauri('get_historical_valuations', Object.keys(params).length > 0 ? params : undefined);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error fetching historical valuations.');
    throw error;
  }
};

export const calculatePerformanceHistory = async (
  itemType: 'account' | 'symbol',
  itemId: string,
  startDate: string,
  endDate: string,
): Promise<PerformanceMetrics> => {
  try {
    const response = await invokeTauri('calculate_performance_history', {
      itemType,
      itemId,
      startDate,
      endDate,
    });
    
    if (typeof response === 'string' || !response || Object.keys(response).length === 0) {
      throw new Error(typeof response === 'string' ? response : 'Failed to calculate performance history');
    }
    
    return response as PerformanceMetrics;
  } catch (error) {
    logger.error('Error calculating performance history.');
    throw error;
  }
};

interface CalculatePerformanceSummaryArgs {
  itemType: 'account' | 'symbol';
  itemId: string;
  startDate?: string | null;
  endDate?: string | null;
}

export const calculatePerformanceSummary = async ({
  itemType,
  itemId,
  startDate,
  endDate,
}: CalculatePerformanceSummaryArgs): Promise<PerformanceMetrics> => {
  try {
    const args: CalculatePerformanceSummaryArgs = {
      itemType,
      itemId,
    };
    if (startDate) {
      args.startDate = startDate;
    }
    if (endDate) {
      args.endDate = endDate;
    }

    const response = await invokeTauri<PerformanceMetrics>(
      'calculate_performance_summary',
      args as unknown as Record<string, unknown>
    );

    if (!response || typeof response !== 'object' || !response.id) {
      logger.error(
        `Invalid data received from calculate_performance_summary. Response: ${JSON.stringify(response)}`
      );
      throw new Error('Received invalid performance summary data from backend.');
    }

    return response;
  } catch (error) {
    const errorString = error instanceof Error ? error.message : JSON.stringify(error);
    logger.error(
      `Failed to fetch performance summary for ${itemType} ${itemId}. Error: ${errorString}`
    );
    throw error instanceof Error ? error : new Error('An unknown error occurred while fetching performance summary');
  }
};

export const calculateAccountsSimplePerformance = async (
  accountIds: string[],
): Promise<SimplePerformanceMetrics[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('calculate_accounts_simple_performance', { accountIds });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error calculating simple performance for accounts.');
    throw error;
  }
};





