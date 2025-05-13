import type { EventCallback, UnlistenFn } from '@/adapters';
import {
  getRunEnv,
  RUN_ENV,
  listenPortfolioUpdateStartTauri,
  listenPortfolioUpdateCompleteTauri,
  listenPortfolioUpdateErrorTauri,
  logger,
  listenMarketSyncCompleteTauri,
  listenMarketSyncStartTauri,
} from '@/adapters';

// listenPortfolioUpdateStart
export const listenPortfolioUpdateStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenPortfolioUpdateStartTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error listen portfolio:update-start.');
    throw error;
  }
};

// listenPortfolioUpdateComplete
export const listenPortfolioUpdateComplete = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenPortfolioUpdateCompleteTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error listen portfolio:update-complete.');
    throw error;
  }
};

// listenPortfolioUpdateError
export const listenPortfolioUpdateError = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenPortfolioUpdateErrorTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error listen portfolio:update-error.');
    throw error;
  }
};

// listenMarketSyncStart
export const listenMarketSyncStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenMarketSyncStartTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error listen market:sync-start.');
    throw error;
  }
};

// listenMarketSyncComplete
export const listenMarketSyncComplete = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenMarketSyncCompleteTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error('Error listen market:sync-complete.');
    throw error;
  }
};
