// PairingFlow
// Main component that orchestrates the pairing flow (issuer and claimer)
// =====================================================================

import { useEffect, useRef, useCallback, useState } from "react";
import { usePairing } from "../../hooks";
import { useDeviceSync } from "../../providers/device-sync-provider";
import { logger } from "@/adapters";
import { DisplayCode } from "./display-code";
import { SASVerification } from "./sas-verification";
import { WaitingState } from "./waiting-state";
import { PairingResult } from "./pairing-result";
import { EnterCode } from "./enter-code";
import type { KeyBundlePayload } from "../../types";

interface PairingFlowProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

// Claimer flow steps
type ClaimerStep =
  | "enter_code"
  | "connecting"
  | "waiting_keys"
  | "verify_sas"
  | "success"
  | "error";

export function PairingFlow({ onComplete, onCancel }: PairingFlowProps) {
  const { state } = useDeviceSync();

  // Determine role: trusted = issuer, untrusted = claimer
  const isTrusted = state.device?.trustState === "trusted";

  if (isTrusted) {
    return <IssuerFlow onComplete={onComplete} onCancel={onCancel} />;
  } else {
    return <ClaimerFlow onComplete={onComplete} onCancel={onCancel} />;
  }
}

// Issuer Flow (trusted device - displays QR code)
function IssuerFlow({ onComplete, onCancel }: PairingFlowProps) {
  const { state } = useDeviceSync();
  const {
    step,
    error,
    sas,
    pairingCode,
    expiresAt,
    startPairing,
    confirmSAS,
    rejectSAS,
    cancel,
    reset,
  } = usePairing();

  // Debug: log step changes
  useEffect(() => {
    logger.info(`[IssuerFlow] Step changed to: ${step}, pairingCode: ${pairingCode ?? "null"}`);
  }, [step, pairingCode]);

  // Auto-start pairing when component mounts
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    logger.info(
      `[IssuerFlow] Auto-start check: step=${step}, hasAutoStarted=${hasAutoStarted.current}`,
    );
    if (step === "idle" && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      logger.info("[IssuerFlow] Starting pairing...");
      startPairing();
    }
  }, [step, startPairing]);

  const handleDone = useCallback(() => {
    reset();
    onComplete?.();
  }, [reset, onComplete]);

  const handleCancel = useCallback(() => {
    cancel();
    onCancel?.();
  }, [cancel, onCancel]);

  const handleRetry = useCallback(() => {
    hasAutoStarted.current = false;
    reset();
  }, [reset]);

  switch (step) {
    case "idle":
      return <WaitingState title="Starting..." onCancel={onCancel} />;

    case "display_code":
    case "waiting_claim":
      if (pairingCode && expiresAt) {
        return <DisplayCode code={pairingCode} expiresAt={expiresAt} onCancel={handleCancel} />;
      }
      return <WaitingState title="Generating code..." onCancel={handleCancel} showQRSkeleton />;

    case "verify_sas":
      if (sas) {
        return (
          <SASVerification
            sas={sas}
            role={state.pairingRole ?? "issuer"}
            onConfirm={confirmSAS}
            onReject={rejectSAS}
          />
        );
      }
      return <WaitingState title="Computing security code..." onCancel={handleCancel} />;

    case "transferring":
      return <WaitingState title="Transferring key..." />;

    case "success":
      return <PairingResult success onDone={handleDone} />;

    case "error":
      return (
        <PairingResult success={false} error={error} onRetry={handleRetry} onDone={handleCancel} />
      );

    case "expired":
      return (
        <PairingResult
          success={false}
          error="Session expired"
          onRetry={handleRetry}
          onDone={handleCancel}
        />
      );

    default:
      return null;
  }
}

