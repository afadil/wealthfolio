// Sync Service
// Core service for device sync, E2EE, and pairing operations
// Uses state machine model: FRESH → REGISTERED → READY (+ STALE, RECOVERY)
//
// NOTE: State detection and enable sync are now handled by the Rust backend
// (DeviceEnrollService). This service wraps those commands and handles
// pairing operations which require real-time UI interaction.
// ===========================================================================

import { invoke, logger } from "@/adapters";
import { syncStorage } from "../storage/keyring";
import * as crypto from "../crypto";
import type {
  Device,
  DeviceSyncState,
  PairingSession,
  ClaimerSession,
  CreatePairingResponse,
  GetPairingResponse,
  ClaimPairingResponse,
  PairingMessagesResponse,
  ConfirmPairingResponse,
  SuccessResponse,
  ResetTeamSyncResponse,
  KeyBundlePayload,
  TrustedDeviceSummary,
  SyncIdentity,
  StateDetectionResult,
} from "../types";
import { SyncError, SyncErrorCodes, SyncStates } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Backend Types (from DeviceEnrollService)
// ─────────────────────────────────────────────────────────────────────────────

/** Result from get_device_sync_state Tauri command */
interface BackendSyncStateResult {
  state: DeviceSyncState;
  deviceId: string | null;
  deviceName: string | null;
  keyVersion: number | null;
  serverKeyVersion: number | null;
  isTrusted: boolean;
  trustedDevices: TrustedDeviceSummary[];
}

/** Result from enable_device_sync Tauri command */
interface BackendEnableSyncResult {
  deviceId: string;
  state: DeviceSyncState;
  keyVersion: number | null;
  serverKeyVersion: number | null;
  needsPairing: boolean;
  trustedDevices: TrustedDeviceSummary[];
}

// ─────────────────────────────────────────────────────────────────────────────
// High-Level Backend Commands (DeviceEnrollService)
// ─────────────────────────────────────────────────────────────────────────────

async function getDeviceSyncStateApi(): Promise<BackendSyncStateResult> {
  return invoke("get_device_sync_state");
}

async function enableDeviceSyncApi(): Promise<BackendEnableSyncResult> {
  return invoke("enable_device_sync");
}

async function clearDeviceSyncDataApi(): Promise<void> {
  return invoke("clear_device_sync_data");
}

