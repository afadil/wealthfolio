// Keyring storage wrapper for sync-related secrets
// Uses the existing Tauri keyring integration via secrets commands
// =================================================================

import { getSecret, setSecret, deleteSecret } from "@/commands/secrets";

// Single keychain key for all sync identity data
const SYNC_IDENTITY_KEY = "sync_identity";

// Current storage format version - increment when changing the structure
const CURRENT_VERSION = 1;

/**
 * Device sync identity stored in keychain as a single JSON object
 */
interface SyncIdentity {
  version: number; // Storage format version for migrations
  deviceId: string;
  rootKey?: string; // base64 encoded
  keyVersion?: number;
  deviceSecretKey?: string; // base64 encoded
  devicePublicKey?: string; // base64 encoded
}

/**
 * Migrate identity data from older versions if needed
 */
function migrateIdentity(data: Record<string, unknown>): SyncIdentity {
  const version = typeof data.version === "number" ? data.version : 0;

  // Version 0 (no version field) -> Version 1: just add version field
  if (version < 1) {
    return {
      version: CURRENT_VERSION,
      deviceId: data.deviceId as string,
      rootKey: data.rootKey as string | undefined,
      keyVersion: data.keyVersion as number | undefined,
      deviceSecretKey: data.deviceSecretKey as string | undefined,
      devicePublicKey: data.devicePublicKey as string | undefined,
    };
  }

  // Already current version
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
 * Update specific fields in the sync identity
 */
async function updateIdentity(updates: Partial<SyncIdentity>): Promise<void> {
  const current = await getIdentity();
  if (!current) {
    throw new Error("No sync identity exists. Set device ID first.");
  }
  await saveIdentity({ ...current, ...updates });
}

/**
 * Sync-specific keyring storage wrapper
 * Stores all sync secrets in a single keychain entry as JSON
 */
export const syncStorage = {
  // Device ID
  // ---------

  async getDeviceId(): Promise<string | null> {
    const identity = await getIdentity();
    return identity?.deviceId ?? null;
  },

  async setDeviceId(id: string): Promise<void> {
    const current = await getIdentity();
    if (current) {
      await saveIdentity({ ...current, deviceId: id });
    } else {
      await saveIdentity({ version: CURRENT_VERSION, deviceId: id });
    }
  },

  // Device Keypair (for E2EE)
  // -------------------------

  async getDeviceKeypair(): Promise<{ secretKey: string; publicKey: string } | null> {
    const identity = await getIdentity();
    if (!identity?.deviceSecretKey || !identity?.devicePublicKey) return null;
    return {
      secretKey: identity.deviceSecretKey,
      publicKey: identity.devicePublicKey,
    };
  },

  async setDeviceKeypair(secretKey: string, publicKey: string): Promise<void> {
    await updateIdentity({ deviceSecretKey: secretKey, devicePublicKey: publicKey });
  },

  // Root Key (E2EE)
  // ---------------

  async getRootKey(): Promise<string | null> {
    const identity = await getIdentity();
    return identity?.rootKey ?? null;
  },

  async setRootKey(keyB64: string): Promise<void> {
    await updateIdentity({ rootKey: keyB64 });
  },

  async clearRootKey(): Promise<void> {
    const current = await getIdentity();
    if (current) {
      const { rootKey: _, ...rest } = current;
      await saveIdentity(rest as SyncIdentity);
    }
  },

  // Key Version
  // -----------

  async getKeyVersion(): Promise<number | null> {
    const identity = await getIdentity();
    return identity?.keyVersion ?? null;
  },

  async setKeyVersion(version: number): Promise<void> {
    await updateIdentity({ keyVersion: version });
  },

  // Bulk operations
  // ---------------

  /**
   * Clear all sync-related secrets from keyring
   */
  async clearAll(): Promise<void> {
    try {
      await deleteSecret(SYNC_IDENTITY_KEY);
    } catch {
      // Ignore if not found
    }
  },

  /**
   * Check if device is initialized (has device ID stored)
   */
  async isInitialized(): Promise<boolean> {
    const identity = await getIdentity();
    return identity?.deviceId != null;
  },

  /**
   * Check if device has E2EE key material
   */
  async hasRootKey(): Promise<boolean> {
    const identity = await getIdentity();
    return identity?.rootKey != null;
  },

  /**
   * Get full identity (for debugging/export)
   */
  async getIdentity(): Promise<SyncIdentity | null> {
    return getIdentity();
  },
};
