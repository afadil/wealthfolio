// Pairing flow hook
// State machine for managing the pairing process
// ===============================================

import { useState, useCallback, useRef, useEffect } from "react";
import { useDeviceSync } from "../providers/device-sync-provider";
import { logger } from "@/adapters/tauri";

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
  const sessionKey = state.pairingSession?.sessionKey || state.claimResult?.sessionKey;
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
  }, []);

  // Start as issuer (trusted device)
  const startAsIssuer = useCallback(async () => {
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

  // Start as claimer (new device)
  const startAsClaimer = useCallback(() => {
    setError(null);
    setStep("enter_code");
  }, []);

  // Poll for root key (claimer) - defined early so other callbacks can use it
  const startPollingForRootKey = useCallback(() => {
    // Prevent multiple polling intervals
    if (pollRef.current) {
      logger.info("[usePairing] startPollingForRootKey called but already polling, skipping");
      return;
    }
    logger.info("[usePairing] startPollingForRootKey called, starting interval");
    pollRef.current = setInterval(async () => {
      try {
        logger.info("[usePairing] Polling for root key...");
        const received = await actionsRef.current.pollForRootKey();
        logger.info(`[usePairing] Poll result: ${received}`);
        if (received) {
          if (pollRef.current) clearInterval(pollRef.current);
          logger.info("[usePairing] Root key received! Setting success");
          setStep("success");
        }
      } catch (err) {
        logger.error(`[usePairing] Poll error: ${err}`);
        if (pollRef.current) clearInterval(pollRef.current);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    }, 1500);
  }, []);

  // Submit pairing code (claimer)
  const submitCode = useCallback(
    async (code: string) => {
      try {
        setError(null);
        setIsSubmitting(true);
        logger.info("[usePairing] Claiming pairing code...");
        const result = await actions.claimPairing(code);
        setIsSubmitting(false);

        if (result.requireSas) {
          setStep("verify_sas");
        } else {
          setStep("waiting_approval");
        }
        // Always start polling after successfully claiming
        // Claimer polls while waiting for issuer to verify SAS and send root key
        logger.info("[usePairing] Claim successful, starting to poll for root key");
        startPollingForRootKey();
      } catch (err) {
        setIsSubmitting(false);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    },
    [actions, startPollingForRootKey],
  );

  // Confirm SAS (both issuer and claimer can confirm)
  const confirmSAS = useCallback(async () => {
    try {
      setError(null);

      // Check if we're the issuer (has pairingSession with code) or claimer
      const isIssuer = state.pairingRole === "issuer";
      logger.info(`[usePairing] confirmSAS called, isIssuer: ${isIssuer}`);

      if (isIssuer) {
        // Issuer: approve pairing and send root key
        logger.info("[usePairing] Approving pairing...");
        await actions.approvePairing();
        setStep("transferring");
        logger.info("[usePairing] Sending root key...");
        await actions.sendRootKey();
        logger.info("[usePairing] Root key sent, setting success");
        setStep("success");
      } else {
        // Claimer: just approve and wait for root key
        logger.info("[usePairing] Starting to poll for root key...");
        setStep("waiting_approval");
        startPollingForRootKey();
      }
    } catch (err) {
      logger.error(`[usePairing] confirmSAS error: ${err}`);
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  }, [actions, state.pairingRole, startPollingForRootKey]);

  // Reject SAS
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
    startAsIssuer,
    startAsClaimer,
    submitCode,
    confirmSAS,
    rejectSAS,
    cancel,
    reset,
  };
}
