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

  // Start polling when session becomes available (avoids stale closure)
  useEffect(() => {
    // Only start polling when we have a session and step is display_code/waiting_claim
    if (!state.pairingSession?.pairingId) return;
    if (step !== "display_code" && step !== "waiting_claim") return;

    // Clear any existing interval
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    logger.info(`[usePairing] Starting poll for claimer, pairingId: ${state.pairingSession.pairingId}`);

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
          logger.info("[usePairing] Claimer detected! Moving to verify_sas");
          if (pollRef.current) clearInterval(pollRef.current);
          // Session is now claimed, move to SAS verification
          setStep("verify_sas");
        }
      } catch (err) {
        logger.error(`[usePairing] Poll error: ${err}`);
        if (pollRef.current) clearInterval(pollRef.current);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [state.pairingSession?.pairingId, state.pairingSession?.expiresAt, step]);

  // Start pairing as issuer (trusted device)
  const startPairing = useCallback(async () => {
    logger.info("[usePairing] startPairing called");
    try {
      setError(null);
      setStep("display_code");
      const session = await actions.startPairing();
      logger.info(`[usePairing] Session created: ${session.pairingId}, code: ${session.code}`);
      // Polling will start automatically via useEffect when state.pairingSession is set
    } catch (err) {
      logger.error(`[usePairing] startPairing error: ${err}`);
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [actions]);

  // Confirm SAS verification and complete pairing (issuer only)
  const confirmSAS = useCallback(async () => {
    try {
      setError(null);
      setIsSubmitting(true);
      logger.info("[usePairing] confirmSAS: approving pairing...");

      // Approve pairing first
      await actionsRef.current.approvePairing();
      logger.info("[usePairing] confirmSAS: pairing approved, completing...");

      // Then complete pairing (sends encrypted key bundle)
      setStep("transferring");
      await actionsRef.current.completePairing();
      logger.info("[usePairing] confirmSAS: pairing completed, setting success");

      setStep("success");
    } catch (err) {
      logger.error(`[usePairing] confirmSAS error: ${err}`);
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  // Reject SAS verification
  const rejectSAS = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await actionsRef.current.cancelPairing();
    setStep("idle");
  }, []);

  // Cancel pairing
  const cancel = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await actionsRef.current.cancelPairing();
    setStep("idle");
    setError(null);
  }, []);

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
