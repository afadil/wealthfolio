// Device Sync Types
// =================

export type TrustState = "trusted" | "untrusted";
export type Platform = "ios" | "android" | "mac" | "windows" | "linux" | "server";
export type PairingRole = "issuer" | "claimer";
export type PairingStatus = "open" | "approved" | "completed" | "canceled" | "expired";

// Sync status returned from the server
export interface SyncStatus {
  e2eeEnabled: boolean;
  e2eeKeyVersion: number;
  requireSas: boolean;
  pairingTtlSeconds: number;
  resetAt: string | null;
}

// Device information
export interface Device {
  id: string;
  userId: string;
  name: string;
  platform: Platform;
  appVersion: string | null;
  osVersion: string | null;
  trustState: TrustState;
  trustedKeyVersion: number | null;
  lastSeenAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

// Device registration request
export interface DeviceRegistration {
  name: string;
  platform: string;
  appVersion: string;
  osVersion?: string;
}

// Device registration response
export interface DeviceRegistrationResponse {
  deviceId: string;
  trustState: TrustState;
  trustedKeyVersion: number | null;
}

// Pairing session (issuer side)
export interface PairingSession {
  sessionId: string;
  code: string;
  ephemeralSecretKey: string; // base64
  ephemeralPublicKey: string; // base64
  claimerPublicKey?: string; // base64
  sessionKey?: string; // base64
  expiresAt: Date;
  status: PairingStatus;
}

// Pairing claim result (claimer side)
export interface ClaimResult {
  sessionId: string;
  issuerPublicKey: string; // base64
  sessionKey: string; // base64
  requireSas: boolean;
  expiresAt: Date;
}

// Sync state managed by the provider
export interface SyncState {
  // Status
  isInitialized: boolean;
  isLoading: boolean;
  error: SyncError | null;

  // Device
  deviceId: string | null;
  trustState: TrustState | null;
  localKeyVersion: number | null;

  // Team sync
  syncStatus: SyncStatus | null;

  // Pairing
  pairingSession: PairingSession | null;
  pairingRole: PairingRole | null;
  claimResult: ClaimResult | null;
}

// Known error codes
export const SyncErrorCodes = {
  DEVICE_NOT_FOUND: "DEVICE_NOT_FOUND",
  NO_DEVICE: "NO_DEVICE",
  INIT_FAILED: "INIT_FAILED",
  E2EE_ENABLE_FAILED: "E2EE_ENABLE_FAILED",
  ROOT_KEY_NOT_FOUND: "ROOT_KEY_NOT_FOUND",
  NO_SESSION: "NO_SESSION",
  NO_CLAIM: "NO_CLAIM",
  INVALID_SESSION: "INVALID_SESSION",
  PAIRING_ENDED: "PAIRING_ENDED",
  CLAIMER_NOT_FOUND: "CLAIMER_NOT_FOUND",
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
        (msg.includes("404") && msg.includes("device"))
      );
    }
    return false;
  }
}

// API request/response types for pairing
export interface CreatePairingRequest {
  codeHash: string;
  ephemeralPublicKey: string; // base64
}

export interface CreatePairingResponse {
  sessionId: string;
  expiresAt: string;
}

export interface ClaimPairingRequest {
  code: string;
  ephemeralPublicKey: string; // base64
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
  sessionStatus: PairingStatus;
  messages: PairingMessage[];
}

// Root key transfer payload (encrypted with session key)
export interface RootKeyPayload {
  version: number;
  ciphertext: string; // base64 (includes nonce)
  keyVersion: number;
}

// E2EE enable response
export interface EnableE2EEResponse {
  e2eeEnabled: boolean;
  e2eeKeyVersion: number;
}
