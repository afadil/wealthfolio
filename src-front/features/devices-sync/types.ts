// Device Sync Types
// =================
// Types matching the new REST API for device sync

export type TrustState = "trusted" | "untrusted" | "revoked";
export type DevicePlatform = "ios" | "android" | "macos" | "windows" | "linux" | "server";
export type PairingRole = "issuer" | "claimer";
export type PairingStatus = "open" | "claimed" | "approved" | "completed" | "cancelled" | "expired";
export type KeyState = "ACTIVE" | "PENDING";
export type EnrollmentMode = "BOOTSTRAP" | "PAIR" | "READY";

// ─────────────────────────────────────────────────────────────────────────────
// Device Types
// ─────────────────────────────────────────────────────────────────────────────

// Device information from the API
export interface Device {
  id: string;
  userId: string;
  displayName: string;
  platform: DevicePlatform;
  devicePublicKey: string | null;
  trustState: TrustState;
  trustedKeyVersion: number | null;
  osVersion: string | null;
  appVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  // Client-side flag
  isCurrent?: boolean;
}

// Device registration request
export interface RegisterDeviceRequest {
  displayName: string;
  platform: string;
  instanceId: string;
  osVersion?: string;
  appVersion?: string;
}

// Summary of a trusted device (used in PAIR mode response)
export interface TrustedDeviceSummary {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string | null;
}

// Discriminated union for device enrollment response
export type EnrollDeviceResponse =
  | { mode: "BOOTSTRAP"; deviceId: string; e2eeKeyVersion: number }
  | {
      mode: "PAIR";
      deviceId: string;
      e2eeKeyVersion: number;
      requireSas: boolean;
      pairingTtlSeconds: number;
      trustedDevices: TrustedDeviceSummary[];
    }
  | { mode: "READY"; deviceId: string; e2eeKeyVersion: number; trustState: TrustState };

// Device update request
export interface UpdateDeviceRequest {
  displayName?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Team Keys Types (E2EE)
// ─────────────────────────────────────────────────────────────────────────────

// Discriminated union for initializing team keys response
export type InitializeKeysResult =
  | { mode: "BOOTSTRAP"; challenge: string; nonce: string; keyVersion: number }
  | {
      mode: "PAIRING_REQUIRED";
      e2eeKeyVersion: number;
      requireSas: boolean;
      pairingTtlSeconds: number;
      trustedDevices: TrustedDeviceSummary[];
    }
  | { mode: "READY"; e2eeKeyVersion: number };

// Request to commit team key initialization (Phase 2)
export interface CommitInitializeKeysRequest {
  keyVersion: number;
  deviceKeyEnvelope: string;
  signature: string;
  challengeResponse?: string;
  recoveryEnvelope?: string;
}

// Response from committing team key initialization
export interface CommitInitializeKeysResponse {
  success: boolean;
  keyState: KeyState;
}

// Response from starting key rotation (Phase 1)
export interface RotateKeysResponse {
  challenge: string;
  nonce: string;
  newKeyVersion: number;
}

// Envelope for a device during key rotation
export interface DeviceKeyEnvelope {
  deviceId: string;
  deviceKeyEnvelope: string;
}

// Request to commit key rotation (Phase 2)
export interface CommitRotateKeysRequest {
  newKeyVersion: number;
  envelopes: DeviceKeyEnvelope[];
  signature: string;
  challengeResponse?: string;
}

// Response from committing key rotation
export interface CommitRotateKeysResponse {
  success: boolean;
  keyVersion: number;
}

// Response from resetting team sync
export interface ResetTeamSyncResponse {
  success: boolean;
  keyVersion: number;
  resetAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing Types
// ─────────────────────────────────────────────────────────────────────────────

// Request to create a new pairing session
export interface CreatePairingRequest {
  codeHash: string;
  ephemeralPublicKey: string;
}

// Response from creating a pairing session
export interface CreatePairingResponse {
  pairingId: string;
  expiresAt: string;
  keyVersion: number;
  requireSas: boolean;
}

// Response from getting a pairing session
export interface GetPairingResponse {
  pairingId: string;
  status: PairingStatus;
  claimerDeviceId: string | null;
  claimerEphemeralPub: string | null;
  expiresAt: string;
}

// Request to complete a pairing session
export interface CompletePairingRequest {
  encryptedKeyBundle: string;
  sasProof: string | Record<string, unknown>;
  signature: string;
}

// Generic success response
export interface SuccessResponse {
  success: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Claimer-Side Pairing Types
// ─────────────────────────────────────────────────────────────────────────────

// Request to claim a pairing session (claimer side)
export interface ClaimPairingRequest {
  code: string;
  ephemeralPublicKey: string;
}

// Response from claiming a pairing session
export interface ClaimPairingResponse {
  sessionId: string;
  issuerEphemeralPub: string;
  e2eeKeyVersion: number;
  requireSas: boolean;
  expiresAt: string;
}

// Message from the pairing mailbox
export interface PairingMessage {
  id: string;
  payloadType: string;
  payload: string;
  createdAt: string;
}

// Response from getting pairing messages
export interface PairingMessagesResponse {
  sessionStatus: PairingStatus;
  messages: PairingMessage[];
}

// Request to confirm pairing (claimer side)
export interface ConfirmPairingRequest {
  proof?: string;
}

// Response from confirming pairing
export interface ConfirmPairingResponse {
  success: boolean;
  keyVersion: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing Session State (Client-side)
// ─────────────────────────────────────────────────────────────────────────────

// Pairing session (issuer side)
export interface PairingSession {
  pairingId: string;
  code: string;
  ephemeralSecretKey: string; // base64
  ephemeralPublicKey: string; // base64
  claimerPublicKey?: string; // base64
  claimerDeviceId?: string;
  sessionKey?: string; // base64
  keyVersion: number;
  expiresAt: Date;
  status: PairingStatus;
  requireSas: boolean;
}

// Pairing claim result (claimer side - for new device joining via QR code)
export interface ClaimResult {
  pairingId: string;
  issuerPublicKey: string; // base64
  sessionKey: string; // base64
  requireSas: boolean;
  expiresAt: Date;
}

// Claimer session state (for new device being paired)
export interface ClaimerSession {
  pairingId: string;
  code: string;
  ephemeralSecretKey: string; // base64
  ephemeralPublicKey: string; // base64
  issuerPublicKey: string; // base64
  sessionKey: string; // base64
  e2eeKeyVersion: number;
  requireSas: boolean;
  expiresAt: Date;
  status: PairingStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync State
// ─────────────────────────────────────────────────────────────────────────────

// Sync state managed by the provider
export interface SyncState {
  // Status
  isInitialized: boolean;
  isLoading: boolean;
  error: SyncError | null;

