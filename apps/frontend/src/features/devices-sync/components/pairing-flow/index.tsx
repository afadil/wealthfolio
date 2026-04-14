// PairingFlow
// Main component that orchestrates the pairing flow (issuer and claimer)
// =====================================================================

import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePairingIssuer, usePairingClaimer, useSyncStatus } from "../../hooks";
import { logger } from "@/adapters";
import { DisplayCode } from "./display-code";
import { SASVerification } from "./sas-verification";
import { WaitingState } from "./waiting-state";
import { PairingResult } from "./pairing-result";
import { EnterCode } from "./enter-code";

interface PairingFlowProps {
  onComplete?: () => void;
  onCancel?: () => void;
  /** Title shown during the initial step (display_code for issuer, enter_code for claimer) */
  title?: string;
  /** Description shown during the initial step */
  description?: string;
  /** Override auto-detected role (e.g. REGISTERED state always needs claimer) */
  forceRole?: "issuer" | "claimer";
}

/** Inline title block rendered above the initial step content */
function StepHeader({ title, description }: { title?: string; description?: string }) {
  if (!title) return null;
  return (
    <div className="mb-1 text-center">
      <p className="text-foreground text-base font-semibold">{title}</p>
      {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
    </div>
  );
}

export function PairingFlow({
  onComplete,
  onCancel,
  title,
  description,
  forceRole,
}: PairingFlowProps) {
  const { device } = useSyncStatus();
  const initialRoleRef = useRef<"issuer" | "claimer" | null>(forceRole ?? null);
  if (initialRoleRef.current == null && device) {
    initialRoleRef.current = device.trustState === "trusted" ? "issuer" : "claimer";
  }
  const isTrusted =
    initialRoleRef.current != null
      ? initialRoleRef.current === "issuer"
      : device?.trustState === "trusted";

  if (isTrusted) {
    return (
      <IssuerFlow
        onComplete={onComplete}
        onCancel={onCancel}
        title={title}
        description={description}
      />
    );
  } else {
    return (
      <ClaimerFlow
        onComplete={onComplete}
        onCancel={onCancel}
        title={title}
        description={description}
      />
    );
  }
}

// Issuer Flow (trusted device - displays QR code)
function IssuerFlow({ onComplete, onCancel, title, description }: PairingFlowProps) {
  const { t } = useTranslation("common");
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
  } = usePairingIssuer();

  // Auto-start pairing when component mounts
  const hasAutoStarted = useRef(false);
  useEffect(() => {
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
      return <WaitingState title={t("deviceSync.pairing.starting")} onCancel={onCancel} />;

    case "display_code":
      if (pairingCode && expiresAt) {
        return (
          <>
            <StepHeader title={title} description={description} />
            <DisplayCode code={pairingCode} expiresAt={expiresAt} onCancel={handleCancel} />
          </>
        );
      }
      return (
        <WaitingState
          title={t("deviceSync.pairing.generating_code")}
          onCancel={handleCancel}
          showQRSkeleton
        />
      );

    case "verify_sas":
      if (sas) {
        return <SASVerification sas={sas} onConfirm={confirmSAS} onReject={rejectSAS} />;
      }
      return (
        <WaitingState title={t("deviceSync.pairing.computing_security_code")} onCancel={handleCancel} />
      );

    case "transferring":
      return (
        <WaitingState
          title={t("deviceSync.pairing.finishing_setup")}
          description={t("deviceSync.pairing.finishing_setup_description")}
        />
      );

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
          error={t("deviceSync.pairing.session_expired")}
          onRetry={handleRetry}
          onDone={handleCancel}
        />
      );

    default:
      return null;
  }
}

// Claimer Flow (untrusted device - enters code and receives keys)
function ClaimerFlow({ onComplete, onCancel, title, description }: PairingFlowProps) {
  const { t } = useTranslation("common");
  const { step, error, sas, submitCode, cancel, retry } = usePairingClaimer();

  const handleCancel = useCallback(async () => {
    await cancel();
    onCancel?.();
  }, [cancel, onCancel]);

  const handleDone = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  switch (step) {
    case "enter_code":
      return (
        <>
          <StepHeader title={title} description={description} />
          <EnterCode onSubmit={submitCode} onCancel={handleCancel} error={error} />
        </>
      );

    case "connecting":
      return <WaitingState title={t("deviceSync.pairing.connecting")} onCancel={handleCancel} />;

    case "waiting_keys":
      return (
        <WaitingState
          title={t("deviceSync.pairing.verify_security_code")}
          securityCode={sas}
          onCancel={handleCancel}
        />
      );

    case "syncing":
      return (
        <WaitingState
          title={t("deviceSync.pairing.syncing_data")}
          description={t("deviceSync.pairing.syncing_description")}
        />
      );

    case "success":
      return <PairingResult success onDone={handleDone} />;

    case "error":
      return <PairingResult success={false} error={error} onRetry={retry} onDone={handleCancel} />;

    default:
      return null;
  }
}

// Re-export sub-components for flexibility
export { DisplayCode } from "./display-code";
export { SASVerification } from "./sas-verification";
export { WaitingState } from "./waiting-state";
export { PairingResult } from "./pairing-result";
