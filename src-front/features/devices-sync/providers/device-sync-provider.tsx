// DeviceSyncProvider
// React context provider for device sync state and actions
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
import { logger } from "@/adapters/tauri";
import { syncService } from "../services/sync-service";
import * as crypto from "../crypto";
import type {
  SyncState,
  SyncStatus,
  PairingSession,
  ClaimResult,
  PairingRole,
  TrustState,
  TrustedDeviceInfo,
} from "../types";
import { SyncError, SyncErrorCodes } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

type SyncAction =
  | { type: "INIT_START" }
  | { type: "INIT_SUCCESS"; deviceId: string }
  | { type: "INIT_ERROR"; error: SyncError }
  | { type: "SET_SYNC_STATUS"; status: SyncStatus }
  | { type: "SET_TRUST_STATE"; trustState: TrustState; keyVersion: number | null }
  | { type: "PAIRING_STARTED"; session: PairingSession; role: PairingRole }
  | { type: "PAIRING_CLAIMED"; claimerPublicKey: string; claimerDeviceId: string; sessionKey: string }
  | { type: "PAIRING_CLAIM_RESULT"; result: ClaimResult }
  | { type: "PAIRING_APPROVED" }
  | { type: "PAIRING_COMPLETED" }
  | { type: "PAIRING_CANCELED" }
  | { type: "PAIRING_ERROR"; error: SyncError }
  | { type: "CLEAR_ERROR" }
  | { type: "RESET" };

const initialState: SyncState = {
  isInitialized: false,
  isLoading: true,
  error: null,
  deviceId: null,
  trustState: null,
  localKeyVersion: null,
  syncStatus: null,
  pairingSession: null,
  pairingRole: null,
  claimResult: null,
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
      };

    case "INIT_ERROR":
      return { ...state, isLoading: false, error: action.error };

    case "SET_SYNC_STATUS":
      return { ...state, syncStatus: action.status };

    case "SET_TRUST_STATE":
      return {
        ...state,
        trustState: action.trustState,
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
              status: "approved",
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
        trustState: "trusted",
        pairingSession: null,
        pairingRole: null,
        claimResult: null,
      };

    case "PAIRING_CANCELED":
      return {
        ...state,
        pairingSession: null,
        pairingRole: null,
        claimResult: null,
      };

    case "PAIRING_ERROR":
      return { ...state, error: action.error };

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

// Result type for enableE2EE action
type EnableE2EEResult =
  | { status: "initialized" }
  | { status: "requires_pairing"; trustedDevices: TrustedDeviceInfo[] };

