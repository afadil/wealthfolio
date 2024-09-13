import type { EventCallback, UnlistenFn } from '@/adapters';
import { getRunEnv, RUN_ENV, listenQuotesSyncStartTauri, listenQuotesSyncCompleteTauri } from "@/adapters";

// listenQuotesSyncStart
export const listenQuotesSyncStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenQuotesSyncStartTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error listen QUOTES_SYNC_START:', error);
    throw error;
  }
};

// listenQuotesSyncComplete
export const listenQuotesSyncComplete = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenQuotesSyncCompleteTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error listen QUOTES_SYNC_COMPLETE:', error);
    throw error;
  }
};
