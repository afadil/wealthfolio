export enum RUN_ENV {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
  BROWSER = 'browser',
  UNSUPPORTED = 'unsupported',
}

declare global {
  interface Window {
    __TAURI__?: any;
  }
}

export const getRunEnv = (): RUN_ENV => {
  if (typeof window !== 'undefined' && window.__TAURI__) {
    return RUN_ENV.DESKTOP;
  }
  if (typeof window !== 'undefined' && window.indexedDB) {
    return RUN_ENV.BROWSER;
  }
  return RUN_ENV.UNSUPPORTED;
};

export type { EventCallback, UnlistenFn } from './tauri';


export {
  invokeTauri,
  openCsvFileDialogTauri,
  openFolderDialogTauri,
  openDatabaseFileDialogTauri,
  listenFileDropHoverTauri,
  listenFileDropTauri,
  listenFileDropCancelledTauri,
  listenPortfolioUpdateStartTauri,
  listenPortfolioUpdateCompleteTauri,
  listenDatabaseRestoredTauri,
  listenPortfolioUpdateErrorTauri,
  openFileSaveDialogTauri,
  logger,
} from './tauri';

export * from './tauri';