interface SyncContextValue {
  state: SyncState;
  actions: {
    // E2EE setup
    enableE2EE: () => Promise<EnableE2EEResult>;

    // Pairing - Issuer
    startPairing: () => Promise<PairingSession>;
    pollForClaimerConnection: () => Promise<boolean>;
    approvePairing: () => Promise<void>;
    sendRootKey: () => Promise<void>;

    // Pairing - Claimer
    claimPairing: (code: string) => Promise<ClaimResult>;
    pollForRootKey: () => Promise<boolean>;

    // Pairing - Common
    cancelPairing: () => Promise<void>;

    // Device management
    renameDevice: (deviceId: string, name: string) => Promise<void>;
    revokeDevice: (deviceId: string) => Promise<void>;

    // Sync reset
    resetSync: () => Promise<void>;

    // Utils
    computeSAS: () => Promise<string | null>;
    refreshStatus: () => Promise<void>;
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
        const deviceId = await syncService.initialize();
        if (cancelled) return;
        dispatch({ type: "INIT_SUCCESS", deviceId });

        // Load sync status
        try {
          const status = await syncService.getSyncStatus();
          if (cancelled) return;
          dispatch({ type: "SET_SYNC_STATUS", status });

          // Check trust status based on local root key
          const { needsPairing } = await syncService.checkTrustStatus();
          if (cancelled) return;

          try {
            // Verify device still exists on server (handles DEVICE_NOT_FOUND)
            const device = await syncService.verifyDeviceExists();
            if (cancelled) return;

            // Trust is determined by having the root key with correct version
            // If needsPairing is false, device is trusted (has the key)
            dispatch({
              type: "SET_TRUST_STATE",
              trustState: needsPairing ? "untrusted" : "trusted",
              keyVersion: device.trustedKeyVersion,
            });
          } catch (err) {
            // Handle DEVICE_NOT_FOUND - device was unpaired
            if (SyncError.isDeviceNotFound(err)) {
              dispatch({ type: "RESET" });
              // Re-run init to register a new device
              if (!cancelled) void init();
              return;
            }
            // Device may not be registered yet
            dispatch({
              type: "SET_TRUST_STATE",
              trustState: "untrusted",
              keyVersion: null,
            });
          }
        } catch {
          // API not available or user not subscribed - that's ok
        }
      } catch (err) {
        if (cancelled) return;
        // Handle DEVICE_NOT_FOUND at top level too
        if (SyncError.isDeviceNotFound(err)) {
          dispatch({ type: "RESET" });
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
  const enableE2EE = useCallback(async (): Promise<
    | { status: "initialized" }
    | { status: "requires_pairing"; trustedDevices: TrustedDeviceInfo[] }
  > => {
    const result = await syncService.enableE2EE();
    const status = await syncService.getSyncStatus();
    dispatch({ type: "SET_SYNC_STATUS", status });

    if (result.status === "initialized") {
      // Bootstrap device - already trusted
      dispatch({ type: "SET_TRUST_STATE", trustState: "trusted", keyVersion: result.keyVersion });
      return { status: "initialized" };
    } else {
      // Secondary device - needs pairing
      dispatch({ type: "SET_TRUST_STATE", trustState: "untrusted", keyVersion: null });
      return { status: "requires_pairing", trustedDevices: result.trustedDevices };
    }
  }, []);

  const startPairing = useCallback(async () => {
    const session = await syncService.createPairingSession();
    dispatch({ type: "PAIRING_STARTED", session, role: "issuer" });
    return session;
  }, []);

  const pollForClaimerConnection = useCallback(async () => {
    if (!state.pairingSession) {
      throw new SyncError("NO_SESSION", "No active pairing session");
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
      throw new SyncError("NO_SESSION", "No active pairing session");
    }
    await syncService.approvePairing(state.pairingSession.sessionId);
    dispatch({ type: "PAIRING_APPROVED" });
  }, [state.pairingSession]);

  const sendRootKey = useCallback(async () => {
    logger.debug(
      `[DeviceSyncProvider] sendRootKey called, session: ${JSON.stringify({
        hasSession: !!state.pairingSession,
        sessionId: state.pairingSession?.sessionId,
        hasClaimerPublicKey: !!state.pairingSession?.claimerPublicKey,
        hasSessionKey: !!state.pairingSession?.sessionKey,
        claimerDeviceId: state.pairingSession?.claimerDeviceId,
      })}`,
    );
    if (!state.pairingSession) {
      throw new SyncError("NO_SESSION", "No active pairing session");
    }
    await syncService.sendRootKey(state.pairingSession);
    logger.debug("[DeviceSyncProvider] sendRootKey completed successfully");
    dispatch({ type: "PAIRING_COMPLETED" });
  }, [state.pairingSession]);

  const claimPairing = useCallback(async (code: string) => {
    const result = await syncService.claimPairingSession(code);
    dispatch({ type: "PAIRING_CLAIM_RESULT", result });
    dispatch({
      type: "PAIRING_STARTED",
      session: {
        sessionId: result.sessionId,
        code: "",
        ephemeralSecretKey: "",
        ephemeralPublicKey: "",
        expiresAt: result.expiresAt,
        status: "open",
      },
      role: "claimer",
    });
    return result;
  }, []);

  const pollForRootKey = useCallback(async () => {
    if (!state.claimResult) {
      throw new SyncError("NO_CLAIM", "No active claim");
    }
    const received = await syncService.pollForRootKey(state.claimResult);
    if (received) {
      dispatch({ type: "PAIRING_COMPLETED" });
    }
    return received;
  }, [state.claimResult]);

  const cancelPairing = useCallback(async () => {
    if (state.pairingSession) {
      await syncService.cancelPairing(state.pairingSession.sessionId).catch(() => {
        // Ignore cancel errors
      });
    }
    dispatch({ type: "PAIRING_CANCELED" });
  }, [state.pairingSession]);

  const renameDevice = useCallback(async (deviceId: string, name: string) => {
    await syncService.renameDevice(deviceId, name);
  }, []);

  const revokeDevice = useCallback(async (deviceId: string) => {
    await syncService.revokeDevice(deviceId);
  }, []);

  const resetSync = useCallback(async () => {
    const { keyVersion } = await syncService.resetSync();
    const status = await syncService.getSyncStatus();
    dispatch({ type: "SET_SYNC_STATUS", status });
    dispatch({ type: "SET_TRUST_STATE", trustState: "trusted", keyVersion });
  }, []);

  const computeSAS = useCallback(async () => {
    const sessionKey = state.pairingSession?.sessionKey || state.claimResult?.sessionKey;
    if (!sessionKey) return null;
    return crypto.computeSAS(sessionKey);
  }, [state.pairingSession?.sessionKey, state.claimResult?.sessionKey]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await syncService.getSyncStatus();
      dispatch({ type: "SET_SYNC_STATUS", status });
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
      enableE2EE,
      startPairing,
      pollForClaimerConnection,
      approvePairing,
      sendRootKey,
      claimPairing,
      pollForRootKey,
      cancelPairing,
      renameDevice,
      revokeDevice,
      resetSync,
      computeSAS,
      refreshStatus,
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
