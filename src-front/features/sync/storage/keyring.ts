// Keyring storage wrapper for sync-related secrets
// Uses the existing Tauri keyring integration via secrets commands
// =================================================================

import { getSecret, setSecret, deleteSecret } from "@/commands/secrets";

// Storage keys for sync secrets
const KEYS = {
  DEVICE_ID: "sync_device_id",
  ROOT_KEY: "sync_root_key",
  KEY_VERSION: "sync_key_version",
} as const;

/**
 * Sync-specific keyring storage wrapper
 * Provides typed helpers for storing device sync secrets
 */
export const syncStorage = {
  // Device ID
  // ---------

  /**
   * Get the device ID from keyring
   */
  async getDeviceId(): Promise<string | null> {
    try {
      return await getSecret(KEYS.DEVICE_ID);
    } catch {
      return null;
    }
  },

  /**
   * Store the device ID in keyring
   */
  async setDeviceId(id: string): Promise<void> {
    await setSecret(KEYS.DEVICE_ID, id);
  },

  /**
   * Delete the device ID from keyring
   */
  async deleteDeviceId(): Promise<void> {
    try {
      await deleteSecret(KEYS.DEVICE_ID);
    } catch {
      // Ignore if not found
    }
  },

  // Root Key (E2EE)
  // ---------------

  /**
   * Get the root key from keyring (base64 encoded string)
   */
  async getRootKey(): Promise<string | null> {
    try {
      return await getSecret(KEYS.ROOT_KEY);
    } catch {
      return null;
    }
  },

  /**
   * Store the root key in keyring (base64 encoded string)
   */
  async setRootKey(keyB64: string): Promise<void> {
    await setSecret(KEYS.ROOT_KEY, keyB64);
  },

  /**
   * Delete the root key from keyring
   */
  async deleteRootKey(): Promise<void> {
    try {
      await deleteSecret(KEYS.ROOT_KEY);
    } catch {
      // Ignore if not found
    }
  },

  // Key Version
  // -----------

  /**
   * Get the current E2EE key version
   */
  async getKeyVersion(): Promise<number | null> {
    try {
      const v = await getSecret(KEYS.KEY_VERSION);
      return v ? parseInt(v, 10) : null;
    } catch {
      return null;
    }
  },

  /**
   * Store the E2EE key version
   */
  async setKeyVersion(version: number): Promise<void> {
    await setSecret(KEYS.KEY_VERSION, String(version));
  },

  /**
   * Delete the key version
   */
  async deleteKeyVersion(): Promise<void> {
    try {
      await deleteSecret(KEYS.KEY_VERSION);
    } catch {
      // Ignore if not found
    }
  },

  // Bulk operations
  // ---------------

  /**
   * Clear all sync-related secrets from keyring
   * Use when signing out or resetting sync
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      syncStorage.deleteDeviceId(),
      syncStorage.deleteRootKey(),
      syncStorage.deleteKeyVersion(),
    ]);
  },

  /**
   * Check if device is initialized (has device ID stored)
   */
  async isInitialized(): Promise<boolean> {
    const deviceId = await syncStorage.getDeviceId();
    return deviceId !== null;
  },

  /**
   * Check if device has E2EE key material
   */
  async hasRootKey(): Promise<boolean> {
    const rootKey = await syncStorage.getRootKey();
    return rootKey !== null;
  },
};
