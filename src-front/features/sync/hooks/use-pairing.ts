// Pairing flow hook
// State machine for managing the pairing process
// ===============================================

import { useState, useCallback, useRef, useEffect } from "react";
import { useSync } from "../providers/sync-provider";

export type PairingStep =
  | "idle"
  | "select_mode"
  | "display_code"
  | "enter_code"
  | "waiting_claim"
  | "verify_sas"
  | "waiting_approval"
  | "transferring"
  | "success"
  | "error"
  | "expired";

/**
 * Hook for managing the pairing flow
 * Handles both issuer (trusted device) and claimer (new device) roles
 */
export function usePairing() {
  const { state, actions } = useSync();
  const [step, setStep] = useState<PairingStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sas, setSas] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Compute SAS when session key is available
  const sessionKey = state.pairingSession?.sessionKey || state.claimResult?.sessionKey;
  useEffect(() => {
    if (!sessionKey) {
      setSas(null);
      return;
    }
    actions.computeSAS().then(setSas).catch(() => setSas(null));
  }, [sessionKey, actions]);

  // Start as issuer (trusted device)
  const startAsIssuer = useCallback(async () => {
    try {
      setError(null);
      setStep("display_code");
      await actions.startPairing();
      setStep("waiting_claim");
      // Note: In production, you'd poll for claim or use websockets
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [actions]);

  // Start as claimer (new device)
  const startAsClaimer = useCallback(() => {
    setError(null);
    setStep("enter_code");
  }, []);

  // Submit pairing code (claimer)
  const submitCode = useCallback(
    async (code: string) => {
      try {
        setError(null);
        const result = await actions.claimPairing(code);

        if (result.requireSas) {
          setStep("verify_sas");
        } else {
          setStep("waiting_approval");
          startPollingForRootKey();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    },
    [actions],
  );

  // Confirm SAS (issuer approves)
  const confirmSAS = useCallback(async () => {
    try {
      setError(null);
      await actions.approvePairing();
      setStep("transferring");
      await actions.sendRootKey();
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [actions]);

  // Reject SAS
  const rejectSAS = useCallback(async () => {
    await actions.cancelPairing();
    setStep("idle");
  }, [actions]);

  // Poll for root key (claimer)
  const startPollingForRootKey = useCallback(() => {
    pollRef.current = setInterval(async () => {
      try {
        const received = await actions.pollForRootKey();
        if (received) {
          if (pollRef.current) clearInterval(pollRef.current);
          setStep("success");
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    }, 1500);
  }, [actions]);

  // Cancel pairing
  const cancel = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await actions.cancelPairing();
    setStep("idle");
    setError(null);
  }, [actions]);

  // Reset to initial state
  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep("idle");
    setError(null);
    setSas(null);
  }, []);

  return {
    step,
    error,
    sas,
    pairingCode: state.pairingSession?.code ?? null,
    expiresAt: state.pairingSession?.expiresAt ?? null,
    startAsIssuer,
    startAsClaimer,
    submitCode,
    confirmSAS,
    rejectSAS,
    cancel,
    reset,
  };
}
