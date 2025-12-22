import type { EventCallback, UnlistenFn } from "@/adapters";
import {
  getRunEnv,
  RUN_ENV,
  listenFileDropCancelledTauri,
  listenFileDropHoverTauri,
  listenFileDropTauri,
  logger,
} from "@/adapters";

// listenImportFileDropHover
export const listenImportFileDropHover = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenFileDropHoverTauri<T>(handler);
      case RUN_ENV.WEB:
        throw new Error(`Unsupported`);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error listen tauri://file-drop-hover.");
    throw error;
  }
};

// listenImportFileDrop
export const listenImportFileDrop = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenFileDropTauri<T>(handler);
      case RUN_ENV.WEB:
        throw new Error(`Unsupported`);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error listen tauri://file-drop.");
    throw error;
  }
};

// listenImportFileDropCancelled
export const listenImportFileDropCancelled = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenFileDropCancelledTauri<T>(handler);
      case RUN_ENV.WEB:
        throw new Error(`Unsupported`);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error listen tauri://file-drop-cancelled.");
    throw error;
  }
};

export type { UnlistenFn };
