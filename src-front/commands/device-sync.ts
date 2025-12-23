// Device Sync Commands
// Wraps Tauri commands for device registration, pairing, and E2EE operations
// ==========================================================================

import { getRunEnv, invokeTauri, logger, RUN_ENV } from "@/adapters";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceInfo {
  name: string;
  platform: string;
  appVersion: string;
  osVersion?: string;
}

export interface DeviceRegistrationResponse {
  deviceId: string;
  trustState: string;
  trustedKeyVersion: number | null;
}

export interface Device {
  id: string;
  userId: string;
  name: string;
  platform: string;
  appVersion: string | null;
  osVersion: string | null;
  trustState: string;
  trustedKeyVersion: number | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface SyncStatus {
  e2eeEnabled: boolean;
  e2eeKeyVersion: number;
  requireSas: boolean;
  pairingTtlSeconds: number;
  resetAt: string | null;
}

export interface EnableE2eeResponse {
  e2eeEnabled: boolean;
  e2eeKeyVersion: number;
}

export interface CreatePairingResponse {
  sessionId: string;
  expiresAt: string;
}

export interface ClaimPairingResponse {
  sessionId: string;
  issuerEphPub: string; // base64
  requireSas: boolean;
  expiresAt: string;
}

export interface PairingMessage {
  id: string;
  payloadType: string;
  payload: string; // base64
  createdAt: string;
}

export interface PollMessagesResponse {
  sessionStatus: string;
  messages: PairingMessage[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DESKTOP_ONLY_ERROR = "Device sync is only supported on desktop. Please use the desktop app.";

const assertDesktop = () => {
  if (getRunEnv() !== RUN_ENV.DESKTOP) {
    throw new Error(DESKTOP_ONLY_ERROR);
  }
};

const invokeDesktop = async <T>(command: string, payload?: Record<string, unknown>): Promise<T> => {
  assertDesktop();
  return invokeTauri<T>(command, payload);
};

// ─────────────────────────────────────────────────────────────────────────────
// Device ID Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the stored device ID from the keyring
 */
export const getDeviceId = async (): Promise<string | null> => {
  try {
    return await invokeDesktop<string | null>("get_device_id");
  } catch (error) {
    logger.error("Error getting device ID");
    throw error;
  }
};

/**
 * Store the device ID in the keyring
 */
export const setDeviceId = async (deviceId: string): Promise<void> => {
  try {
    return await invokeDesktop("set_device_id", { deviceId });
  } catch (error) {
    logger.error("Error setting device ID");
    throw error;
  }
};

/**
 * Clear the device ID from the keyring
 */
export const clearDeviceId = async (): Promise<void> => {
  try {
    return await invokeDesktop("clear_device_id");
  } catch (error) {
    logger.error("Error clearing device ID");
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Device Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a new device with the cloud API
 */
export const registerDevice = async (
  deviceInfo: DeviceInfo,
): Promise<DeviceRegistrationResponse> => {
  try {
    return await invokeDesktop("register_device", { deviceInfo });
  } catch (error) {
    logger.error("Error registering device");
    throw error;
  }
};

/**
 * Get the current device info from the cloud API
 */
export const getCurrentDevice = async (): Promise<Device> => {
  try {
    return await invokeDesktop("get_current_device");
  } catch (error) {
    logger.error("Error getting current device");
    throw error;
  }
};

/**
 * List all devices for the team
 */
export const listDevices = async (): Promise<Device[]> => {
  try {
    return await invokeDesktop("list_devices");
  } catch (error) {
    logger.error("Error listing devices");
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sync Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the team's sync status
 */
export const getSyncStatus = async (): Promise<SyncStatus> => {
  try {
    return await invokeDesktop("get_sync_status");
  } catch (error) {
    logger.error("Error getting sync status");
    throw error;
  }
};

/**
 * Enable E2EE for the team (owner only)
 */
export const enableE2ee = async (): Promise<EnableE2eeResponse> => {
  try {
    return await invokeDesktop("enable_e2ee");
  } catch (error) {
    logger.error("Error enabling E2EE");
    throw error;
  }
};

/**
 * Reset sync for the team (owner only)
 */
export const resetSync = async (): Promise<EnableE2eeResponse> => {
  try {
    return await invokeDesktop("reset_sync");
  } catch (error) {
    logger.error("Error resetting sync");
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pairing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new pairing session (issuer/trusted device)
 */
export const createPairing = async (
  codeHash: string,
  ephemeralPublicKey: string,
): Promise<CreatePairingResponse> => {
  try {
    return await invokeDesktop("create_pairing", { codeHash, ephemeralPublicKey });
  } catch (error) {
    logger.error("Error creating pairing session");
    throw error;
  }
};

/**
 * Claim a pairing session (claimer/new device)
 */
export const claimPairing = async (
  code: string,
  ephemeralPublicKey: string,
): Promise<ClaimPairingResponse> => {
  try {
    return await invokeDesktop("claim_pairing", { code, ephemeralPublicKey });
  } catch (error) {
    logger.error("Error claiming pairing session");
    throw error;
  }
};

/**
 * Approve a pairing session (issuer)
 */
export const approvePairing = async (sessionId: string): Promise<void> => {
  try {
    return await invokeDesktop("approve_pairing", { sessionId });
  } catch (error) {
    logger.error("Error approving pairing session");
    throw error;
  }
};

/**
 * Cancel a pairing session
 */
export const cancelPairing = async (sessionId: string): Promise<void> => {
  try {
    return await invokeDesktop("cancel_pairing", { sessionId });
  } catch (error) {
    logger.error("Error canceling pairing session");
    throw error;
  }
};

/**
 * Poll for pairing messages
 */
export const pollPairingMessages = async (sessionId: string): Promise<PollMessagesResponse> => {
  try {
    return await invokeDesktop("poll_pairing_messages", { sessionId });
  } catch (error) {
    logger.error("Error polling pairing messages");
    throw error;
  }
};

/**
 * Send a pairing message (e.g., encrypted root key)
 */
export const sendPairingMessage = async (
  sessionId: string,
  toDeviceId: string,
  payloadType: string,
  payload: string,
): Promise<void> => {
  try {
    return await invokeDesktop("send_pairing_message", {
      sessionId,
      toDeviceId,
      payloadType,
      payload,
    });
  } catch (error) {
    logger.error("Error sending pairing message");
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Device Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a device as trusted (after successful pairing)
 */
export const markDeviceTrusted = async (deviceId: string, keyVersion: number): Promise<void> => {
  try {
    return await invokeDesktop("mark_device_trusted", { deviceId, keyVersion });
  } catch (error) {
    logger.error("Error marking device as trusted");
    throw error;
  }
};

/**
 * Rename a device
 */
export const renameDevice = async (deviceId: string, name: string): Promise<void> => {
  try {
    return await invokeDesktop("rename_device", { deviceId, name });
  } catch (error) {
    logger.error("Error renaming device");
    throw error;
  }
};

/**
 * Revoke a device's access
 */
export const revokeDevice = async (deviceId: string): Promise<void> => {
  try {
    return await invokeDesktop("revoke_device", { deviceId });
  } catch (error) {
    logger.error("Error revoking device");
    throw error;
  }
};
