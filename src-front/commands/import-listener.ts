import type { EventCallback, UnlistenFn } from "@/adapters";
import {
  listenFileDropCancelled,
  listenFileDropHover,
  listenFileDrop,
  logger,
} from "@/adapters";

// listenImportFileDropHover
export const listenImportFileDropHover = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  try {
    return await listenFileDropHover(handler);
  } catch (error) {
    logger.error("Error listen tauri://file-drop-hover.");
    throw error;
  }
};

// listenImportFileDrop
export const listenImportFileDrop = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return await listenFileDrop(handler);
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
    return await listenFileDropCancelled(handler);
  } catch (error) {
    logger.error("Error listen tauri://file-drop-cancelled.");
    throw error;
  }
};

export type { UnlistenFn };
