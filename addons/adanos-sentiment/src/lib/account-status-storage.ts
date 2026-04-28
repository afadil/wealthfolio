import type { AdanosAccountStatus } from "../types";

const STORAGE_KEY = "adanos_account_status";

interface StoredAccountStatus {
  keySuffix: string;
  status: AdanosAccountStatus;
}

function getKeySuffix(apiKey: string): string {
  return apiKey.slice(-6);
}

export function loadStoredAccountStatus(apiKey: string | null): AdanosAccountStatus | null {
  if (!apiKey) {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredAccountStatus;
    if (!parsed?.status || parsed.keySuffix !== getKeySuffix(apiKey)) {
      return null;
    }

    return parsed.status;
  } catch {
    return null;
  }
}

export function saveStoredAccountStatus(apiKey: string, status: AdanosAccountStatus): void {
  const payload: StoredAccountStatus = {
    keySuffix: getKeySuffix(apiKey),
    status,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredAccountStatus(): void {
  localStorage.removeItem(STORAGE_KEY);
}
