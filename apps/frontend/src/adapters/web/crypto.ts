// Web adapter - Sync Crypto Commands
// These call the REST API endpoints for E2EE cryptographic operations.

import { getAuthToken } from "@/lib/auth-token";
import type { EphemeralKeyPair } from "../types";
import { API_PREFIX } from "./core";

// Helper to make authenticated POST requests to crypto endpoints
async function cryptoPost<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_PREFIX}/sync/crypto/${endpoint}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const err = await res.json();
      msg = (err?.message ?? msg) as string;
    } catch {
      // ignore JSON parse error
    }
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

// Response type for endpoints that return a single string value
interface StringResponse {
  value: string;
}

export const syncGenerateRootKey = async (): Promise<string> => {
  const response = await cryptoPost<StringResponse>("generate-root-key");
  return response.value;
};

export const syncDeriveDek = async (rootKey: string, version: number): Promise<string> => {
  const response = await cryptoPost<StringResponse>("derive-dek", { rootKey, version });
  return response.value;
};

export const syncGenerateKeypair = async (): Promise<EphemeralKeyPair> => {
  return await cryptoPost<EphemeralKeyPair>("generate-keypair");
};

export const syncComputeSharedSecret = async (
  ourSecret: string,
  theirPublic: string,
): Promise<string> => {
  const response = await cryptoPost<StringResponse>("compute-shared-secret", {
    ourSecret,
    theirPublic,
  });
  return response.value;
};

export const syncDeriveSessionKey = async (
  sharedSecret: string,
  context: string,
): Promise<string> => {
  const response = await cryptoPost<StringResponse>("derive-session-key", {
    sharedSecret,
    context,
  });
  return response.value;
};

export const syncEncrypt = async (key: string, plaintext: string): Promise<string> => {
  const response = await cryptoPost<StringResponse>("encrypt", { key, plaintext });
  return response.value;
};

export const syncDecrypt = async (key: string, ciphertext: string): Promise<string> => {
  const response = await cryptoPost<StringResponse>("decrypt", { key, ciphertext });
  return response.value;
};

export const syncGeneratePairingCode = async (): Promise<string> => {
  const response = await cryptoPost<StringResponse>("generate-pairing-code");
  return response.value;
};

export const syncHashPairingCode = async (code: string): Promise<string> => {
  const response = await cryptoPost<StringResponse>("hash-pairing-code", { code });
  return response.value;
};

export const syncComputeSas = async (sharedSecret: string): Promise<string> => {
  const response = await cryptoPost<StringResponse>("compute-sas", { sharedSecret });
  return response.value;
};

export const syncGenerateDeviceId = async (): Promise<string> => {
  const response = await cryptoPost<StringResponse>("generate-device-id");
  return response.value;
};
