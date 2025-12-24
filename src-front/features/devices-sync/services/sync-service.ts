// Sync Service
// Core service for device sync, E2EE, and pairing operations
// ===========================================================

import { invokeTauri, logger } from "@/adapters/tauri";
import { syncStorage } from "../storage/keyring";
import * as crypto from "../crypto";
import type {
  Device,
  SyncStatus,
  PairingSession,
  ClaimResult,
  DeviceRegistration,
  DeviceRegistrationResponse,
  EnableE2EEResponse,
  TrustedDeviceInfo,
  CreatePairingResponse,
  ClaimPairingResponse,
  PollMessagesResponse,
  GetSessionResponse,
  RootKeyPayload,
} from "../types";
import { SyncError, SyncErrorCodes } from "../types";

// API command wrappers
async function registerDeviceApi(
  deviceInfo: DeviceRegistration,
): Promise<DeviceRegistrationResponse> {
  return invokeTauri("register_device", { deviceInfo });
}

async function getCurrentDeviceApi(): Promise<Device> {
  return invokeTauri("get_current_device");
}

async function listDevicesApi(): Promise<Device[]> {
  return invokeTauri("list_devices");
}

async function getSyncStatusApi(): Promise<SyncStatus> {
  return invokeTauri("get_sync_status");
}

async function enableE2eeApi(): Promise<EnableE2EEResponse> {
  return invokeTauri("enable_e2ee");
}

async function createPairingApi(
  codeHash: string,
  ephemeralPublicKey: string,
): Promise<CreatePairingResponse> {
  return invokeTauri("create_pairing", {
    codeHash,
    ephemeralPublicKey,
  });
}

async function claimPairingApi(
  code: string,
  ephemeralPublicKey: string,
): Promise<ClaimPairingResponse> {
  return invokeTauri("claim_pairing", {
    code,
    ephemeralPublicKey,
  });
}

async function approvePairingApi(sessionId: string): Promise<void> {
  return invokeTauri("approve_pairing", { sessionId });
}

async function cancelPairingApi(sessionId: string): Promise<void> {
  return invokeTauri("cancel_pairing", { sessionId });
}

async function pollMessagesApi(sessionId: string): Promise<PollMessagesResponse> {
  return invokeTauri("poll_pairing_messages", { sessionId });
}

async function getSessionApi(sessionId: string): Promise<GetSessionResponse> {
  return invokeTauri("get_pairing_session", { sessionId });
}

async function sendMessageApi(
  sessionId: string,
  toDeviceId: string,
  payloadType: string,
  payload: string,
): Promise<void> {
  return invokeTauri("send_pairing_message", { sessionId, toDeviceId, payloadType, payload });
}

async function markTrustedApi(deviceId: string, keyVersion: number): Promise<void> {
  return invokeTauri("mark_device_trusted", { deviceId, keyVersion });
}

async function renameDeviceApi(deviceId: string, name: string): Promise<void> {
  return invokeTauri("rename_device", { deviceId, name });
}

async function revokeDeviceApi(deviceId: string): Promise<void> {
  return invokeTauri("revoke_device", { deviceId });
}

async function resetSyncApi(): Promise<EnableE2EEResponse> {
  return invokeTauri("reset_sync");
}

/**
 * Get device information from the system
 */
