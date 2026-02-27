// Bank Connect Commands
import type {
  EventCallback as TauriEventCallback,
  UnlistenFn as TauriUnlistenFn,
} from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";

import type { EventCallback, UnlistenFn } from "../types";
import { invoke, logger } from "./core";

// ============================================================================
// Types
// ============================================================================

export interface BankConnectSettings {
  downloadFolder: string;
  yearsBack: number;
  enabledBanks: string[];
  overwriteExisting: boolean;
}

export interface BankDownloadRun {
  id: string;
  bankKey: string;
  accountName: string | null;
  status: string;
  filesDownloaded: number;
  filesSkipped: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface BankLoginDetectedPayload {
  bankKey: string;
}

export interface BankProgressPayload {
  bankKey: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface BankDownloadCompletePayload {
  bankKey: string;
  downloaded: number;
  skipped: number;
  errors: number;
}

export interface BankWindowClosedPayload {
  bankKey: string;
}

// ============================================================================
// Commands
// ============================================================================

export const getBankConnectSettings = async (): Promise<BankConnectSettings> => {
  try {
    return await invoke<BankConnectSettings>("get_bank_connect_settings");
  } catch (err) {
    logger.error("Error fetching bank connect settings.");
    throw err;
  }
};

export const saveBankConnectSettings = async (
  settings: BankConnectSettings,
): Promise<void> => {
  try {
    return await invoke<void>("save_bank_connect_settings", { settings });
  } catch (err) {
    logger.error("Error saving bank connect settings.");
    throw err;
  }
};

export const listBankDownloadRuns = async (
  bankKey?: string,
): Promise<BankDownloadRun[]> => {
  try {
    return await invoke<BankDownloadRun[]>("list_bank_download_runs", { bankKey });
  } catch (err) {
    logger.error("Error listing bank download runs.");
    throw err;
  }
};

export const openBankWindow = async (bankKey: string): Promise<void> => {
  try {
    return await invoke<void>("open_bank_window", { bankKey });
  } catch (err) {
    logger.error("Error opening bank window.");
    throw err;
  }
};

export const closeBankWindow = async (bankKey: string): Promise<void> => {
  try {
    return await invoke<void>("close_bank_window", { bankKey });
  } catch (err) {
    logger.error("Error closing bank window.");
    throw err;
  }
};

export const startBankDownload = async (bankKey: string): Promise<string> => {
  try {
    return await invoke<string>("start_bank_download", { bankKey });
  } catch (err) {
    logger.error("Error starting bank download.");
    throw err;
  }
};

// ============================================================================
// Event Listeners
// ============================================================================

const adaptCallback = <T>(handler: EventCallback<T>): TauriEventCallback<T> => {
  return (event) => handler({ event: event.event, payload: event.payload, id: event.id });
};

const adaptUnlisten = (unlisten: TauriUnlistenFn): UnlistenFn => {
  return async () => unlisten();
};

export async function listenBankLoginDetected(
  handler: EventCallback<BankLoginDetectedPayload>,
): Promise<UnlistenFn> {
  const unlisten = await listen<BankLoginDetectedPayload>(
    "bank://login-detected",
    adaptCallback(handler),
  );
  return adaptUnlisten(unlisten);
}

export async function listenBankProgress(
  handler: EventCallback<BankProgressPayload>,
): Promise<UnlistenFn> {
  const unlisten = await listen<BankProgressPayload>(
    "bank://progress",
    adaptCallback(handler),
  );
  return adaptUnlisten(unlisten);
}

export async function listenBankDownloadComplete(
  handler: EventCallback<BankDownloadCompletePayload>,
): Promise<UnlistenFn> {
  const unlisten = await listen<BankDownloadCompletePayload>(
    "bank://download-complete",
    adaptCallback(handler),
  );
  return adaptUnlisten(unlisten);
}

export async function listenBankWindowClosed(
  handler: EventCallback<BankWindowClosedPayload>,
): Promise<UnlistenFn> {
  const unlisten = await listen<BankWindowClosedPayload>(
    "bank://window-closed",
    adaptCallback(handler),
  );
  return adaptUnlisten(unlisten);
}
