// Pairing flow hook
// State machine for managing the pairing process (issuer side only for now)
// =========================================================================

import { useState, useCallback, useRef, useEffect } from "react";
import { useDeviceSync } from "../providers/device-sync-provider";
import { logger } from "@/adapters";

export type PairingStep =
  | "idle"
  | "display_code"
  | "waiting_claim"
  | "verify_sas"
  | "transferring"
  | "success"
  | "error"
  | "expired";

/**
 * Hook for managing the pairing flow (issuer/trusted device side)
 * Creates a pairing session and waits for a claimer to connect
 */
export function usePairing() {
  const { state, actions } = useDeviceSync();
  const [step, setStep] = useState<PairingStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sas, setSas] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use ref to always access latest actions (avoids stale closure in setInterval)
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Compute SAS when session key is available
  const sessionKey = state.pairingSession?.sessionKey;
  useEffect(() => {
    if (!sessionKey) {
      setSas(null);
      return;
    }
    actions.computeSAS().then(setSas).catch(() => setSas(null));
  }, [sessionKey, actions]);

  // Poll for claimer connection (issuer)
  const startPollingForClaimerConnection = useCallback(() => {
    pollRef.current = setInterval(async () => {
      // Check if session has expired
      const expiresAt = state.pairingSession?.expiresAt;
      if (expiresAt && new Date() > expiresAt) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError("Pairing session expired");
        setStep("expired");
        return;
      }

      try {
        const claimed = await actionsRef.current.pollForClaimerConnection();
        if (claimed) {
          if (pollRef.current) clearInterval(pollRef.current);
          // Session is now claimed, move to SAS verification
          setStep("verify_sas");
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    }, 2000); // Poll every 2 seconds
  }, [state.pairingSession?.expiresAt]);

  // Start pairing as issuer (trusted device)
  const startPairing = useCallback(async () => {
    try {
      setError(null);
      setStep("display_code");
      await actions.startPairing();
      // Start polling for when claimer connects
      startPollingForClaimerConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [actions, startPollingForClaimerConnection]);

  // Confirm SAS verification and complete pairing (issuer only)
  const confirmSAS = useCallback(async () => {
    try {
      setError(null);
      setIsSubmitting(true);
      logger.info("[usePairing] confirmSAS called");

      // Approve pairing first
      logger.info("[usePairing] Approving pairing...");
      await actions.approvePairing();

      // Then complete pairing (sends encrypted key bundle)
      setStep("transferring");
      logger.info("[usePairing] Completing pairing...");
      await actions.completePairing();

      logger.info("[usePairing] Pairing completed successfully");
      setStep("success");
    } catch (err) {
      logger.error(`[usePairing] confirmSAS error: ${err}`);
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    } finally {
      setIsSubmitting(false);
    }
  }, [actions]);

  // Reject SAS verification
  const rejectSAS = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await actions.cancelPairing();
    setStep("idle");
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
    isSubmitting,
    pairingCode: state.pairingSession?.code ?? null,
    expiresAt: state.pairingSession?.expiresAt ?? null,
    role: state.pairingRole,
    startPairing,
    confirmSAS,
    rejectSAS,
    cancel,
    reset,
  };
}
