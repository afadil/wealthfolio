// PairingFlow
// Main component that orchestrates the pairing flow (issuer side only)
// =====================================================================

import { useEffect, useRef, useCallback } from "react";
import { usePairing } from "../../hooks";
import { useDeviceSync } from "../../providers/device-sync-provider";
import { DisplayCode } from "./display-code";
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
    pairingCode,
    expiresAt,
    startPairing,
    confirmSAS,
    rejectSAS,
    cancel,
    reset,
  } = usePairing();

  // Auto-start pairing when component mounts (issuer flow only)
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (step === "idle" && !hasAutoStarted.current && state.device?.trustState === "trusted") {
      hasAutoStarted.current = true;
      startPairing();
    }
  }, [step, state.device?.trustState, startPairing]);

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
      return <PairingResult success={false} error={error} onRetry={handleRetry} onDone={handleCancel} />;

    case "expired":
      return <PairingResult success={false} error="Session expired" onRetry={handleRetry} onDone={handleCancel} />;

    default:
      return null;
  }
}

// Re-export sub-components for flexibility
export { DisplayCode } from "./display-code";
export { SASVerification } from "./sas-verification";
export { WaitingState } from "./waiting-state";
export { PairingResult } from "./pairing-result";
