import * as tauri from './tauri';
import * as web from './web';

export enum RUN_ENV {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
  WEB = 'web',
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
  if (typeof window !== 'undefined') {
    return RUN_ENV.WEB;
  }
  return RUN_ENV.UNSUPPORTED;
};

export const invokeTauri = tauri.invokeTauri;
export const invokeWeb = web.invokeWeb;

export const logger = getRunEnv() === RUN_ENV.DESKTOP ? tauri.logger : web.logger;

export type { EventCallback, UnlistenFn } from './tauri';

export {
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
  listenMarketSyncCompleteTauri,
  listenMarketSyncStartTauri,
  listenNavigateToRouteTauri,
} from './tauri';

export * from './web';
