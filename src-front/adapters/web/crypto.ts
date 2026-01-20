// Web adapter - Sync Crypto Commands (stubs for web mode)

import type { EphemeralKeyPair } from "../types";

// Note: Sync crypto commands are not available in web mode.
// These are provided for API compatibility but will throw errors if called.

export const syncGenerateRootKey = async (): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncDeriveDek = async (_rootKey: string, _version: number): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncGenerateKeypair = async (): Promise<EphemeralKeyPair> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncComputeSharedSecret = async (
  _ourSecret: string,
  _theirPublic: string,
): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncDeriveSessionKey = async (
  _sharedSecret: string,
  _context: string,
): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncEncrypt = async (_key: string, _plaintext: string): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncDecrypt = async (_key: string, _ciphertext: string): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncGeneratePairingCode = async (): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncHashPairingCode = async (_code: string): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncComputeSas = async (_sharedSecret: string): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};

export const syncGenerateDeviceId = async (): Promise<string> => {
  throw new Error("Sync crypto operations are not available in web mode");
};
