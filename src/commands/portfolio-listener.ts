import type { EventCallback, UnlistenFn } from "@/adapters";
import {
  listenPortfolioUpdateStartTauri,
  listenPortfolioUpdateCompleteTauri,
  listenPortfolioUpdateErrorTauri,
  logger,
  listenMarketSyncCompleteTauri,
  listenMarketSyncStartTauri,
} from "@/adapters";

// listenPortfolioUpdateStart
export const listenPortfolioUpdateStart = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    return listenPortfolioUpdateStartTauri<T>(handler);
  } catch (error) {
    logger.error("Error listen portfolio:update-start.");
    throw error;
  }
};

// listenPortfolioUpdateComplete
export const listenPortfolioUpdateComplete = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    return listenPortfolioUpdateCompleteTauri<T>(handler);
  } catch (error) {
    logger.error("Error listen portfolio:update-complete.");
    throw error;
  }
};

// listenPortfolioUpdateError
export const listenPortfolioUpdateError = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    return listenPortfolioUpdateErrorTauri<T>(handler);
  } catch (error) {
    logger.error("Error listen portfolio:update-error.");
    throw error;
  }
};

// listenMarketSyncStart
export const listenMarketSyncStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return listenMarketSyncStartTauri<T>(handler);
  } catch (error) {
    logger.error("Error listen market:sync-start.");
    throw error;
  }
};

// listenMarketSyncComplete
export const listenMarketSyncComplete = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    return listenMarketSyncCompleteTauri<T>(handler);
  } catch (error) {
    logger.error("Error listen market:sync-complete.");
    throw error;
  }
};