// Claimer Flow (untrusted device - enters code and receives keys)
function ClaimerFlow({ onComplete, onCancel }: PairingFlowProps) {
  const { state, actions } = useDeviceSync();
  const [step, setStep] = useState<ClaimerStep>("enter_code");
  const [error, setError] = useState<string | null>(null);
  const [sas, setSas] = useState<string | null>(null);
  const [keyBundle, setKeyBundle] = useState<KeyBundlePayload | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sasConfirmedRef = useRef(false);

  // Use ref to always access latest actions (avoids stale closure in setInterval)
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  // Use ref to always access latest state (for requireSas check in interval)
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Compute SAS when session key is available
  const sessionKey = state.claimerSession?.sessionKey;
  useEffect(() => {
    if (!sessionKey) {
      setSas(null);
      return;
    }
    actionsRef.current
      .computeSAS()
      .then(setSas)
      .catch(() => setSas(null));
  }, [sessionKey]);

  // Start polling for key bundle
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // Already polling

    logger.info("[ClaimerFlow] Starting key bundle polling...");

    pollRef.current = setInterval(async () => {
      try {
        const result = await actionsRef.current.pollForKeyBundle();
        logger.info(
          `[ClaimerFlow] Poll result: received=${result.received}, hasKeyBundle=${!!result.keyBundle}`,
        );
        if (result.received && result.keyBundle) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;

          // Auto-complete when key bundle is received
          // The issuer (trusted device) already verified SAS, so claimer can auto-complete
          // This follows Signal/WhatsApp UX pattern where only the authorizing device confirms
          logger.info("[ClaimerFlow] Key bundle received, auto-completing pairing...");
          setStep("waiting_keys"); // Show spinner while completing
          await actionsRef.current.confirmPairingAsClaimer(result.keyBundle);
          logger.info("[ClaimerFlow] Pairing confirmed, setting success");
          setStep("success");
        }
      } catch (err) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        logger.error(`[ClaimerFlow] Poll error: ${err}`);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    }, 2000);
  }, []);

  // Handle code submission
  const handleCodeSubmit = useCallback(
    async (code: string) => {
      logger.info(`[ClaimerFlow] Submitting code: ${code}`);
      setStep("connecting");
      setError(null);

      try {
        const session = await actionsRef.current.claimPairing(code);
        logger.info(`[ClaimerFlow] Session claimed, pairingId=${session.pairingId}`);

        // Start polling for key bundle in background
        startPolling();

        // Show waiting state - claimer auto-completes when key bundle arrives
        // SAS verification happens on issuer (trusted device) side only
        logger.info("[ClaimerFlow] Waiting for key bundle from trusted device...");
        setStep("waiting_keys");
      } catch (err) {
        logger.error(`[ClaimerFlow] Claim error: ${err}`);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    },
    [startPolling],
  );

  // Handle SAS confirmation
  const handleConfirmSAS = useCallback(async () => {
    logger.info(`[ClaimerFlow] SAS confirmed by user, keyBundle=${keyBundle ? "present" : "null"}`);
    sasConfirmedRef.current = true;

    // If key bundle already received, complete now
    if (keyBundle) {
      try {
        logger.info("[ClaimerFlow] Key bundle present, completing pairing...");
        setStep("waiting_keys"); // Show spinner while confirming
        await actionsRef.current.confirmPairingAsClaimer(keyBundle);
        logger.info("[ClaimerFlow] Pairing confirmed via SAS confirm");
        setStep("success");
      } catch (err) {
        logger.error(`[ClaimerFlow] Confirm error: ${err}`);
        setError(err instanceof Error ? err.message : String(err));
        setStep("error");
      }
    } else {
      // Key bundle not yet received, show waiting state
      // The polling callback will complete once key bundle arrives
      logger.info("[ClaimerFlow] Key bundle not yet received, waiting...");
      setStep("waiting_keys");
    }
  }, [keyBundle]);

  // Handle SAS rejection
  const handleRejectSAS = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    sasConfirmedRef.current = false;
    await actionsRef.current.cancelPairing();
    setStep("enter_code");
    setError(null);
    setKeyBundle(null);
  }, []);

  // Handle cancel
  const handleCancel = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await actionsRef.current.cancelPairing().catch(() => {});
    onCancel?.();
  }, [onCancel]);

  // Handle done
  const handleDone = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // Handle retry
  const handleRetry = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    sasConfirmedRef.current = false;
    setStep("enter_code");
    setError(null);
    setKeyBundle(null);
  }, []);

  switch (step) {
    case "enter_code":
      return <EnterCode onSubmit={handleCodeSubmit} onCancel={handleCancel} error={error} />;

    case "connecting":
      return <WaitingState title="Connecting..." onCancel={handleCancel} />;

    case "waiting_keys":
      return (
        <WaitingState title="Verify Security Code" securityCode={sas} onCancel={handleCancel} />
      );

    case "verify_sas":
      if (sas) {
        return (
          <SASVerification
            sas={sas}
            role="claimer"
            onConfirm={handleConfirmSAS}
            onReject={handleRejectSAS}
          />
        );
      }
      return <WaitingState title="Computing security code..." onCancel={handleCancel} />;

    case "success":
      return <PairingResult success onDone={handleDone} />;

    case "error":
      return (
        <PairingResult success={false} error={error} onRetry={handleRetry} onDone={handleCancel} />
      );

    default:
      return null;
  }
}

// Re-export sub-components for flexibility
export { DisplayCode } from "./display-code";
export { SASVerification } from "./sas-verification";
export { WaitingState } from "./waiting-state";
export { PairingResult } from "./pairing-result";
