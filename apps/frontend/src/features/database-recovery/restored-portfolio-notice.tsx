import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useProfile } from "@/features/profiles/profile-context";
import { useSettingsContext } from "@/lib/settings-provider";

/** Mounted behind database readiness; the restored database owns this flag. */
export function RestoredPortfolioNotice() {
  const { settings } = useSettingsContext();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const profile = useProfile();
  const reconnect = settings?.restoreReconnectRequired && profile?.profile?.hasConnectBinding;
  useEffect(() => {
    if (!reconnect) return;
    const id = "restored-portfolio";
    toast.info(t("settings:backup_restored_title"), {
      id,
      description: t("settings:backup_import_reconnect"),
      duration: Infinity,
      action: {
        label: t("settings:backup_restored_open_connect"),
        onClick: () => navigateRef.current("/settings/connect"),
      },
    });
    // Dismissal is presentation only. The backend clears the flag on reconnect.
    return () => {
      toast.dismiss(id);
    };
  }, [reconnect, t]);
  return null;
}
