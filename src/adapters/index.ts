import * as tauri from "./tauri";
import * as web from "./web";

export enum RUN_ENV {
  DESKTOP = "desktop",
  WEB = "web",
  UNSUPPORTED = "unsupported",
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
  if (typeof window !== "undefined") {
    return RUN_ENV.WEB;
  }
  return RUN_ENV.UNSUPPORTED;
};

export const invokeTauri = tauri.invokeTauri;
export const invokeWeb = web.invokeWeb;

export const logger = getRunEnv() === RUN_ENV.DESKTOP ? tauri.logger : web.logger;

export type { EventCallback, UnlistenFn } from "./tauri";

export {
  listenDatabaseRestoredTauri,
  listenDeepLinkTauri,
  listenFileDropCancelledTauri,
  listenFileDropHoverTauri,
  listenFileDropTauri,
  listenMarketSyncCompleteTauri,
  listenMarketSyncStartTauri,
  listenNavigateToRouteTauri,
  listenPortfolioUpdateCompleteTauri,
  listenPortfolioUpdateErrorTauri,
  listenPortfolioUpdateStartTauri,
  openCsvFileDialogTauri,
  openDatabaseFileDialogTauri,
  openFileSaveDialogTauri,
  openFolderDialogTauri,
  openUrlInBrowser,
} from "./tauri";

export * from "./web";
