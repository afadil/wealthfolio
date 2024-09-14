import type { EventCallback, UnlistenFn } from '@tauri-apps/api/event';

export type { EventCallback, UnlistenFn };

export const invokeTauri = async <T>(command: string, payload?: Record<string, unknown>) => {
  const invoke = await import('@tauri-apps/api').then((mod) => mod.invoke);
  return await invoke<T>(command, payload);
}

export const openCsvFileDialogTauri = async (): Promise<null | string | string[]> => {
  const open = await import('@tauri-apps/api/dialog').then((mod) => mod.open);
  return open({ filters: [{ name: 'CSV', extensions: ['csv'] }] });
}

export const listenFileDropHoverTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>('tauri://file-drop-hover', handler);
}

export const listenFileDropTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>('tauri://file-drop', handler);
}

export const listenFileDropCancelledTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>('tauri://file-drop-cancelled', handler);
}

export const listenQuotesSyncStartTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>('QUOTES_SYNC_START', handler);
}

export const listenQuotesSyncCompleteTauri = async <T>(handler: EventCallback<T>): Promise<UnlistenFn> => {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>('QUOTES_SYNC_COMPLETE', handler);
}