async function getDeviceInfo(): Promise<DeviceRegistration> {
  // Get platform info
  const platformInfo = await invokeTauri<{
    os: string;
    arch: string;
    is_mobile: boolean;
    is_desktop: boolean;
  }>("get_platform").catch(() => ({
    os: "unknown",
    arch: "unknown",
    is_mobile: false,
    is_desktop: true,
  }));

  // Get app info
  const appInfo = await invokeTauri<{
    version: string;
  }>("get_app_info").catch(() => ({ version: "1.0.0" }));

  // Map OS to platform
  const platformMap: Record<string, string> = {
    macos: "mac",
    darwin: "mac",
    windows: "windows",
    linux: "linux",
    ios: "ios",
    android: "android",
  };

  const platform = platformMap[platformInfo.os.toLowerCase()] || platformInfo.os;

  return {
    name: `My ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
    platform,
    appVersion: appInfo.version,
    osVersion: platformInfo.os,
  };
}

/**
 * Sync Service
 * Manages device registration, E2EE, and pairing operations
 */
class SyncService {
  private deviceId: string | null = null;
  private initializationPromise: Promise<string> | null = null;

  /**
   * Initialize the device (register if needed)
   * Returns the device ID
   * Throws DEVICE_NOT_FOUND if stored device no longer exists on server
   *
   * Uses a singleton lock to prevent concurrent initialization and double registration
   */
  async initialize(): Promise<string> {
    // If already initialized, return cached device ID
    if (this.deviceId) {
      return this.deviceId;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization with lock
    this.initializationPromise = this.doInitialize();

    try {
      const deviceId = await this.initializationPromise;
      return deviceId;
    } finally {
      // Clear the promise after completion (success or failure)
      this.initializationPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  private async doInitialize(): Promise<string> {
    // Double-check keyring for existing device ID (in case of race condition)
    const existingDeviceId = await syncStorage.getDeviceId();

    if (existingDeviceId) {
      // Store it in Tauri keyring as well (for API calls)
      await invokeTauri("set_device_id", { deviceId: existingDeviceId }).catch(() => {
        // Ignore - may already be set
      });

      // Verify the device still exists on the server (may have been revoked)
      try {
        await getCurrentDeviceApi();
        this.deviceId = existingDeviceId;
        return this.deviceId;
      } catch (err) {
        // Device was revoked/deleted - clear local state and re-register
        logger.warn(`[SyncService] Stored device no longer exists on server, re-registering: ${err}`);
        await this.clearSyncData();
        // Fall through to register a new device
      }
    }

    // Register with cloud API - server generates the device ID
    try {
      const deviceInfo = await getDeviceInfo();
      const result = await registerDeviceApi(deviceInfo);
      this.deviceId = result.deviceId;
    } catch (err) {
      logger.error(`[SyncService] Device registration failed: ${err}`);
      throw err;
    }

    // Store in keyring (both frontend storage and Tauri backend)
    try {
      await syncStorage.setDeviceId(this.deviceId);
    } catch (err) {
      logger.error(`[SyncService] Failed to store device ID in frontend keyring: ${err}`);
      this.deviceId = null;
      throw new SyncError(
        SyncErrorCodes.INIT_FAILED,
        `Failed to store device ID: ${err}`,
      );
    }

    // Verify storage was successful
    try {
      const storedId = await syncStorage.getDeviceId();
      if (storedId !== this.deviceId) {
        logger.error(`[SyncService] Device ID verification failed. Expected: ${this.deviceId}, Got: ${storedId}`);
        this.deviceId = null;
        throw new SyncError(
          SyncErrorCodes.INIT_FAILED,
          "Device ID storage verification failed",
        );
      }
    } catch (err) {
      if (err instanceof SyncError) throw err;
      logger.error(`[SyncService] Failed to verify device ID storage: ${err}`);
      this.deviceId = null;
      throw new SyncError(SyncErrorCodes.INIT_FAILED, `Failed to verify device ID: ${err}`);
    }

    // Store in Tauri backend keyring (for Rust API calls)
    try {
      await invokeTauri("set_device_id", { deviceId: this.deviceId });
    } catch (err) {
      logger.error(`[SyncService] Failed to store device ID in Tauri keyring: ${err}`);
      // Don't fail here - frontend storage succeeded, Tauri can use get_secret fallback
    }

    return this.deviceId;
  }

  /**
   * Verify the device still exists on server
   * If not, clear local data and throw DEVICE_NOT_FOUND
   */
  async verifyDeviceExists(): Promise<Device> {
    try {
      return await getCurrentDeviceApi();
    } catch (error) {
      if (SyncError.isDeviceNotFound(error)) {
        // Device was revoked/deleted - clear local state
        await this.clearSyncData();
        throw new SyncError(
          SyncErrorCodes.DEVICE_NOT_FOUND,
          "This device was unpaired. Please re-register.",
          true,
        );
      }
      throw error;
    }
  }

  /**
   * Get the current device ID
   */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /**
   * Fetch sync status from the server
   */
  async getSyncStatus(): Promise<SyncStatus> {
    return getSyncStatusApi();
  }

  /**
   * Get the current device info from the server
   */
  async getCurrentDevice(): Promise<Device> {
    const device = await getCurrentDeviceApi();
    return { ...device, isCurrent: true };
  }

  /**
   * Get all devices for the team (internal use for pairing)
   */
  private async getDevices(): Promise<Device[]> {
    const devices = await listDevicesApi();
    return devices.map((d) => ({
      ...d,
      isCurrent: d.id === this.deviceId,
    }));
  }

  /**
   * Enable E2EE for the team
   * Returns either:
   * - { status: "initialized", keyVersion } - first device, generates RK
   * - { status: "requires_pairing", keyVersion, trustedDevices } - needs pairing
   */
  async enableE2EE(): Promise<
    | { status: "initialized"; keyVersion: number }
    | { status: "requires_pairing"; keyVersion: number; trustedDevices: TrustedDeviceInfo[] }
  > {
    // Ensure device is registered first
    if (!this.deviceId) {
      throw new SyncError("NO_DEVICE", "Device not initialized. Call initialize() first.");
    }

    try {
      const result = await enableE2eeApi();

      if (result.status === "initialized") {
        // Bootstrap device - generate and store Root Key locally
        const rootKeyB64 = await crypto.generateRootKey();
        await syncStorage.setRootKey(rootKeyB64);
        await syncStorage.setKeyVersion(result.e2eeKeyVersion);

        return { status: "initialized", keyVersion: result.e2eeKeyVersion };
      } else {
        // Secondary device - needs pairing
        return {
          status: "requires_pairing",
          keyVersion: result.e2eeKeyVersion,
          trustedDevices: result.trustedDevices,
        };
      }
    } catch (err) {
      logger.error(`[SyncService] Failed to enable E2EE: ${err}`);
      throw err;
    }
  }

  /**
   * Check if device needs pairing
   *
   * A device needs pairing if:
   * 1. E2EE is enabled but device has no root key locally
   * 2. The local key version doesn't match the server's key version (sync was reset)
   *
   * If the device has the correct root key, it's considered trusted regardless
   * of the server-side trust state (which is just metadata for record-keeping).
   */
  async checkTrustStatus(): Promise<{
    needsPairing: boolean;
    reason?: "no_key" | "version_mismatch";
  }> {
    const [syncStatus, localKeyVersion, rootKey] = await Promise.all([
      this.getSyncStatus(),
      syncStorage.getKeyVersion(),
      syncStorage.getRootKey(),
    ]);

    if (!syncStatus.e2eeEnabled) {
      return { needsPairing: false };
    }

    if (!rootKey) {
      return { needsPairing: true, reason: "no_key" };
    }

    if (localKeyVersion !== syncStatus.e2eeKeyVersion) {
      // Key version mismatch - sync was reset
      await syncStorage.deleteRootKey();
      return { needsPairing: true, reason: "version_mismatch" };
    }

    // Device has the root key with correct version - it's trusted
    return { needsPairing: false };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAIRING: ISSUER (Trusted Device)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new pairing session
   */
  async createPairingSession(): Promise<PairingSession> {
    try {
      // Generate pairing code
      const code = await crypto.generatePairingCode();
      const codeHash = await crypto.hashPairingCode(code);

      // Generate ephemeral keypair (returns base64 strings)
      const keypair = await crypto.generateEphemeralKeypair();

      // Create session on server
      const result = await createPairingApi(codeHash, keypair.publicKey);

      return {
        sessionId: result.sessionId,
        code,
        ephemeralSecretKey: keypair.secretKey,
        ephemeralPublicKey: keypair.publicKey,
        expiresAt: new Date(result.expiresAt),
        status: "open",
      };
    } catch (err) {
      logger.error(`[SyncService] Failed to create pairing session: ${err}`);
      throw err;
    }
  }

  /**
   * Approve a pairing session
   */
  async approvePairing(sessionId: string): Promise<void> {
    await approvePairingApi(sessionId);
  }

  /**
   * Send the root key to the claimer device
   */
  async sendRootKey(session: PairingSession): Promise<void> {
    logger.info(`[SyncService] sendRootKey called with session: ${JSON.stringify({
      sessionId: session.sessionId,
      hasClaimerPublicKey: !!session.claimerPublicKey,
      hasSessionKey: !!session.sessionKey,
      claimerDeviceId: session.claimerDeviceId,
    })}`);

    if (!session.claimerPublicKey || !session.sessionKey || !session.claimerDeviceId) {
      throw new SyncError("INVALID_SESSION", "Session not ready for key transfer");
    }

    // Load RK from keyring
    const rootKeyB64 = await syncStorage.getRootKey();
    if (!rootKeyB64) {
      throw new SyncError("ROOT_KEY_NOT_FOUND", "Root key not found");
    }

    const keyVersion = await syncStorage.getKeyVersion();

    // Encrypt RK with session key (returns base64 ciphertext with nonce)
    const ciphertextB64 = await crypto.encrypt(session.sessionKey, rootKeyB64);

    // Package payload
    const payload: RootKeyPayload = {
      version: 1,
      ciphertext: ciphertextB64,
      keyVersion: keyVersion ?? 1,
    };

    // Send to claimer device (base64 encode the JSON payload)
    logger.info(`[SyncService] Sending root key to claimer device ${session.claimerDeviceId}...`);
    await sendMessageApi(
      session.sessionId,
      session.claimerDeviceId,
      "rk_transfer_v1",
      btoa(JSON.stringify(payload)),
    );
    logger.info(`[SyncService] Root key sent successfully`);
  }

  /**
   * Cancel a pairing session
   */
  async cancelPairing(sessionId: string): Promise<void> {
    await cancelPairingApi(sessionId);
  }

  /**
   * Poll for claimer connection (issuer side)
   * Returns claimer's public key when session is claimed
   */
  async pollForClaimerConnection(session: PairingSession): Promise<{
    claimed: boolean;
    claimerPublicKey?: string;
    claimerDeviceId?: string;
    sessionKey?: string;
  }> {
    const result = await getSessionApi(session.sessionId);

    if (result.status === "cancelled" || result.status === "expired") {
      throw new SyncError("PAIRING_ENDED", "Pairing session ended");
    }

    // Session is claimed when claimerEphPub is present
    if (result.claimerEphPub && result.claimerDeviceId) {
      const claimerPublicKey = result.claimerEphPub;

      // Compute session key using ECDH
      const sharedSecretB64 = await crypto.computeSharedSecret(
        session.ephemeralSecretKey,
        claimerPublicKey,
      );
      const sessionKeyB64 = await crypto.deriveSessionKey(sharedSecretB64, "pairing");

      return {
        claimed: true,
        claimerPublicKey,
        claimerDeviceId: result.claimerDeviceId,
        sessionKey: sessionKeyB64,
      };
    }

    return { claimed: false };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAIRING: CLAIMER (New Device)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Claim a pairing session
   */
  async claimPairingSession(code: string): Promise<ClaimResult> {
    // Generate ephemeral keypair (returns base64 strings)
    const keypair = await crypto.generateEphemeralKeypair();

    // Claim session
    const result = await claimPairingApi(code, keypair.publicKey);

    // Compute shared secret and session key (all base64)
    const sharedSecretB64 = await crypto.computeSharedSecret(
      keypair.secretKey,
      result.issuerEphPub,
    );
    const sessionKeyB64 = await crypto.deriveSessionKey(sharedSecretB64, "pairing");

    // Send our public key to the issuer so they can compute the session key
    // This allows the issuer to verify SAS and send the root key
    try {
      // Find the issuer device (trusted device)
      const devices = await this.getDevices();
      const issuerDevice = devices.find((d) => d.trustState === "trusted");
      if (issuerDevice) {
        await sendMessageApi(
          result.sessionId,
          issuerDevice.id,
          "claimer_eph_pub",
          btoa(keypair.publicKey),
        );
      }
    } catch (err) {
      // Non-fatal: issuer may still get our key from session status
      logger.error(`[SyncService] Failed to send claimer public key: ${err}`);
    }

    return {
      sessionId: result.sessionId,
      issuerPublicKey: result.issuerEphPub,
      sessionKey: sessionKeyB64,
      requireSas: result.requireSas,
      expiresAt: new Date(result.expiresAt),
    };
  }

  /**
   * Poll for root key from issuer
   */
  async pollForRootKey(claim: ClaimResult): Promise<boolean> {
    logger.debug(`[SyncService] Polling for root key, sessionId: ${claim.sessionId}`);
    const result = await pollMessagesApi(claim.sessionId);

    logger.debug(`[SyncService] Poll result: status=${result.sessionStatus}, messages=${result.messages.length}`);

    if (result.sessionStatus === "cancelled" || result.sessionStatus === "expired") {
      throw new SyncError("PAIRING_ENDED", "Pairing session ended");
    }

    const rkMessage = result.messages.find((m) => m.payloadType === "rk_transfer_v1");
    if (!rkMessage) {
      return false; // Keep polling
    }

    logger.info(`[SyncService] Received root key message, decrypting...`);
    // Decrypt and store RK
    await this.receiveRootKey(rkMessage.payload, claim.sessionKey);
    logger.info(`[SyncService] Root key received and stored successfully`);
    return true;
  }

  /**
   * Receive and store the root key from pairing
   */
  private async receiveRootKey(payloadB64: string, sessionKeyB64: string): Promise<void> {
    const payloadJson = atob(payloadB64);
    const payload: RootKeyPayload = JSON.parse(payloadJson);

    // Decrypt RK (session key and ciphertext are base64)
    const rootKeyB64 = await crypto.decrypt(sessionKeyB64, payload.ciphertext);

    // Store in keyring
    await syncStorage.setRootKey(rootKeyB64);
    await syncStorage.setKeyVersion(payload.keyVersion);

    // Mark device as trusted
    await markTrustedApi(this.deviceId!, payload.keyVersion);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rename a device
   */
  async renameDevice(deviceId: string, name: string): Promise<void> {
    await renameDeviceApi(deviceId, name);
  }

  /**
   * Revoke a device
   */
  async revokeDevice(deviceId: string): Promise<void> {
    await revokeDeviceApi(deviceId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC RESET (Owner only)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Reset sync - revokes all devices and requires new pairing
   */
  async resetSync(): Promise<{ keyVersion: number }> {
    // Reset on server
    const result = await resetSyncApi();

    // Generate new RK (now returns base64 string)
    const rootKeyB64 = await crypto.generateRootKey();
    await syncStorage.setRootKey(rootKeyB64);
    await syncStorage.setKeyVersion(result.e2eeKeyVersion);

    // Mark current device as trusted
    await markTrustedApi(this.deviceId!, result.e2eeKeyVersion);

    return { keyVersion: result.e2eeKeyVersion };
  }

  /**
   * Clear all sync data (sign out)
   */
  async clearSyncData(): Promise<void> {
    // Reset initialization state
    this.deviceId = null;
    this.initializationPromise = null;

    // Clear storage
    await syncStorage.clearAll();
    await invokeTauri("clear_device_id").catch(() => {
      // Ignore
    });
  }
}

// Export singleton instance
export const syncService = new SyncService();