  // Device
  deviceId: string | null;
  device: Device | null;

  // Enrollment
  enrollmentMode: EnrollmentMode | null;
  trustedDevicesForPairing: TrustedDeviceSummary[];

  // Team keys
  localKeyVersion: number | null;
  keysInitialized: boolean;

  // Pairing (Issuer)
  pairingSession: PairingSession | null;
  pairingRole: PairingRole | null;
  claimResult: ClaimResult | null;

  // Pairing (Claimer)
  claimerSession: ClaimerSession | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

// Known error codes
export const SyncErrorCodes = {
  DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
  LAST_TRUSTED_DEVICE: "LAST_TRUSTED_DEVICE",
  NO_DEVICE: "NO_DEVICE",
  INIT_FAILED: "INIT_FAILED",
  KEYS_INIT_FAILED: "KEYS_INIT_FAILED",
  ROOT_KEY_NOT_FOUND: "ROOT_KEY_NOT_FOUND",
  NO_SESSION: "NO_SESSION",
  NO_CLAIM: "NO_CLAIM",
  INVALID_SESSION: "INVALID_SESSION",
  PAIRING_ENDED: "PAIRING_ENDED",
  CLAIMER_NOT_FOUND: "CLAIMER_NOT_FOUND",
  KEYS_ALREADY_INITIALIZED: "KEYS_ALREADY_INITIALIZED",
  REQUIRES_PAIRING: "REQUIRES_PAIRING",
} as const;

// Custom error class for sync operations
export class SyncError extends Error {
  constructor(
    public code: string,
    message: string,
    public recoverable = true,
  ) {
    super(message);
    this.name = "SyncError";
  }

  static isDeviceNotFound(error: unknown): boolean {
    if (error instanceof SyncError) {
      return error.code === SyncErrorCodes.DEVICE_NOT_FOUND;
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("device not found") ||
        msg.includes("device_not_found") ||
        msg.includes("device was unpaired") ||
        msg.includes('"code":"not_found"') ||
        msg.includes('"code":"device_not_found"') ||
        (msg.includes("404") && msg.includes("device"))
      );
    }
    return false;
  }

  static isLastTrustedDevice(error: unknown): boolean {
    if (error instanceof SyncError) {
      return error.code === SyncErrorCodes.LAST_TRUSTED_DEVICE;
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("last_trusted_device") ||
        msg.includes("last trusted device")
      );
    }
    return false;
  }

  static isKeysAlreadyInitialized(error: unknown): boolean {
    if (error instanceof SyncError) {
      return error.code === SyncErrorCodes.KEYS_ALREADY_INITIALIZED;
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes("keys already initialized") ||
        msg.includes("409") ||
        msg.includes("conflict")
      );
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Bundle Types (for E2EE key transfer during pairing)
// ─────────────────────────────────────────────────────────────────────────────

// Key bundle payload sent during pairing completion
export interface KeyBundlePayload {
  version: number;
  rootKey: string; // base64 encrypted root key
  keyVersion: number;
}
