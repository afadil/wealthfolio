import { invoke } from '@tauri-apps/api';
import { open } from '@tauri-apps/api/dialog';
import { listen } from '@tauri-apps/api/event';
import type { EventCallback, UnlistenFn } from '@tauri-apps/api/event';

export type { EventCallback, UnlistenFn };

export const invokeTauri = async <T>(command: string, payload?: Record<string, unknown>) => {
  return await invoke<T>(command, payload);
};

export const openCsvFileDialogTauri = async (): Promise<null | string | string[]> => {
  return open({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
};

export const listenFileDropHoverTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>('tauri://file-drop-hover', handler);
};

export const listenFileDropTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  return listen<T>('tauri://file-drop', handler);
};

export const listenFileDropCancelledTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>('tauri://file-drop-cancelled', handler);
};

export const listenQuotesSyncStartTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>('PORTFOLIO_UPDATE_START', handler);
};

export const listenQuotesSyncCompleteTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>('PORTFOLIO_UPDATE_COMPLETE', handler);
};

export const listenQuotesSyncErrorTauri = async <T>(
  handler: EventCallback<T>,
): Promise<UnlistenFn> => {
  return listen<T>('PORTFOLIO_UPDATE_ERROR', handler);
};