async function reinitializeDeviceSyncApi(): Promise<BackendEnableSyncResult> {
  return invoke("reinitialize_device_sync");
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Management Commands
// ─────────────────────────────────────────────────────────────────────────────

async function getDeviceApi(deviceId?: string): Promise<Device> {
  return invoke("get_device", { deviceId });
}

async function listDevicesApi(scope?: string): Promise<Device[]> {
  return invoke("list_devices", { scope });
}

async function updateDeviceApi(deviceId: string, displayName: string): Promise<SuccessResponse> {
  return invoke("update_device", { deviceId, displayName });
}

async function deleteDeviceApi(deviceId: string): Promise<SuccessResponse> {
  return invoke("delete_device", { deviceId });
}

async function revokeDeviceApi(deviceId: string): Promise<SuccessResponse> {
  return invoke("revoke_device", { deviceId });
}

async function resetTeamSyncApi(reason?: string): Promise<ResetTeamSyncResponse> {
  return invoke("reset_team_sync", { reason });
}

// Pairing
async function createPairingApi(
  codeHash: string,
  ephemeralPublicKey: string,
): Promise<CreatePairingResponse> {
  return invoke("create_pairing", { codeHash, ephemeralPublicKey });
}

async function getPairingApi(pairingId: string): Promise<GetPairingResponse> {
  return invoke("get_pairing", { pairingId });
}

async function approvePairingApi(pairingId: string): Promise<SuccessResponse> {
  return invoke("approve_pairing", { pairingId });
}

async function completePairingApi(
  pairingId: string,
  encryptedKeyBundle: string,
  sasProof: string | Record<string, unknown>,
  signature: string,
): Promise<SuccessResponse> {
  return invoke("complete_pairing", {
    pairingId,
    encryptedKeyBundle,
    sasProof,
    signature,
  });
}

async function cancelPairingApi(pairingId: string): Promise<SuccessResponse> {
  return invoke("cancel_pairing", { pairingId });
}

// Claimer-side pairing
async function claimPairingApi(
  code: string,
  ephemeralPublicKey: string,
): Promise<ClaimPairingResponse> {
  return invoke("claim_pairing", { code, ephemeralPublicKey });
}

async function getPairingMessagesApi(pairingId: string): Promise<PairingMessagesResponse> {
  return invoke("get_pairing_messages", { pairingId });
}

async function confirmPairingApi(
  pairingId: string,
  proof?: string,
): Promise<ConfirmPairingResponse> {
  return invoke("confirm_pairing", { pairingId, proof });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported Types
// ─────────────────────────────────────────────────────────────────────────────

/** Result from enabling device sync. */
export interface EnableSyncResult {
  deviceId: string;
  state: DeviceSyncState;
  keyVersion: number | null;
  serverKeyVersion: number | null;
  needsPairing: boolean;
  trustedDevices: TrustedDeviceSummary[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Service Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync Service
 * Manages device registration, E2EE key initialization, and pairing operations.
 * Uses state machine model for clear state transitions.
 *
 * NOTE: Core state detection and enable sync are now handled by Rust backend
 * (DeviceEnrollService). This service wraps those commands and handles
 * pairing operations which require real-time UI interaction.
 */
class SyncService {
  // ═══════════════════════════════════════════════════════════════════════════
  // STATE DETECTION (delegates to backend)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect the current sync state.
   * Delegates to Rust backend which handles keyring access and server verification.
   *
   * State Machine:
   * - FRESH: No deviceNonce in keychain (never enrolled on this physical device)
   * - REGISTERED: Have deviceNonce + deviceId, but no E2EE credentials
   * - READY: Fully operational - have all credentials and device is trusted
   * - STALE: Have local E2EE credentials but server key version is higher
   * - RECOVERY: Device ID exists locally but not found/revoked on server
   */
  async detectState(): Promise<StateDetectionResult> {
    logger.info("[SyncService] Detecting sync state...");

    try {
      const result = await getDeviceSyncStateApi();

      // Build device object if we have device info
      const device: Device | null =
        result.deviceId && result.deviceName
          ? {
              id: result.deviceId,
              userId: "",
              displayName: result.deviceName,
              platform: "macos",
              devicePublicKey: null,
              trustState: result.isTrusted ? "trusted" : "untrusted",
              trustedKeyVersion: result.serverKeyVersion ?? null,
              osVersion: null,
              appVersion: null,
              lastSeenAt: null,
              createdAt: new Date().toISOString(),
              isCurrent: true,
            }
          : null;

      // Build identity from backend result
      const identity: SyncIdentity | null = result.deviceId
        ? {
            deviceNonce: undefined, // Not exposed by backend
            deviceId: result.deviceId,
            rootKey: result.state === SyncStates.READY ? "present" : undefined,
            keyVersion: result.keyVersion ?? undefined,
          }
        : null;

      logger.info(`[SyncService] State: ${result.state}`);
      return {
        state: result.state,
        identity,
        device,
        serverKeyVersion: result.serverKeyVersion,
        trustedDevices: result.trustedDevices,
      };
    } catch (err) {
      logger.error(`[SyncService] Failed to detect state: ${err}`);
      throw SyncError.from(err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENABLE SYNC (FRESH → REGISTERED or READY)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Enable device sync by enrolling this device.
   * Delegates to Rust backend which handles:
   * - Device nonce generation
   * - Server enrollment
   * - E2EE key initialization (for BOOTSTRAP mode)
   * - Keyring storage
   *
   * Returns the result indicating if pairing is needed.
   */
  async enableSync(): Promise<EnableSyncResult> {
    logger.info("[SyncService] Enabling sync...");

    try {
      const result = await enableDeviceSyncApi();
      logger.info(
        `[SyncService] Sync enabled: deviceId=${result.deviceId}, state=${result.state}, needsPairing=${result.needsPairing}`,
      );
      return result;
    } catch (err) {
      logger.error(`[SyncService] Enable sync failed: ${err}`);
      throw SyncError.from(err, SyncErrorCodes.INIT_FAILED);
    }
  }

  /**
   * Initialize E2EE keys for the team.
   * NOTE: This is now handled automatically by enableSync() when in BOOTSTRAP mode.
   * This method is kept for backwards compatibility with existing UI code.
   */
  async initializeKeys(): Promise<{ keyVersion: number }> {
    logger.info("[SyncService] initializeKeys called - delegating to enableSync...");
    const result = await this.enableSync();
    if (result.keyVersion === null) {
      throw new SyncError(SyncErrorCodes.REQUIRES_PAIRING, "Pairing required to get keys");
    }
    return { keyVersion: result.keyVersion };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAIRING: ISSUER (Trusted Device)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new pairing session (trusted device side).
   */
  async createPairingSession(): Promise<PairingSession> {
    try {
      // Generate pairing code
      const code = await crypto.generatePairingCode();
      const codeHash = await crypto.hashPairingCode(code);

      // Generate ephemeral keypair for key exchange
      const keypair = await crypto.generateEphemeralKeypair();

      // Create session on server
      const result = await createPairingApi(codeHash, keypair.publicKey);

      return {
        pairingId: result.pairingId,
        code,
        ephemeralSecretKey: keypair.secretKey,
        ephemeralPublicKey: keypair.publicKey,
        keyVersion: result.keyVersion,
        expiresAt: new Date(result.expiresAt),
        status: "open",
        requireSas: result.requireSas,
      };
    } catch (err) {
      logger.error(`[SyncService] Failed to create pairing session: ${err}`);
      throw SyncError.from(err);
    }
  }

  /**
   * Poll for claimer connection (issuer side).
   */
  async pollForClaimerConnection(session: PairingSession): Promise<{
    claimed: boolean;
    claimerPublicKey?: string;
    claimerDeviceId?: string;
    sessionKey?: string;
  }> {
    const result = await getPairingApi(session.pairingId);

    if (result.status === "cancelled" || result.status === "expired") {
      throw new SyncError(SyncErrorCodes.PAIRING_ENDED, "Pairing session ended");
    }

    if (result.claimerEphemeralPub && result.claimerDeviceId) {
      // Compute session key using ECDH
      const sharedSecretB64 = await crypto.computeSharedSecret(
        session.ephemeralSecretKey,
        result.claimerEphemeralPub,
      );
      const sessionKeyB64 = await crypto.deriveSessionKey(sharedSecretB64, "pairing");

      return {
        claimed: true,
        claimerPublicKey: result.claimerEphemeralPub,
        claimerDeviceId: result.claimerDeviceId,
        sessionKey: sessionKeyB64,
      };
    }

    return { claimed: false };
  }

  /**
   * Approve a pairing session.
   */
  async approvePairing(pairingId: string): Promise<void> {
    await approvePairingApi(pairingId);
  }

  /**
   * Complete pairing by sending encrypted key bundle to claimer.
   * Note: The claimer's device ID is already known by the server from the claim step.
   */
  async completePairing(session: PairingSession): Promise<void> {
    if (new Date() > session.expiresAt) {
      throw new SyncError(SyncErrorCodes.PAIRING_EXPIRED, "Pairing session expired");
    }

    if (!session.claimerPublicKey || !session.sessionKey) {
      throw new SyncError(SyncErrorCodes.INVALID_SESSION, "Session not ready for key transfer");
    }

    // Load root key
    const rootKeyB64 = await syncStorage.getRootKey();
    if (!rootKeyB64) {
      throw new SyncError(SyncErrorCodes.ROOT_KEY_NOT_FOUND, "Root key not found");
    }

    const keyVersion = await syncStorage.getKeyVersion();

    // Create key bundle
    const keyBundle: KeyBundlePayload = {
      version: 1,
      rootKey: rootKeyB64,
      keyVersion: keyVersion ?? 1,
    };

    // Encrypt key bundle with session key
    const encryptedKeyBundle = await crypto.encrypt(session.sessionKey, JSON.stringify(keyBundle));

    // Compute SAS for verification
    const sas = await crypto.computeSAS(session.sessionKey);

    // Create signature
    const signatureData = `complete:${session.pairingId}:${encryptedKeyBundle}`;
    const signature = await crypto.hashPairingCode(signatureData);

    // Complete on server (server knows claimer from claim step)
    await completePairingApi(session.pairingId, encryptedKeyBundle, sas, signature);
  }

  /**
   * Cancel a pairing session.
   */
  async cancelPairing(pairingId: string): Promise<void> {
    await cancelPairingApi(pairingId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAIRING: CLAIMER (New Device)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Claim a pairing session using a code (claimer side).
   */
  async claimPairingSession(code: string): Promise<ClaimerSession> {
    try {
      // Generate ephemeral keypair for key exchange
      const keypair = await crypto.generateEphemeralKeypair();

      // Claim the session
      const result = await claimPairingApi(code, keypair.publicKey);

      // Compute session key using ECDH
      const sharedSecretB64 = await crypto.computeSharedSecret(
        keypair.secretKey,
        result.issuerEphemeralPub,
      );
      const sessionKeyB64 = await crypto.deriveSessionKey(sharedSecretB64, "pairing");

      return {
        pairingId: result.sessionId,
        code,
        ephemeralSecretKey: keypair.secretKey,
        ephemeralPublicKey: keypair.publicKey,
        issuerPublicKey: result.issuerEphemeralPub,
        sessionKey: sessionKeyB64,
        e2eeKeyVersion: result.e2eeKeyVersion,
        requireSas: result.requireSas,
        expiresAt: new Date(result.expiresAt),
        status: "claimed",
      };
    } catch (err) {
      logger.error(`[SyncService] Failed to claim pairing session: ${err}`);
      throw SyncError.from(err);
    }
  }

  /**
   * Poll for key bundle from issuer (claimer side).
   */
  async pollForKeyBundle(session: ClaimerSession): Promise<{
    received: boolean;
    keyBundle?: KeyBundlePayload;
    status: string;
  }> {
    const result = await getPairingMessagesApi(session.pairingId);

    if (result.sessionStatus === "cancelled" || result.sessionStatus === "expired") {
      throw new SyncError(SyncErrorCodes.PAIRING_ENDED, "Pairing session ended");
    }

    // Look for key bundle message (payload type is "rk_transfer_v1")
    const keyBundleMsg = result.messages.find((m) => m.payloadType === "rk_transfer_v1");

    if (keyBundleMsg) {
      try {
        // Decrypt the key bundle
        const decrypted = await crypto.decrypt(session.sessionKey, keyBundleMsg.payload);
        const parsed = JSON.parse(decrypted);

        // Validate key bundle structure
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          typeof parsed.rootKey !== "string" ||
          typeof parsed.keyVersion !== "number" ||
          !parsed.rootKey
        ) {
          throw new Error("Invalid key bundle structure");
        }

        const keyBundle: KeyBundlePayload = {
          version: typeof parsed.version === "number" ? parsed.version : 1,
          rootKey: parsed.rootKey,
          keyVersion: parsed.keyVersion,
        };

        return {
          received: true,
          keyBundle,
          status: result.sessionStatus,
        };
      } catch (err) {
        logger.error(`[SyncService] Failed to decrypt key bundle: ${err}`);
        throw new SyncError(SyncErrorCodes.INVALID_SESSION, "Failed to decrypt key bundle");
      }
    }

    return { received: false, status: result.sessionStatus };
  }

  /**
   * Confirm pairing and store root key (claimer side).
   */
  async confirmPairingAsClaimer(
    session: ClaimerSession,
    keyBundle: KeyBundlePayload,
  ): Promise<{ keyVersion: number }> {
    if (new Date() > session.expiresAt) {
      throw new SyncError(SyncErrorCodes.PAIRING_EXPIRED, "Pairing session expired");
    }

    // Compute proof (HMAC of session data)
    const proofData = `confirm:${session.pairingId}:${keyBundle.keyVersion}`;
    const proof = await crypto.hashPairingCode(proofData);

    // Confirm with server
    const result = await confirmPairingApi(session.pairingId, proof);

    if (!result.success) {
      throw new SyncError(SyncErrorCodes.KEYS_INIT_FAILED, "Failed to confirm pairing");
    }

    // Store credentials locally (atomic operation)
    await syncStorage.setE2EECredentials(keyBundle.rootKey, keyBundle.keyVersion, {
      secretKey: session.ephemeralSecretKey,
      publicKey: session.ephemeralPublicKey,
    });

    logger.info(`[SyncService] Pairing confirmed, key version: ${keyBundle.keyVersion}`);
    return { keyVersion: keyBundle.keyVersion };
  }

  /**
   * Get SAS (Short Authentication String) for verification.
   */
  async getSASForSession(sessionKey: string): Promise<string> {
    return crypto.computeSAS(sessionKey);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the current device info from the server.
   */
  async getCurrentDevice(): Promise<Device | null> {
    const deviceId = await syncStorage.getDeviceId();
    if (!deviceId) return null;

    try {
      const device = await getDeviceApi(deviceId);
      return { ...device, isCurrent: true };
    } catch (err) {
      if (SyncError.needsRecovery(err)) {
        return null;
      }
      throw SyncError.from(err);
    }
  }

  /**
   * Get all devices for the user.
   */
  async listDevices(scope?: "my" | "team"): Promise<Device[]> {
    const currentDeviceId = await syncStorage.getDeviceId();
    const devices = await listDevicesApi(scope);
    return devices.map((d) => ({
      ...d,
      isCurrent: d.id === currentDeviceId,
    }));
  }

  /**
   * Rename a device.
   */
  async renameDevice(deviceId: string, name: string): Promise<void> {
    await updateDeviceApi(deviceId, name);
  }

  /**
   * Revoke a device's trust.
   */
  async revokeDevice(deviceId: string): Promise<void> {
    await revokeDeviceApi(deviceId);
  }

  /**
   * Delete a device.
   */
  async deleteDevice(deviceId: string): Promise<void> {
    await deleteDeviceApi(deviceId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOVERY (RECOVERY → FRESH)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle recovery by clearing local state and returning to FRESH.
   * Called when user acknowledges that their device was removed.
   */
  async handleRecovery(): Promise<void> {
    logger.info("[SyncService] Handling recovery - clearing local state");
    await clearDeviceSyncDataApi();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC RESET (Owner only)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Reset team sync - revokes all devices and requires new key initialization.
   */
  async resetSync(reason?: string): Promise<{ keyVersion: number }> {
    const result = await resetTeamSyncApi(reason);

    // Clear local keys but keep device nonce and ID
    await syncStorage.clearRootKey();

    return { keyVersion: result.keyVersion };
  }

  /**
   * Clear all sync data (sign out).
   * Delegates to backend to clear keyring.
   */
  async clearSyncData(): Promise<void> {
    await clearDeviceSyncDataApi();
  }

  /**
   * Reinitialize sync - resets server data and enables sync in one operation.
   * Used when sync is in orphaned state (keys exist but no devices).
   */
  async reinitializeSync(): Promise<EnableSyncResult> {
    logger.info("[SyncService] Reinitializing sync...");
    const result = await reinitializeDeviceSyncApi();
    logger.info(`[SyncService] Sync reinitialized: state=${result.state}`);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCAL STATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the sync identity from keychain.
   */
  async getIdentity(): Promise<SyncIdentity | null> {
    return syncStorage.getIdentity();
  }

  /**
   * Get the device ID from keychain.
   */
  async getDeviceId(): Promise<string | null> {
    return syncStorage.getDeviceId();
  }

  /**
   * Get the root key from keychain.
   */
  async getRootKey(): Promise<string | null> {
    return syncStorage.getRootKey();
  }

  /**
   * Get the key version from keychain.
   */
  async getKeyVersion(): Promise<number | null> {
    return syncStorage.getKeyVersion();
  }
}

// Export singleton instance
export const syncService = new SyncService();
