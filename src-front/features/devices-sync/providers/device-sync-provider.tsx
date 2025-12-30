// DeviceSyncProvider
// React context provider for device sync state and actions
// Uses the new REST API via sync-service
// =========================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect";
import { logger } from "@/adapters";
import { syncService } from "../services/sync-service";
import * as crypto from "../crypto";
import type {
  SyncState,
  PairingSession,
  ClaimerSession,
  ClaimResult,
  PairingRole,
  Device,
  TrustedDeviceSummary,
  EnrollmentMode,
  KeyBundlePayload,
} from "../types";
import { SyncError, SyncErrorCodes } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

type SyncAction =
  | { type: "INIT_START" }
  | {
      type: "INIT_SUCCESS";
      deviceId: string;
      device: Device | null;
      enrollmentMode: EnrollmentMode;
      trustedDevices?: TrustedDeviceSummary[];
    }
  | { type: "INIT_ERROR"; error: SyncError }
  | { type: "SET_KEY_STATUS"; keysInitialized: boolean; keyVersion: number | null }
  | { type: "PAIRING_STARTED"; session: PairingSession; role: PairingRole }
  | { type: "PAIRING_CLAIMED"; claimerPublicKey: string; claimerDeviceId: string; sessionKey: string }
  | { type: "PAIRING_CLAIM_RESULT"; result: ClaimResult }
  | { type: "PAIRING_APPROVED" }
  | { type: "PAIRING_COMPLETED" }
  | { type: "PAIRING_CANCELED" }
  | { type: "PAIRING_ERROR"; error: SyncError }
  // Claimer-side actions
  | { type: "CLAIMER_SESSION_STARTED"; session: ClaimerSession }
  | { type: "CLAIMER_KEY_RECEIVED"; keyBundle: KeyBundlePayload }
  | { type: "CLAIMER_CONFIRMED"; keyVersion: number }
  | { type: "CLEAR_ERROR" }
  | { type: "RESET" };

const initialState: SyncState = {
  isInitialized: false,
  isLoading: true,
  error: null,
  deviceId: null,
  device: null,
  enrollmentMode: null,
  trustedDevicesForPairing: [],
  localKeyVersion: null,
  keysInitialized: false,
  pairingSession: null,
  pairingRole: null,
  claimResult: null,
  claimerSession: null,
};

function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "INIT_START":
      return { ...state, isLoading: true, error: null };

    case "INIT_SUCCESS":
      return {
        ...state,
        isInitialized: true,
        isLoading: false,
        deviceId: action.deviceId,
        device: action.device,
        enrollmentMode: action.enrollmentMode,
        trustedDevicesForPairing: action.trustedDevices ?? [],
      };

    case "INIT_ERROR":
      return { ...state, isLoading: false, error: action.error };

    case "SET_KEY_STATUS":
      return {
        ...state,
        keysInitialized: action.keysInitialized,
        localKeyVersion: action.keyVersion,
      };

    case "PAIRING_STARTED":
      return {
        ...state,
        pairingSession: action.session,
        pairingRole: action.role,
        error: null,
      };

    case "PAIRING_CLAIMED":
      return {
        ...state,
        pairingSession: state.pairingSession
          ? {
              ...state.pairingSession,
              claimerPublicKey: action.claimerPublicKey,
              claimerDeviceId: action.claimerDeviceId,
              sessionKey: action.sessionKey,
              status: "claimed",
            }
          : null,
      };

    case "PAIRING_CLAIM_RESULT":
      return { ...state, claimResult: action.result };

    case "PAIRING_APPROVED":
      return {
        ...state,
        pairingSession: state.pairingSession
          ? { ...state.pairingSession, status: "approved" }
          : null,
      };

    case "PAIRING_COMPLETED":
      return {
        ...state,
        keysInitialized: true,
        enrollmentMode: "READY",
        pairingSession: null,
        pairingRole: null,
        claimResult: null,
        claimerSession: null,
      };

    case "PAIRING_CANCELED":
      return {
        ...state,
        pairingSession: null,
        pairingRole: null,
        claimResult: null,
        claimerSession: null,
      };

    case "PAIRING_ERROR":
      return { ...state, error: action.error };

    // Claimer-side actions
    case "CLAIMER_SESSION_STARTED":
      return {
        ...state,
        claimerSession: action.session,
        pairingRole: "claimer",
        error: null,
      };

    case "CLAIMER_KEY_RECEIVED":
      return {
        ...state,
        claimerSession: state.claimerSession
          ? { ...state.claimerSession, status: "approved" }
          : null,
      };

    case "CLAIMER_CONFIRMED":
      return {
        ...state,
        keysInitialized: true,
        enrollmentMode: "READY",
        localKeyVersion: action.keyVersion,
        claimerSession: null,
        pairingRole: null,
      };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "RESET":
      return { ...initialState, isLoading: false };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

// Result type for initializeKeys action
type InitKeysResult =
  | { status: "initialized"; keyVersion: number }
  | { status: "requires_pairing"; keyVersion: number | null; trustedDevices: TrustedDeviceSummary[] };

