import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { writeFile, BaseDirectory } from '@tauri-apps/plugin-fs';
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

export const openFileSaveDialogTauri = async (
  fileContent: string | Blob | Uint8Array,
  fileName: string,
) => {
  const filePath = await save({
    defaultPath: fileName,
    filters: [
      {
        name: fileName,
        extensions: [fileName.split('.').pop() ?? ''],
      },
    ],
  });

  if (filePath === null) {
    return false;
  }

  let contentToSave: Uint8Array;
  if (typeof fileContent === 'string') {
    contentToSave = new TextEncoder().encode(fileContent);
  } else if (fileContent instanceof Blob) {
    const arrayBuffer = await fileContent.arrayBuffer();
    contentToSave = new Uint8Array(arrayBuffer);
  } else {
    contentToSave = fileContent;
  }

  await writeFile(filePath, contentToSave, { baseDir: BaseDirectory.Document });

  return true;
};
