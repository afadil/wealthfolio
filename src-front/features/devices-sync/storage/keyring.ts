// Keyring storage wrapper for sync-related secrets
// Uses the existing Tauri keyring integration via secrets commands
// =================================================================

import { getSecret, setSecret, deleteSecret } from "@/commands/secrets";

// Storage key for sync identity in keychain
const SYNC_IDENTITY_KEY = "sync_identity";

// Current storage format version - increment when changing the structure
const CURRENT_VERSION = 2;

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
  /** Device Ed25519 secret key (base64 encoded) */
  deviceSecretKey?: string;
  /** Device Ed25519 public key (base64 encoded) */
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
  } catch {
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
  // ─────────────────────────────────────────────────────────────────────────────
  // Device Nonce - Physical device identifier (NEVER transfers with DB)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the device nonce from keychain.
   * Returns null if not set.
   */
  async getDeviceNonce(): Promise<string | null> {
    const identity = await getIdentity();
    return identity?.deviceNonce ?? null;
  },

  /**
   * Set the device nonce. This should only be called once when first enabling sync.
   * Creates a new identity if one doesn't exist.
   */
  async setDeviceNonce(nonce: string): Promise<void> {
    const current = await getIdentity();
    if (current) {
      await saveIdentity({ ...current, deviceNonce: nonce });
    } else {
      await saveIdentity({ version: CURRENT_VERSION, deviceNonce: nonce });
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Device ID - Server-assigned identifier
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the server-assigned device ID.
   */
  async getDeviceId(): Promise<string | null> {
    const identity = await getIdentity();
    return identity?.deviceId ?? null;
  },

  /**
   * Set the device ID (received from server after enrollment).
   */
  async setDeviceId(id: string): Promise<void> {
    const current = await getIdentity();
    if (!current) {
      throw new Error("No sync identity exists. Set device nonce first.");
    }
    await saveIdentity({ ...current, deviceId: id });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Device Keypair (for E2EE)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the device Ed25519 keypair.
   */
  async getDeviceKeypair(): Promise<{ secretKey: string; publicKey: string } | null> {
    const identity = await getIdentity();
    if (!identity?.deviceSecretKey || !identity?.devicePublicKey) return null;
    return {
      secretKey: identity.deviceSecretKey,
      publicKey: identity.devicePublicKey,
    };
  },

  /**
   * Set the device Ed25519 keypair.
   */
  async setDeviceKeypair(secretKey: string, publicKey: string): Promise<void> {
    const current = await getIdentity();
    if (!current) {
      throw new Error("No sync identity exists. Set device nonce first.");
    }
    await saveIdentity({ ...current, deviceSecretKey: secretKey, devicePublicKey: publicKey });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Root Key (E2EE)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the E2EE root key.
   */
  async getRootKey(): Promise<string | null> {
    const identity = await getIdentity();
    return identity?.rootKey ?? null;
  },

  /**
   * Set the E2EE root key.
   */
  async setRootKey(keyB64: string): Promise<void> {
    const current = await getIdentity();
    if (!current) {
      throw new Error("No sync identity exists. Set device nonce first.");
    }
    await saveIdentity({ ...current, rootKey: keyB64 });
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Key Version
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the E2EE key version (epoch).
   */
  async getKeyVersion(): Promise<number | null> {
    const identity = await getIdentity();
    return identity?.keyVersion ?? null;
  },

  /**
   * Set the E2EE key version.
   */
  async setKeyVersion(version: number): Promise<void> {
    const current = await getIdentity();
    if (!current) {
      throw new Error("No sync identity exists. Set device nonce first.");
    }
    await saveIdentity({ ...current, keyVersion: version });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Bulk Operations
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Clear all sync-related secrets from keyring.
   * This resets the device to FRESH state.
   */
  async clearAll(): Promise<void> {
    try {
      await deleteSecret(SYNC_IDENTITY_KEY);
    } catch {
      // Ignore if not found
    }
  },

  /**
   * Get full identity (for state detection and debugging).
   */
  async getIdentity(): Promise<SyncIdentity | null> {
    return getIdentity();
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