interface SyncContextValue {
  state: SyncState;
  actions: {
    // E2EE key initialization
    initializeKeys: () => Promise<InitKeysResult>;

    // Pairing - Issuer (trusted device)
    startPairing: () => Promise<PairingSession>;
    pollForClaimerConnection: () => Promise<boolean>;
    approvePairing: () => Promise<void>;
    completePairing: () => Promise<void>;

    // Pairing - Claimer (new device)
    claimPairing: (code: string) => Promise<ClaimerSession>;
    pollForKeyBundle: () => Promise<{ received: boolean; keyBundle?: KeyBundlePayload }>;
    confirmPairingAsClaimer: (keyBundle: KeyBundlePayload) => Promise<void>;

    // Pairing - Common
    cancelPairing: () => Promise<void>;

    // Device management
    renameDevice: (deviceId: string, name: string) => Promise<void>;
    revokeDevice: (deviceId: string) => Promise<void>;

    // Sync reset
    resetSync: () => Promise<void>;

    // Utils
    computeSAS: () => Promise<string | null>;
    refreshDevice: () => Promise<void>;
    clearError: () => void;
    clearSyncData: () => Promise<void>;
  };
}

const DeviceSyncContext = createContext<SyncContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider Component
// ─────────────────────────────────────────────────────────────────────────────

