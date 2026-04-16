// PairingResult
// Shows success or error state after pairing
// ==========================================

import { useEffect, useRef } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";

interface PairingResultProps {
  success: boolean;
  error?: string | null;
  onRetry?: () => void;
  onDone?: () => void;
  retryLabel?: string;
  doneLabel?: string;
}

function formatError(error: string | null | undefined, t: (key: string) => string): string {
  if (!error) return t("deviceSync.pairing.error.generic");
  const e = error.toLowerCase();

  if (e.includes("sync_source_restore_required"))
    return t("deviceSync.pairing.error.sync_source_restore_required");
  if (e.includes("snapshot") && e.includes("failed"))
    return t("deviceSync.pairing.error.snapshot_failed");
  if (e.includes("invalid") && e.includes("code")) return t("deviceSync.pairing.error.invalid_code");
  if (e.includes("expired")) return t("deviceSync.pairing.error.session_expired_restart");
  if (e.includes("cancel")) return t("deviceSync.pairing.error.cancelled");
  if (e.includes("network") || e.includes("fetch")) return t("deviceSync.pairing.error.network");
  if (e.includes("timeout")) return t("deviceSync.pairing.error.timeout");
  if (e.includes("not found")) return t("deviceSync.pairing.error.not_found");
  if (e.includes("decrypt") || e.includes("authentication"))
    return t("deviceSync.pairing.error.security_verification_failed");

  return error.length > 100 ? error.slice(0, 97) + "..." : error;
}

export function PairingResult({
  success,
  error,
  onRetry,
  onDone,
  retryLabel,
  doneLabel,
}: PairingResultProps) {
  const { t } = useTranslation("common");
  const hasCalledDone = useRef(false);

  // Auto-close on success - call immediately
  useEffect(() => {
    if (success && onDone && !hasCalledDone.current) {
      hasCalledDone.current = true;
      // Small delay just to flash success state
      const timer = setTimeout(onDone, 800);
      return () => clearTimeout(timer);
    }
  }, [success, onDone]);

  if (success) {
    return (
      <div className="flex flex-col items-center px-4 py-6">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Icons.CheckCircle className="h-10 w-10 text-green-600 dark:text-green-500" />
        </div>
        <div className="mb-6 text-center">
          <p className="text-foreground text-lg font-semibold">{t("deviceSync.pairing.success_title")}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            {t("deviceSync.pairing.success_description")}
          </p>
        </div>
        <Button className="w-full max-w-[200px]" onClick={onDone}>
          {t("common.done")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-4 py-6">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <Icons.XCircle className="h-10 w-10 text-red-600 dark:text-red-500" />
      </div>
      <div className="mb-6 text-center">
        <p className="text-foreground text-base font-semibold">{t("deviceSync.pairing.connection_failed")}</p>
        <p className="text-muted-foreground mt-2 max-w-[240px] text-sm">{formatError(error, t)}</p>
      </div>
      <div className="flex gap-3">
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            {retryLabel ?? t("common.try_again")}
          </Button>
        )}
        <Button variant={onRetry ? "ghost" : "default"} onClick={onDone}>
          {doneLabel ?? (onRetry ? t("common.cancel") : t("common.close"))}
        </Button>
      </div>
    </div>
  );
}
