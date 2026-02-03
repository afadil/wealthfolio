// DeviceSyncProvider
// React context provider for device sync state and actions
// Uses state machine model: FRESH → REGISTERED → READY (+ STALE, RECOVERY)
// ===========================================================================

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect";
import { syncService, type EnableSyncResult } from "../services/sync-service";
import * as crypto from "../crypto";
import type {
  SyncState,
  PairingSession,
  ClaimerSession,
  Device,
  TrustedDeviceSummary,
  DeviceSyncState,
  SyncIdentity,
  KeyBundlePayload,
} from "../types";
import { SyncError, SyncErrorCodes, INITIAL_SYNC_STATE } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

type SyncAction =
  // State detection
  | { type: "DETECT_START" }
  | {
      type: "DETECT_SUCCESS";
      syncState: DeviceSyncState;
      identity: SyncIdentity | null;
      device: Device | null;
      serverKeyVersion: number | null;
      trustedDevices: TrustedDeviceSummary[];
    }
  | { type: "DETECT_ERROR"; error: SyncError }

  // Operations
  | { type: "OPERATION_START" }
  | { type: "OPERATION_END" }

  // Pairing - Issuer
  | { type: "PAIRING_STARTED"; session: PairingSession }
  | {
      type: "PAIRING_CLAIMED";
      claimerPublicKey: string;
      claimerDeviceId: string;
      sessionKey: string;
    }
  | { type: "PAIRING_APPROVED" }
  | { type: "PAIRING_CANCELED" }
  | { type: "PAIRING_ERROR"; error: SyncError }

  // Pairing - Claimer
  | { type: "CLAIMER_SESSION_STARTED"; session: ClaimerSession }
  | { type: "CLAIMER_KEY_RECEIVED"; keyBundle: KeyBundlePayload }

  // Common
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_PAIRING_STATE" }
  | { type: "RESET" };

