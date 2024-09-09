import { listen, EventCallback, UnlistenFn } from '@tauri-apps/api/event';

// listenQuotesSyncStart
export const listenQuotesSyncStart = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return listen<T>('QUOTES_SYNC_START', handler);
  } catch (error) {
    console.error('Error listen QUOTES_SYNC_START:', error);
    throw error;
  }
};

// listenQuotesSyncComplete
export const listenQuotesSyncComplete = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return listen<T>('QUOTES_SYNC_COMPLETE', handler);
  } catch (error) {
    console.error('Error listen QUOTES_SYNC_COMPLETE:', error);
    throw error;
  }
};
