// PairingFlow
// Main component that orchestrates the pairing flow
// =================================================

import { usePairing } from "../../hooks";
import { useSync } from "../../providers/sync-provider";
import { ModeSelect } from "./mode-select";
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
  const { state } = useSync();
  const {
    step,
    error,
    sas,
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

  const handleDone = () => {
    reset();
    onComplete?.();
  };

  const handleCancel = () => {
    cancel();
    onCancel?.();
  };

  const handleRetry = () => {
    reset();
  };

  switch (step) {
    case "idle":
    case "select_mode":
      return (
        <ModeSelect
          onSelectIssuer={startAsIssuer}
          onSelectClaimer={startAsClaimer}
          onCancel={onCancel}
        />
      );

    case "display_code":
    case "waiting_claim":
      if (pairingCode && expiresAt) {
        return <DisplayCode code={pairingCode} expiresAt={expiresAt} onCancel={handleCancel} />;
      }
      return (
        <WaitingState
          title="Creating Session"
          description="Generating pairing code..."
          onCancel={handleCancel}
        />
      );

    case "enter_code":
      return (
        <EnterCode
          onSubmit={submitCode}
          onCancel={handleCancel}
          isLoading={false}
          error={error}
        />
      );

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
      return (
        <WaitingState
          title="Processing"
          description="Computing security code..."
          onCancel={handleCancel}
        />
      );

    case "waiting_approval":
      return (
        <WaitingState
          title="Waiting for Approval"
          description="Please confirm the pairing on your other device"
          onCancel={handleCancel}
        />
      );

    case "transferring":
      return (
        <WaitingState
          title="Transferring Key"
          description="Securely transferring encryption key..."
        />
      );

    case "success":
      return <PairingResult success={true} onDone={handleDone} />;

    case "error":
      return <PairingResult success={false} error={error} onRetry={handleRetry} onDone={handleCancel} />;

    case "expired":
      return (
        <PairingResult
          success={false}
          error="Pairing session expired. Please try again."
          onRetry={handleRetry}
          onDone={handleCancel}
        />
      );

    default:
      return null;
  }
}

// Re-export sub-components for flexibility
export { ModeSelect } from "./mode-select";
export { DisplayCode } from "./display-code";
export { EnterCode } from "./enter-code";
export { SASVerification } from "./sas-verification";
export { WaitingState } from "./waiting-state";
export { PairingResult } from "./pairing-result";