function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "DETECT_START":
      return { ...state, isDetecting: true, error: null };

    case "DETECT_SUCCESS":
      return {
        ...state,
        isDetecting: false,
        syncState: action.syncState,
        identity: action.identity,
        device: action.device,
        serverKeyVersion: action.serverKeyVersion,
        trustedDevices: action.trustedDevices,
      };

    case "DETECT_ERROR":
      return { ...state, isDetecting: false, error: action.error };

    case "OPERATION_START":
      return { ...state, isLoading: true, error: null };

    case "OPERATION_END":
      return { ...state, isLoading: false };

    case "PAIRING_STARTED":
      return {
        ...state,
        pairingSession: action.session,
        pairingRole: "issuer",
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

    case "PAIRING_APPROVED":
      return {
        ...state,
        pairingSession: state.pairingSession
          ? { ...state.pairingSession, status: "approved" }
          : null,
      };

    case "PAIRING_CANCELED":
      return {
        ...state,
        pairingSession: null,
        pairingRole: null,
        claimerSession: null,
      };

    case "PAIRING_ERROR":
      return { ...state, error: action.error };

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

    case "CLEAR_PAIRING_STATE":
      return {
        ...state,
        pairingSession: null,
        pairingRole: null,
        claimerSession: null,
      };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "RESET":
      return { ...INITIAL_SYNC_STATE, isDetecting: false };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface SyncContextValue {
  state: SyncState;
  actions: {
    // State management
    refreshState: () => Promise<void>;

    // Enable sync (FRESH state)
    enableSync: () => Promise<EnableSyncResult>;

    // E2EE key initialization (BOOTSTRAP mode)
    initializeKeys: () => Promise<{ keyVersion: number }>;

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

    // Recovery
    handleRecovery: () => Promise<void>;

    // Device management
    renameDevice: (deviceId: string, name: string) => Promise<void>;
    revokeDevice: (deviceId: string) => Promise<void>;

    // Sync reset
    resetSync: () => Promise<void>;
    reinitializeSync: () => Promise<void>;

    // Utils
    computeSAS: () => Promise<string | null>;
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
  const [state, dispatch] = useReducer(syncReducer, INITIAL_SYNC_STATE);

  // Check if user has a subscription (team)
  const hasSubscription = !!userInfo?.team?.plan;

  // Detect state on mount (when connected AND has subscription)
  useEffect(() => {
    if (!isEnabled || !isConnected || !hasSubscription) {
      dispatch({ type: "RESET" });
      return;
    }

    let cancelled = false;

    async function detectState() {
      dispatch({ type: "DETECT_START" });
      try {
        const result = await syncService.detectState();
        if (cancelled) return;

        dispatch({
          type: "DETECT_SUCCESS",
          syncState: result.state,
          identity: result.identity,
          device: result.device,
          serverKeyVersion: result.serverKeyVersion,
          trustedDevices: result.trustedDevices,
        });
      } catch (err) {
        if (cancelled) return;

        // Check if this is an auth error (no access token)
        if (SyncError.isNoAccessToken(err)) {
          // Not signed in - reset to initial state
          dispatch({ type: "RESET" });
          return;
        }

        dispatch({
          type: "DETECT_ERROR",
          error: SyncError.from(err),
        });
      }
    }

    void detectState();

    return () => {
      cancelled = true;
    };
  }, [isConnected, isEnabled, hasSubscription]);

  // Actions
  const refreshState = useCallback(async () => {
    dispatch({ type: "DETECT_START" });
    try {
      const result = await syncService.detectState();
      dispatch({
        type: "DETECT_SUCCESS",
        syncState: result.state,
        identity: result.identity,
        device: result.device,
        serverKeyVersion: result.serverKeyVersion,
        trustedDevices: result.trustedDevices,
      });
    } catch (err) {
      dispatch({
        type: "DETECT_ERROR",
        error: SyncError.from(err),
      });
    }
  }, []);

  const enableSync = useCallback(async (): Promise<EnableSyncResult> => {
    dispatch({ type: "OPERATION_START" });
    try {
      const result = await syncService.enableSync();
      // Refresh state from backend to get authoritative state
      await refreshState();
      return result;
    } catch (err) {
      dispatch({ type: "OPERATION_END" });
      throw SyncError.from(err);
    }
  }, [refreshState]);

  const initializeKeys = useCallback(async (): Promise<{ keyVersion: number }> => {
    dispatch({ type: "OPERATION_START" });
    try {
      // This is now handled by enableSync() in the backend.
      const result = await syncService.initializeKeys();
      await refreshState();
      return result;
    } catch (err) {
      dispatch({ type: "OPERATION_END" });
      throw SyncError.from(err);
    }
  }, [refreshState]);

  const startPairing = useCallback(async () => {
    const session = await syncService.createPairingSession();
    dispatch({ type: "PAIRING_STARTED", session });
    return session;
  }, []);

  // Use refs to avoid stale closure in polling - always access latest session
  const pairingSessionRef = useRef(state.pairingSession);
  useEffect(() => {
    pairingSessionRef.current = state.pairingSession;
  }, [state.pairingSession]);

  const claimerSessionRef = useRef(state.claimerSession);
  useEffect(() => {
    claimerSessionRef.current = state.claimerSession;
  }, [state.claimerSession]);

  const pollForClaimerConnection = useCallback(async () => {
    const session = pairingSessionRef.current;
    if (!session) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active pairing session");
    }
    const result = await syncService.pollForClaimerConnection(session);
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
  }, []); // No dependencies - uses ref for latest session

  const approvePairing = useCallback(async () => {
    if (!state.pairingSession) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active pairing session");
    }
    await syncService.approvePairing(state.pairingSession.pairingId);
    dispatch({ type: "PAIRING_APPROVED" });
  }, [state.pairingSession]);

  const completePairing = useCallback(async () => {
    if (!state.pairingSession) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active pairing session");
    }
    await syncService.completePairing(state.pairingSession);
    dispatch({ type: "CLEAR_PAIRING_STATE" });
    // NOTE: Don't call refreshState() here - it sets isDetecting=true which
    // causes DeviceSyncSection to render loading skeleton, unmounting the
    // pairing dialog and causing it to restart. Refresh happens when dialog closes.
  }, [state.pairingSession]);

  const cancelPairing = useCallback(async () => {
    if (state.pairingSession) {
      await syncService.cancelPairing(state.pairingSession.pairingId).catch(() => {
        // Ignore cancel errors
      });
    }
    dispatch({ type: "PAIRING_CANCELED" });
  }, [state.pairingSession]);

  const claimPairing = useCallback(async (code: string): Promise<ClaimerSession> => {
    const session = await syncService.claimPairingSession(code);
    dispatch({ type: "CLAIMER_SESSION_STARTED", session });
    return session;
  }, []);

  const pollForKeyBundle = useCallback(async () => {
    const session = claimerSessionRef.current;
    if (!session) {
      throw new SyncError(SyncErrorCodes.NO_SESSION, "No active claimer session");
    }
    const result = await syncService.pollForKeyBundle(session);
    if (result.received && result.keyBundle) {
      dispatch({ type: "CLAIMER_KEY_RECEIVED", keyBundle: result.keyBundle });
    }
    return { received: result.received, keyBundle: result.keyBundle };
  }, []); // No dependencies - uses ref for latest session

  const confirmPairingAsClaimer = useCallback(
    async (keyBundle: KeyBundlePayload) => {
      const session = claimerSessionRef.current;
      if (!session) {
        throw new SyncError(SyncErrorCodes.NO_SESSION, "No active claimer session");
      }
      await syncService.confirmPairingAsClaimer(session, keyBundle);
      dispatch({ type: "CLEAR_PAIRING_STATE" });
      // NOTE: Don't call refreshState() here - same issue as completePairing
    },
    [], // No dependencies - uses ref for latest session
  );

  const handleRecovery = useCallback(async () => {
    dispatch({ type: "OPERATION_START" });
    try {
      await syncService.handleRecovery();
      await refreshState();
    } catch (err) {
      dispatch({ type: "OPERATION_END" });
      throw SyncError.from(err);
    }
  }, [refreshState]);

  const renameDevice = useCallback(async (deviceId: string, name: string) => {
    await syncService.renameDevice(deviceId, name);
  }, []);

  const revokeDevice = useCallback(async (deviceId: string) => {
    await syncService.revokeDevice(deviceId);
  }, []);

  const resetSync = useCallback(async () => {
    dispatch({ type: "OPERATION_START" });
    try {
      await syncService.resetSync();
      await syncService.clearSyncData();
      dispatch({ type: "RESET" });
    } catch (err) {
      dispatch({ type: "OPERATION_END" });
      throw SyncError.from(err);
    }
  }, []);

  const reinitializeSync = useCallback(async () => {
    dispatch({ type: "OPERATION_START" });
    try {
      await syncService.reinitializeSync();
      await refreshState();
    } catch (err) {
      dispatch({ type: "OPERATION_END" });
      throw SyncError.from(err);
    }
  }, [refreshState]);

  const computeSAS = useCallback(async () => {
    const sessionKey = state.pairingSession?.sessionKey || state.claimerSession?.sessionKey;
    if (!sessionKey) return null;
    return crypto.computeSAS(sessionKey);
  }, [state.pairingSession?.sessionKey, state.claimerSession?.sessionKey]);

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
      refreshState,
      enableSync,
      initializeKeys,
      startPairing,
      pollForClaimerConnection,
      approvePairing,
      completePairing,
      claimPairing,
      pollForKeyBundle,
      confirmPairingAsClaimer,
      cancelPairing,
      handleRecovery,
      renameDevice,
      revokeDevice,
      resetSync,
      reinitializeSync,
      computeSAS,
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
