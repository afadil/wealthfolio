// Sync Service
// Core service for device sync, E2EE, and pairing operations
// Uses the new REST API via Tauri commands
// ===========================================================

import { invoke, logger } from "@/adapters";
import { syncStorage } from "../storage/keyring";
import * as crypto from "../crypto";
import type {
  Device,
  PairingSession,
  ClaimerSession,
  EnrollDeviceResponse,
  InitializeKeysResult,
  CommitInitializeKeysResponse,
  CreatePairingResponse,
  GetPairingResponse,
  ClaimPairingResponse,
  PairingMessagesResponse,
  ConfirmPairingResponse,
  SuccessResponse,
  ResetTeamSyncResponse,
  KeyBundlePayload,
  TrustedDeviceSummary,
} from "../types";
import { SyncError, SyncErrorCodes } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// API Command Wrappers (Tauri commands)
// ─────────────────────────────────────────────────────────────────────────────

// Device management
async function registerDeviceApi(
  displayName: string,
  instanceId: string,
): Promise<EnrollDeviceResponse> {
  return invoke("register_device", {
    displayName,
    instanceId,
  });
}

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

// Team keys (E2EE)
async function initializeTeamKeysApi(): Promise<InitializeKeysResult> {
  return invoke("initialize_team_keys");
}

