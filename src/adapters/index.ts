import * as tauri from "./tauri";

export enum RUN_ENV {
  DESKTOP = "desktop",
}

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export const getRunEnv = (): RUN_ENV => {
  if (typeof window !== "undefined" && window.__TAURI__) {
    return RUN_ENV.DESKTOP;
  }
  return RUN_ENV.DESKTOP;
};

export const invokeTauri = tauri.invokeTauri;

export const logger = tauri.logger;

export type { EventCallback, UnlistenFn } from "./tauri";

export {
  listenDatabaseRestoredTauri, listenFileDropCancelledTauri, listenFileDropHoverTauri,
  listenFileDropTauri, listenMarketSyncCompleteTauri,
  listenMarketSyncStartTauri,
  listenNavigateToRouteTauri, listenPortfolioUpdateCompleteTauri, listenPortfolioUpdateErrorTauri, listenPortfolioUpdateStartTauri, openAddonZipFileDialogTauri, openCsvFileDialogTauri, openDatabaseFileDialogTauri, openFileSaveDialogTauri, openFolderDialogTauri, readBinaryFileTauri
} from "./tauri";
