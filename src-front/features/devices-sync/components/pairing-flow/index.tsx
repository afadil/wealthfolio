// PairingFlow
// Main component that orchestrates the pairing flow
// =================================================

import { useEffect, useRef, useCallback } from "react";
import { usePairing } from "../../hooks";
import { useDeviceSync } from "../../providers/device-sync-provider";
import { DisplayCode } from "./display-code";
import { EnterCode } from "./enter-code";
import { SASVerification } from "./sas-verification";
import { WaitingState } from "./waiting-state";
import { PairingResult } from "./pairing-result";

interface PairingFlowProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function PairingFlow({ onComplete, onCancel }: PairingFlowProps) {
  const { state } = useDeviceSync();
  const {
    step,
    error,
    sas,
    isSubmitting,
    pairingCode,
    expiresAt,
    startAsIssuer,
    startAsClaimer,
    submitCode,
    confirmSAS,
    rejectSAS,
    cancel,
    reset,
  } = usePairing();

  // Auto-start based on trust state (only once when component mounts at idle)
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (step === "idle" && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      if (state.trustState === "trusted") {
        // Trusted device: start as issuer (show code)
        startAsIssuer();
      } else {
        // Untrusted device: start as claimer (enter code)
        startAsClaimer();
      }
    }
  }, [step, state.trustState, startAsIssuer, startAsClaimer]);

  const handleDone = useCallback(() => {
    reset();
    onComplete?.();
  }, [reset, onComplete]);

  const handleCancel = useCallback(() => {
    cancel();
    onCancel?.();
  }, [cancel, onCancel]);

  const handleRetry = useCallback(() => {
    reset();
  }, [reset]);

  switch (step) {
    case "idle":
    case "select_mode":
      return <WaitingState title="Starting..." onCancel={onCancel} />;

    case "display_code":
    case "waiting_claim":
      if (pairingCode && expiresAt) {
        return <DisplayCode code={pairingCode} expiresAt={expiresAt} onCancel={handleCancel} />;
      }
      return <WaitingState title="Generating code..." onCancel={handleCancel} showQRSkeleton />;

    case "enter_code":
      return <EnterCode onSubmit={submitCode} onCancel={handleCancel} error={error} isLoading={isSubmitting} />;

    case "verify_sas":
      if (sas) {
        return (
          <SASVerification
            sas={sas}
            role={state.pairingRole ?? "claimer"}
            onConfirm={confirmSAS}
            onReject={rejectSAS}
          />
        );
      }
      return <WaitingState title="Computing security code..." onCancel={handleCancel} />;

    case "waiting_approval":
      return <WaitingState title="Waiting for other device..." onCancel={handleCancel} />;

    case "transferring":
      return <WaitingState title="Transferring key..." />;

    case "success":
      return <PairingResult success onDone={handleDone} />;

    case "error":
      return <PairingResult success={false} error={error} onRetry={handleRetry} onDone={handleCancel} />;

    case "expired":
      return <PairingResult success={false} error="Session expired" onRetry={handleRetry} onDone={handleCancel} />;

    default:
      return null;
  }
}

// Re-export sub-components for flexibility
export { DisplayCode } from "./display-code";
export { EnterCode } from "./enter-code";
export { SASVerification } from "./sas-verification";
export { WaitingState } from "./waiting-state";
export { PairingResult } from "./pairing-result";
