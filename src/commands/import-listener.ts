import { listen, EventCallback, UnlistenFn } from '@tauri-apps/api/event';

// listenImportFileDropHover
export const listenImportFileDropHover = <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return listen<T>('tauri://file-drop-hover', handler);
  } catch (error) {
    console.error('Error listen tauri://file-drop-hover:', error);
    throw error;
  }
};

// listenImportFileDrop
export const listenImportFileDrop = <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return listen<T>('tauri://file-drop', handler);
  } catch (error) {
    console.error('Error listen tauri://file-drop:', error);
    throw error;
  }
};

// listenImportFileDropCancelled
export const listenImportFileDropCancelled = <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  try {
    return listen<T>('tauri://file-drop-cancelled', handler);
  } catch (error) {
    console.error('Error listen tauri://file-drop-cancelled:', error);
    throw error;
  }
};

export type { UnlistenFn };
