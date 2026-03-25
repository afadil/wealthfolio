import type { EventCallback, UnlistenFn } from "@/adapters";
import {
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
    return listenFileDropHoverTauri<T>(handler);
  } catch (error) {
    logger.error("Error listen tauri://file-drop-hover.");
    throw error;
  }
};

// listenImportFileDrop
export const listenImportFileDrop = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return listenFileDropTauri<T>(handler);
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
    return listenFileDropCancelledTauri<T>(handler);
  } catch (error) {
    logger.error("Error listen tauri://file-drop-cancelled.");
    throw error;
  }
};

export type { UnlistenFn };