export function DeviceSyncProvider({ children }: { children: ReactNode }) {
  const { isConnected, isEnabled, userInfo } = useWealthfolioConnect();
  const [state, dispatch] = useReducer(syncReducer, initialState);

  // Check if user has a subscription (team)
  const hasSubscription = !!userInfo?.team?.plan;

  // Initialize on mount (when connected AND has subscription)
  useEffect(() => {
    if (!isEnabled || !isConnected || !hasSubscription) {
      dispatch({ type: "RESET" });
      return;
    }

    let cancelled = false;

    async function init() {
      dispatch({ type: "INIT_START" });
      try {
        const enrollmentResult = await syncService.initialize();
        if (cancelled) return;

        // Get current device info
        let device: Device | null = null;
        try {
          device = await syncService.getCurrentDevice();
        } catch {
          // Device may not exist yet
        }

        dispatch({
          type: "INIT_SUCCESS",
          deviceId: enrollmentResult.deviceId,
          device,
          enrollmentMode: enrollmentResult.mode,
          trustedDevices: enrollmentResult.trustedDevices,
        });

        // Check key status
        try {
          const keyStatus = await syncService.checkKeyStatus();
          if (cancelled) return;

          dispatch({
            type: "SET_KEY_STATUS",
            keysInitialized: !keyStatus.needsInitialization && !keyStatus.needsPairing,
            keyVersion: keyStatus.keyVersion,
          });
        } catch (err) {
          logger.warn(`[DeviceSyncProvider] Failed to check key status: ${err}`);
        }
      } catch (err) {
        if (cancelled) return;

        // Handle DEVICE_NOT_FOUND - device was unpaired
        if (SyncError.isDeviceNotFound(err)) {
          dispatch({ type: "RESET" });
          // Re-run init to register a new device
          if (!cancelled) void init();
          return;
        }

        dispatch({
          type: "INIT_ERROR",
          error: err instanceof SyncError ? err : new SyncError(SyncErrorCodes.INIT_FAILED, String(err)),
        });
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [isConnected, isEnabled, hasSubscription]);

  // Actions
  const initializeKeys = useCallback(async (): Promise<InitKeysResult> => {
    // Use the new attemptInitializeTeamKeys which returns discriminated union
    const result = await syncService.attemptInitializeTeamKeys();

    if (result.mode === "BOOTSTRAP") {
      // This is the first device - initialize keys
      const initResult = await syncService.initializeTeamKeys();

      // Refresh device to get updated trust state from server
      try {
        const device = await syncService.getCurrentDevice();
        dispatch({
          type: "INIT_SUCCESS",
          deviceId: device.id,
          device,
          enrollmentMode: "READY",
        });
      } catch {
        // If refresh fails, still update key status
        logger.warn("[DeviceSyncProvider] Failed to refresh device after key init");
      }

      dispatch({
        type: "SET_KEY_STATUS",
        keysInitialized: true,
        keyVersion: initResult.keyVersion,
      });
      return { status: "initialized", keyVersion: initResult.keyVersion };
    } else if (result.mode === "PAIRING_REQUIRED") {
      // Keys exist but this device doesn't have them
      dispatch({
        type: "SET_KEY_STATUS",
        keysInitialized: false,
        keyVersion: result.keyVersion ?? null,
      });
      return {
        status: "requires_pairing",
        keyVersion: result.keyVersion ?? null,
        trustedDevices: result.trustedDevices ?? [],
      };
    } else {
      // READY - Device already has keys
      dispatch({
        type: "SET_KEY_STATUS",
        keysInitialized: true,
        keyVersion: result.keyVersion ?? null,
      });
      return { status: "initialized", keyVersion: result.keyVersion! };
    }
  }, []);

  const startPairing = useCallback(async () => {
    const session = await syncService.createPairingSession();
    dispatch({ type: "PAIRING_STARTED", session, role: "issuer" });
    return session;
  }, []);

  const pollForClaimerConnection = useCallback(async () => {
    if (!state.pairingSession) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active pairing session");
    }
    const result = await syncService.pollForClaimerConnection(state.pairingSession);
    if (result.claimed && result.claimerPublicKey && result.claimerDeviceId && result.sessionKey) {
      dispatch({
        type: "PAIRING_CLAIMED",
        claimerPublicKey: result.claimerPublicKey,
        claimerDeviceId: result.claimerDeviceId,
        sessionKey: result.sessionKey,
      });
      return true;
    }
    return false;
  }, [state.pairingSession]);

  const approvePairing = useCallback(async () => {
    if (!state.pairingSession) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active pairing session");
    }
    await syncService.approvePairing(state.pairingSession.pairingId);
    dispatch({ type: "PAIRING_APPROVED" });
  }, [state.pairingSession]);

  const completePairing = useCallback(async () => {
    logger.debug(
      `[DeviceSyncProvider] completePairing called, ready: ${!!(state.pairingSession?.claimerPublicKey && state.pairingSession?.sessionKey)}`,
    );
    if (!state.pairingSession) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active pairing session");
    }
    await syncService.completePairing(state.pairingSession);
    logger.debug("[DeviceSyncProvider] completePairing completed successfully");
    dispatch({ type: "PAIRING_COMPLETED" });
  }, [state.pairingSession]);

  const cancelPairing = useCallback(async () => {
    if (state.pairingSession) {
      await syncService.cancelPairing(state.pairingSession.pairingId).catch(() => {
        // Ignore cancel errors
      });
    }
    dispatch({ type: "PAIRING_CANCELED" });
  }, [state.pairingSession]);

  // Claimer-side pairing actions
  const claimPairing = useCallback(async (code: string): Promise<ClaimerSession> => {
    const session = await syncService.claimPairingSession(code);
    dispatch({ type: "CLAIMER_SESSION_STARTED", session });
    return session;
  }, []);

  const pollForKeyBundle = useCallback(async () => {
    if (!state.claimerSession) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active claimer session");
    }
    const result = await syncService.pollForKeyBundle(state.claimerSession);
    if (result.received && result.keyBundle) {
      dispatch({ type: "CLAIMER_KEY_RECEIVED", keyBundle: result.keyBundle });
    }
    return { received: result.received, keyBundle: result.keyBundle };
  }, [state.claimerSession]);

  const confirmPairingAsClaimer = useCallback(
    async (keyBundle: KeyBundlePayload) => {
      if (!state.claimerSession) {
        throw new SyncError(SyncErrorCodes.NO_SESSION, "No active claimer session");
      }
      const result = await syncService.confirmPairingAsClaimer(state.claimerSession, keyBundle);
      dispatch({ type: "CLAIMER_CONFIRMED", keyVersion: result.keyVersion });
    },
    [state.claimerSession],
  );

  const renameDevice = useCallback(async (deviceId: string, name: string) => {
    await syncService.renameDevice(deviceId, name);
  }, []);

  const revokeDevice = useCallback(async (deviceId: string) => {
    await syncService.revokeDevice(deviceId);
  }, []);

  const resetSync = useCallback(async () => {
    // Reset keys on the server
    await syncService.resetSync();
    // Clear all local sync data (including device ID) so next init registers fresh
    await syncService.clearSyncData();
    dispatch({ type: "RESET" });
  }, []);

  const computeSAS = useCallback(async () => {
    const sessionKey =
      state.pairingSession?.sessionKey ||
      state.claimResult?.sessionKey ||
      state.claimerSession?.sessionKey;
    if (!sessionKey) return null;
    return crypto.computeSAS(sessionKey);
  }, [state.pairingSession?.sessionKey, state.claimResult?.sessionKey, state.claimerSession?.sessionKey]);

  const refreshDevice = useCallback(async () => {
    try {
      const device = await syncService.getCurrentDevice();
      dispatch({
        type: "INIT_SUCCESS",
        deviceId: device.id,
        device,
        enrollmentMode: device.trustState === "trusted" ? "READY" : "PAIR",
      });
    } catch {
      // Ignore refresh errors
    }
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  const clearSyncData = useCallback(async () => {
    await syncService.clearSyncData();
    dispatch({ type: "RESET" });
  }, []);

  const value: SyncContextValue = {
    state,
    actions: {
      initializeKeys,
      startPairing,
      pollForClaimerConnection,
      approvePairing,
      completePairing,
      claimPairing,
      pollForKeyBundle,
      confirmPairingAsClaimer,
      cancelPairing,
      renameDevice,
      revokeDevice,
      resetSync,
      computeSAS,
      refreshDevice,
      clearError,
      clearSyncData,
    },
  };

  return <DeviceSyncContext.Provider value={value}>{children}</DeviceSyncContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useDeviceSync() {
  const context = useContext(DeviceSyncContext);
  if (!context) {
    throw new Error("useDeviceSync must be used within DeviceSyncProvider");
  }
  return context;
}
