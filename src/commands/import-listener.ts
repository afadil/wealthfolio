import type { EventCallback, UnlistenFn } from '@/adapters';
import { getRunEnv, RUN_ENV, listenFileDropCancelledTauri, listenFileDropHoverTauri, listenFileDropTauri } from "@/adapters";

// listenImportFileDropHover
export const listenImportFileDropHover = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenFileDropHoverTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error listen tauri://file-drop-hover:', error);
    throw error;
  }
};

// listenImportFileDrop
export const listenImportFileDrop = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenFileDropTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error listen tauri://file-drop:', error);
    throw error;
  }
};

// listenImportFileDropCancelled
export const listenImportFileDropCancelled = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return listenFileDropCancelledTauri<T>(handler);
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error listen tauri://file-drop-cancelled:', error);
    throw error;
  }
};

export type { UnlistenFn };
