// Keyring storage wrapper for sync-related secrets
// Uses the existing Tauri keyring integration via secrets commands
// =================================================================

import { getSecret, setSecret, logger } from "@/adapters";

// Storage key for sync identity in keychain
const SYNC_IDENTITY_KEY = "sync_identity";

/**
 * Device sync identity stored in keychain as a single JSON object
 */
export interface SyncIdentity {
  /** Storage format version for migrations */
  version: number;
  /** Device nonce - UUID generated locally, stored ONLY in keychain (not in DB) */
  deviceNonce: string;
  /** Server-assigned device ID */
  deviceId?: string;
  /** E2EE root key (base64 encoded) */
  rootKey?: string;
  /** E2EE key version (epoch) */
  keyVersion?: number;
  /** Device X25519 secret key (base64 encoded) */
  deviceSecretKey?: string;
  /** Device X25519 public key (base64 encoded) */
  devicePublicKey?: string;
}

/**
 * Migrate identity data from older versions if needed
 */
function migrateIdentity(data: Record<string, unknown>): SyncIdentity | null {
  const version = typeof data.version === "number" ? data.version : 0;

  // Version 1 had deviceId but no deviceNonce - cannot migrate
  // User needs to re-enroll
  if (version < 2) {
    return null;
  }

  return data as unknown as SyncIdentity;
}

/**
 * Get the current sync identity from keychain
 */
async function getIdentity(): Promise<SyncIdentity | null> {
  try {
    const json = await getSecret(SYNC_IDENTITY_KEY);
    if (!json) return null;
    const data = JSON.parse(json);
    return migrateIdentity(data);
  } catch (err) {
    logger.error(`[SyncKeyring] Failed to read sync identity: ${err}`);
    return null;
  }
}

/**
 * Save the sync identity to keychain
 */
async function saveIdentity(identity: SyncIdentity): Promise<void> {
  await setSecret(SYNC_IDENTITY_KEY, JSON.stringify(identity));
}

/**
 * Sync-specific keyring storage wrapper
 * Stores all sync secrets in a single keychain entry as JSON
 */
export const syncStorage = {
  /**
   * Get the server-assigned device ID.
   */
  async getDeviceId(): Promise<string | null> {
    const identity = await getIdentity();
    return identity?.deviceId ?? null;
  },

  /**
   * Get the E2EE root key.
   */
  async getRootKey(): Promise<string | null> {
    const identity = await getIdentity();
    return identity?.rootKey ?? null;
  },

  /**
   * Clear only the root key (used during key rotation or re-pairing).
   */
  async clearRootKey(): Promise<void> {
    const current = await getIdentity();
    if (current) {
      const { rootKey: _, deviceSecretKey: __, devicePublicKey: ___, ...rest } = current;
      await saveIdentity(rest as SyncIdentity);
    }
  },

  /**
   * Get the E2EE key version (epoch).
   */
  async getKeyVersion(): Promise<number | null> {
    const identity = await getIdentity();
    return identity?.keyVersion ?? null;
  },

  /**
   * Set E2EE credentials after bootstrap or pairing completion.
   * This is an atomic operation that sets rootKey, keyVersion, and optionally keypair.
   */
  async setE2EECredentials(
    rootKey: string,
    keyVersion: number,
    keypair?: { secretKey: string; publicKey: string },
  ): Promise<void> {
    const current = await getIdentity();
    if (!current) {
      throw new Error("No sync identity exists. Set device nonce first.");
    }
    await saveIdentity({
      ...current,
      rootKey,
      keyVersion,
      ...(keypair && {
        deviceSecretKey: keypair.secretKey,
        devicePublicKey: keypair.publicKey,
      }),
    });
  },
};
