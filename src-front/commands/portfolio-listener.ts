import type { EventCallback, UnlistenFn } from "@/adapters";
import {
  listenPortfolioUpdateStart as listenPortfolioUpdateStartAdapter,
  listenPortfolioUpdateComplete as listenPortfolioUpdateCompleteAdapter,
  listenPortfolioUpdateError as listenPortfolioUpdateErrorAdapter,
  listenMarketSyncComplete as listenMarketSyncCompleteAdapter,
  listenMarketSyncStart as listenMarketSyncStartAdapter,
  logger,
} from "@/adapters";

// listenPortfolioUpdateStart
export const listenPortfolioUpdateStart = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    return await listenPortfolioUpdateStartAdapter(handler);
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
    return await listenPortfolioUpdateCompleteAdapter(handler);
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
    return await listenPortfolioUpdateErrorAdapter(handler);
  } catch (error) {
    logger.error("Error listen portfolio:update-error.");
    throw error;
  }
};

// listenMarketSyncStart
export const listenMarketSyncStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return await listenMarketSyncStartAdapter(handler);
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
    return await listenMarketSyncCompleteAdapter(handler);
  } catch (error) {
    logger.error("Error listen market:sync-complete.");
    throw error;
  }
};