async function commitInitializeTeamKeysApi(
  keyVersion: number,
  deviceKeyEnvelope: string,
  signature: string,
  challengeResponse?: string,
  recoveryEnvelope?: string,
): Promise<CommitInitializeKeysResponse> {
  return invoke("commit_initialize_team_keys", {
    keyVersion,
    deviceKeyEnvelope,
    signature,
    challengeResponse,
    recoveryEnvelope,
  });
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

async function confirmPairingApi(pairingId: string, proof?: string): Promise<ConfirmPairingResponse> {
  return invoke("confirm_pairing", { pairingId, proof });
}


// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get device display name based on the system
 */
async function getDeviceDisplayName(): Promise<string> {
  // Get platform info for display name
  const platformInfo = await invoke<{
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

  // Create a friendly display name
  const displayNameMap: Record<string, string> = {
    macos: "Mac",
    darwin: "Mac",
    windows: "Windows PC",
    linux: "Linux",
    ios: "iPhone",
    android: "Android",
  };
  const displayLabel = displayNameMap[platformInfo.os.toLowerCase()] || platformInfo.os;

  return `My ${displayLabel}`;
}

/**
 * Get the app's instance ID for device registration.
 * Uses the persisted instanceId from settings for idempotency.
 * Formats to UUID if needed (adds dashes to hex string).
 */
async function getInstanceId(): Promise<string> {
  const settings = await invoke<{ instanceId: string }>("get_settings");
  const id = settings.instanceId;

  // If already in UUID format (has dashes), return as is
  if (id.includes("-")) {
    return id;
  }

  // Convert 32-char hex string to UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  if (id.length === 32 && /^[0-9a-fA-F]+$/.test(id)) {
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`.toLowerCase();
  }

  // Return as is if format is unexpected
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Service Class
// ─────────────────────────────────────────────────────────────────────────────

// Enrollment result with mode information
export interface EnrollmentResult {
  deviceId: string;
  mode: "BOOTSTRAP" | "PAIR" | "READY";
  e2eeKeyVersion: number;
  trustedDevices?: TrustedDeviceSummary[];
  requireSas?: boolean;
  pairingTtlSeconds?: number;
}

// Result from key initialization attempt
export interface InitializeKeysAttemptResult {
  mode: "BOOTSTRAP" | "PAIRING_REQUIRED" | "READY";
  keyVersion?: number;
  trustedDevices?: TrustedDeviceSummary[];
  requireSas?: boolean;
  pairingTtlSeconds?: number;
}

/**
 * Sync Service
 * Manages device registration, E2EE key initialization, and pairing operations
 */
class SyncService {
  private deviceId: string | null = null;
  private initializationPromise: Promise<EnrollmentResult> | null = null;
  private lastEnrollmentResult: EnrollmentResult | null = null;

  /**
   * Initialize the device (register if needed)
   * Returns enrollment result with mode information
   */
  async initialize(): Promise<EnrollmentResult> {
    // If already initialized and we have the result, return it
    if (this.deviceId && this.lastEnrollmentResult) {
      return this.lastEnrollmentResult;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization with lock
    this.initializationPromise = this.doInitialize();

    try {
      const result = await this.initializationPromise;
      return result;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  private async doInitialize(): Promise<EnrollmentResult> {
    // Check for existing device ID in local storage
    const existingDeviceId = await syncStorage.getDeviceId();

    if (existingDeviceId) {
      // Verify the device still exists on the server
      try {
        const device = await getDeviceApi(existingDeviceId);
        this.deviceId = existingDeviceId;

        // Create a synthetic enrollment result for existing devices
        this.lastEnrollmentResult = {
          deviceId: existingDeviceId,
          mode: device.trustState === "trusted" ? "READY" : "PAIR",
          e2eeKeyVersion: device.trustedKeyVersion ?? 0,
        };
        return this.lastEnrollmentResult;
      } catch (err) {
        // Device was revoked/deleted - clear local state and re-register
        logger.warn(`[SyncService] Stored device no longer exists on server, re-registering: ${err}`);
        await this.clearSyncData();
        // Fall through to register a new device
      }
    }

    // Register a new device
    try {
      const displayName = await getDeviceDisplayName();
      const instanceId = await getInstanceId();

      // Platform is auto-detected by the backend
      const result = await registerDeviceApi(displayName, instanceId);

      // Store device ID in local keychain
      this.deviceId = result.deviceId;
      await syncStorage.setDeviceId(result.deviceId);

      // Build enrollment result based on mode
      if (result.mode === "BOOTSTRAP") {
        this.lastEnrollmentResult = {
          deviceId: result.deviceId,
          mode: "BOOTSTRAP",
          e2eeKeyVersion: result.e2eeKeyVersion,
        };
      } else if (result.mode === "PAIR") {
        this.lastEnrollmentResult = {
          deviceId: result.deviceId,
          mode: "PAIR",
          e2eeKeyVersion: result.e2eeKeyVersion,
          trustedDevices: result.trustedDevices,
          requireSas: result.requireSas,
          pairingTtlSeconds: result.pairingTtlSeconds,
        };
      } else {
        // READY mode
        this.lastEnrollmentResult = {
          deviceId: result.deviceId,
          mode: "READY",
          e2eeKeyVersion: result.e2eeKeyVersion,
        };
      }

      logger.info(`[SyncService] Device enrolled: ${this.deviceId}, mode: ${result.mode}`);
      return this.lastEnrollmentResult;
    } catch (err) {
      logger.error(`[SyncService] Device registration failed: ${err}`);
      throw new SyncError(SyncErrorCodes.INIT_FAILED, `Device registration failed: ${err}`);
    }
  }

  /**
   * Get the current device ID
   */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /**
   * Get the current device info from the server
   */
  async getCurrentDevice(): Promise<Device> {
    const device = await getDeviceApi();
    return { ...device, isCurrent: true };
  }

  /**
   * Get all devices for the user
   */
  async listDevices(scope?: "my" | "team"): Promise<Device[]> {
    const devices = await listDevicesApi(scope);
    return devices.map((d) => ({
      ...d,
      isCurrent: d.id === this.deviceId,
    }));
  }

  /**
   * Check if this device needs to initialize or receive E2EE keys
   */
  async checkKeyStatus(): Promise<{
    needsInitialization: boolean;
    needsPairing: boolean;
    keyVersion: number | null;
  }> {
    const [localKeyVersion, rootKey, device] = await Promise.all([
      syncStorage.getKeyVersion(),
      syncStorage.getRootKey(),
      this.getCurrentDevice().catch(() => null),
    ]);

    // No device registered
    if (!device) {
      return { needsInitialization: false, needsPairing: false, keyVersion: null };
    }

    // Device is trusted and has the correct key version
    if (device.trustState === "trusted" && rootKey && localKeyVersion === device.trustedKeyVersion) {
      return { needsInitialization: false, needsPairing: false, keyVersion: localKeyVersion };
    }

    // Check if any trusted device exists (keys are initialized)
    const devices = await this.listDevices("my");
    const hasTrustedDevice = devices.some((d) => d.trustState === "trusted");

    if (!hasTrustedDevice) {
      // No trusted devices - this device can initialize keys
      return { needsInitialization: true, needsPairing: false, keyVersion: null };
    }

    // Keys exist but this device doesn't have them - needs pairing
    return { needsInitialization: false, needsPairing: true, keyVersion: device.trustedKeyVersion };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // E2EE KEY INITIALIZATION (First trusted device)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attempt to initialize E2EE keys for the team
   * Returns the result mode - caller decides what to do next
   */
  async attemptInitializeTeamKeys(): Promise<InitializeKeysAttemptResult> {
    logger.info("[SyncService] Attempting to initialize team keys...");

    const initResponse = await initializeTeamKeysApi();

    if (initResponse.mode === "READY") {
      // Already initialized
      return {
        mode: "READY",
        keyVersion: initResponse.e2eeKeyVersion,
      };
    }

    if (initResponse.mode === "PAIRING_REQUIRED") {
      // Check if there are actually trusted devices to pair with
      // If not, treat as BOOTSTRAP (edge case after reset with no trusted devices)
      const hasTrustedDevices = initResponse.trustedDevices && initResponse.trustedDevices.length > 0;
      if (!hasTrustedDevices) {
        logger.info("[SyncService] PAIRING_REQUIRED but no trusted devices - treating as BOOTSTRAP");
        return {
          mode: "BOOTSTRAP",
          keyVersion: initResponse.e2eeKeyVersion,
        };
      }

      // Need to pair with a trusted device
      return {
        mode: "PAIRING_REQUIRED",
        keyVersion: initResponse.e2eeKeyVersion,
        trustedDevices: initResponse.trustedDevices,
        requireSas: initResponse.requireSas,
        pairingTtlSeconds: initResponse.pairingTtlSeconds,
      };
    }

    // BOOTSTRAP mode - we can initialize
    return {
      mode: "BOOTSTRAP",
      keyVersion: initResponse.keyVersion,
    };
  }

  /**
   * Initialize E2EE keys for the team (Phase 1 + Phase 2)
   * Only works in BOOTSTRAP mode
   */
  async initializeTeamKeys(): Promise<{ keyVersion: number }> {
    logger.info("[SyncService] Initializing team keys...");

    // Phase 1: Get challenge from server
    const initResponse = await initializeTeamKeysApi();

    if (initResponse.mode !== "BOOTSTRAP") {
      throw new SyncError(
        SyncErrorCodes.REQUIRES_PAIRING,
        `Cannot initialize keys in ${initResponse.mode} mode`,
      );
    }

    // Generate root key
    const rootKeyB64 = await crypto.generateRootKey();

    // Create device key envelope (encrypted root key for this device)
    // Use a derived key from the root key for the envelope
    const envelopeKey = await crypto.deriveSessionKey(rootKeyB64, "envelope");
    const deviceKeyEnvelope = await crypto.encrypt(envelopeKey, rootKeyB64);

    // Create a simple signature by hashing the commitment data
    const signatureData = `${initResponse.challenge}:${initResponse.keyVersion}:${deviceKeyEnvelope}`;
    const signature = await crypto.hashPairingCode(signatureData);

    // Phase 2: Commit the keys
    const commitResponse = await commitInitializeTeamKeysApi(
      initResponse.keyVersion,
      deviceKeyEnvelope,
      signature,
    );

    if (!commitResponse.success) {
      throw new SyncError(SyncErrorCodes.KEYS_INIT_FAILED, "Failed to commit team keys");
    }

    // Store root key locally
    await syncStorage.setRootKey(rootKeyB64);
    await syncStorage.setKeyVersion(initResponse.keyVersion);

    logger.info(`[SyncService] Team keys initialized, version: ${initResponse.keyVersion}`);
    return { keyVersion: initResponse.keyVersion };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAIRING: ISSUER (Trusted Device)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new pairing session (trusted device side)
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
      throw err;
    }
  }

  /**
   * Poll for claimer connection (issuer side)
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

    // Session is claimed when claimerEphemeralPub is present
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
   * Approve a pairing session
   */
  async approvePairing(pairingId: string): Promise<void> {
    await approvePairingApi(pairingId);
  }

  /**
   * Complete pairing by sending encrypted key bundle to claimer
   */
  async completePairing(session: PairingSession): Promise<void> {
    // Check if session has expired
    if (new Date() > session.expiresAt) {
      throw new SyncError(SyncErrorCodes.PAIRING_ENDED, "Pairing session expired");
    }

    if (!session.claimerPublicKey || !session.sessionKey || !session.claimerDeviceId) {
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
    const encryptedKeyBundle = await crypto.encrypt(
      session.sessionKey,
      JSON.stringify(keyBundle),
    );

    // Compute SAS for verification
    const sas = await crypto.computeSAS(session.sessionKey);

    // Create a simple signature by hashing the completion data
    const signatureData = `complete:${session.pairingId}:${encryptedKeyBundle}`;
    const signature = await crypto.hashPairingCode(signatureData);

    // Complete on server
    await completePairingApi(session.pairingId, encryptedKeyBundle, sas, signature);

    logger.info("[SyncService] Pairing completed successfully");
  }

  /**
   * Cancel a pairing session
   */
  async cancelPairing(pairingId: string): Promise<void> {
    await cancelPairingApi(pairingId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAIRING: CLAIMER (New Device)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Claim a pairing session using a code (claimer side)
   * Returns the claimer session with session key derived
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
      throw err;
    }
  }

  /**
   * Poll for key bundle from issuer (claimer side)
   * Returns the key bundle if available
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

    // Look for key_bundle message
    const keyBundleMsg = result.messages.find((m) => m.payloadType === "key_bundle");

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
   * Confirm pairing and store root key (claimer side)
   */
  async confirmPairingAsClaimer(
    session: ClaimerSession,
    keyBundle: KeyBundlePayload,
  ): Promise<{ keyVersion: number }> {
    // Check if session has expired
    if (new Date() > session.expiresAt) {
      throw new SyncError(SyncErrorCodes.PAIRING_ENDED, "Pairing session expired");
    }

    // Compute proof (HMAC of session data)
    const proofData = `confirm:${session.pairingId}:${keyBundle.keyVersion}`;
    const proof = await crypto.hashPairingCode(proofData);

    // Confirm with server
    const result = await confirmPairingApi(session.pairingId, proof);

    if (!result.success) {
      throw new SyncError(SyncErrorCodes.KEYS_INIT_FAILED, "Failed to confirm pairing");
    }

    // Store root key locally
    await syncStorage.setRootKey(keyBundle.rootKey);
    await syncStorage.setKeyVersion(keyBundle.keyVersion);

    logger.info(`[SyncService] Pairing confirmed, key version: ${keyBundle.keyVersion}`);
    return { keyVersion: keyBundle.keyVersion };
  }

  /**
   * Get SAS (Short Authentication String) for verification
   */
  async getSASForSession(sessionKey: string): Promise<string> {
    return crypto.computeSAS(sessionKey);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Rename a device
   */
  async renameDevice(deviceId: string, name: string): Promise<void> {
    await updateDeviceApi(deviceId, name);
  }

  /**
   * Revoke a device's trust
   */
  async revokeDevice(deviceId: string): Promise<void> {
    await revokeDeviceApi(deviceId);
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId: string): Promise<void> {
    await deleteDeviceApi(deviceId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNC RESET (Owner only)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Reset team sync - revokes all devices and requires new key initialization
   */
  async resetSync(reason?: string): Promise<{ keyVersion: number }> {
    const result = await resetTeamSyncApi(reason);

    // Clear local keys
    await syncStorage.clearRootKey();
    await syncStorage.setKeyVersion(result.keyVersion);

    return { keyVersion: result.keyVersion };
  }

  /**
   * Clear all sync data (sign out)
   */
  async clearSyncData(): Promise<void> {
    this.deviceId = null;
    this.initializationPromise = null;
    this.lastEnrollmentResult = null;

    await syncStorage.clearAll();
  }
}

// Export singleton instance
export const syncService = new SyncService();
