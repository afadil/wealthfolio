// Cryptographic utilities for E2EE device sync
// Delegates to Rust backend for all crypto operations
// ====================================================

import {
  syncGenerateRootKey,
  syncDeriveDek,
  syncGenerateKeypair,
  syncComputeSharedSecret,
  syncDeriveSessionKey,
  syncEncrypt,
  syncDecrypt,
  syncGeneratePairingCode,
  syncHashPairingCode,
  syncComputeSas,
  syncGenerateDeviceId,
  type EphemeralKeyPair,
} from "@/adapters";

export type { EphemeralKeyPair };

// Base64 utilities (kept for convenience)
// ----------------------------------------

/**
 * Encode bytes to base64 string
 */
export function base64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Decode base64 string to bytes
 */
export function base64Decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

// Root Key operations
// -------------------

/**
 * Generate a new 256-bit root key for E2EE
 * Returns base64-encoded key
 */
export async function generateRootKey(): Promise<string> {
  return syncGenerateRootKey();
}

/**
 * Derive a Data Encryption Key (DEK) from the Root Key
 * Uses HKDF-SHA256 with version for key rotation
 * Returns base64-encoded DEK
 */
export async function deriveDEK(rootKeyB64: string, version = 1): Promise<string> {
  return syncDeriveDek(rootKeyB64, version);
}

// Ephemeral key operations for pairing
// ------------------------------------

/**
 * Generate an ephemeral X25519 keypair for ECDH key exchange during pairing
 * Returns base64-encoded keys
 */
export async function generateEphemeralKeypair(): Promise<EphemeralKeyPair> {
  return syncGenerateKeypair();
}

/**
 * Compute ECDH shared secret from our secret key and peer's public key
 * All inputs/outputs are base64-encoded
 */
export async function computeSharedSecret(
  ourSecretB64: string,
  theirPublicB64: string,
): Promise<string> {
  return syncComputeSharedSecret(ourSecretB64, theirPublicB64);
}

/**
 * Derive a session key from shared secret
 * Context is used for domain separation (e.g., "pairing", "sync")
 * Returns base64-encoded session key
 */
export async function deriveSessionKey(
  sharedSecretB64: string,
  context = "pairing",
): Promise<string> {
  return syncDeriveSessionKey(sharedSecretB64, context);
}

// Encryption/Decryption
// ---------------------

/**
 * Encrypt data with XChaCha20-Poly1305
 * Returns base64-encoded ciphertext (includes nonce)
 */
export async function encrypt(keyB64: string, plaintext: string): Promise<string> {
  return syncEncrypt(keyB64, plaintext);
}

/**
 * Decrypt data with XChaCha20-Poly1305
 * Input is base64-encoded ciphertext (includes nonce)
 * @throws if authentication fails
 */
export async function decrypt(keyB64: string, ciphertextB64: string): Promise<string> {
  return syncDecrypt(keyB64, ciphertextB64);
}

// Pairing code utilities
// ----------------------

/**
 * Generate a random 6-character pairing code
 * Uses alphanumeric characters excluding ambiguous ones
 */
export async function generatePairingCode(): Promise<string> {
  return syncGeneratePairingCode();
}

/**
 * Hash a pairing code for server-side verification
 * Returns base64-encoded SHA-256 hash
 */
export async function hashPairingCode(code: string): Promise<string> {
  return syncHashPairingCode(code);
}

// Short Authentication String (SAS)
// ----------------------------------

/**
 * Compute a 6-digit SAS code from the shared secret
 * Used for out-of-band verification during pairing
 */
export async function computeSAS(sharedSecretB64: string): Promise<string> {
  return syncComputeSas(sharedSecretB64);
}

// Device ID generation
// --------------------

/**
 * Generate a new device ID (UUIDv4)
 */
export async function generateDeviceId(): Promise<string> {
  return syncGenerateDeviceId();
}
