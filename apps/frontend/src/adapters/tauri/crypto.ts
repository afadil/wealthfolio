// Sync Crypto Commands
import type { EphemeralKeyPair } from "../types";

import { invoke } from "./core";

export const syncGenerateRootKey = async (): Promise<string> => {
  return invoke<string>("sync_generate_root_key");
};

export const syncDeriveDek = async (rootKey: string, version: number): Promise<string> => {
  return invoke<string>("sync_derive_dek", { rootKey, version });
};

export const syncGenerateKeypair = async (): Promise<EphemeralKeyPair> => {
  return invoke<EphemeralKeyPair>("sync_generate_keypair");
};

export const syncComputeSharedSecret = async (
  ourSecret: string,
  theirPublic: string,
): Promise<string> => {
  return invoke<string>("sync_compute_shared_secret", { ourSecret, theirPublic });
};

export const syncDeriveSessionKey = async (
  sharedSecret: string,
  context: string,
): Promise<string> => {
  return invoke<string>("sync_derive_session_key", { sharedSecret, context });
};

export const syncEncrypt = async (key: string, plaintext: string): Promise<string> => {
  return invoke<string>("sync_encrypt", { key, plaintext });
};

export const syncDecrypt = async (key: string, ciphertext: string): Promise<string> => {
  return invoke<string>("sync_decrypt", { key, ciphertext });
};

export const syncGeneratePairingCode = async (): Promise<string> => {
  return invoke<string>("sync_generate_pairing_code");
};

export const syncHashPairingCode = async (code: string): Promise<string> => {
  return invoke<string>("sync_hash_pairing_code", { code });
};

export const syncComputeSas = async (sharedSecret: string): Promise<string> => {
  return invoke<string>("sync_compute_sas", { sharedSecret });
};

export const syncGenerateDeviceId = async (): Promise<string> => {
  return invoke<string>("sync_generate_device_id");
};
