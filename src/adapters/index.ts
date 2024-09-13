export enum RUN_ENV {
  DESKTOP = 'desktop',
  BROWSER = 'browser',
  UNSUPPORTED = 'unsupported',
};

export const getRunEnv = () => {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return RUN_ENV.DESKTOP;
  }
  if (typeof window !== 'undefined' && window.indexedDB) {
    return RUN_ENV.BROWSER;
  }
  return RUN_ENV.UNSUPPORTED;
}

export type {
  EventCallback,
  UnlistenFn,
} from './tauri';

export {
  invokeTauri,
  openCsvFileDialogTauri,
  listenFileDropHoverTauri,
  listenFileDropTauri,
  listenFileDropCancelledTauri,
  listenQuotesSyncStartTauri,
  listenQuotesSyncCompleteTauri,
} from './tauri';
