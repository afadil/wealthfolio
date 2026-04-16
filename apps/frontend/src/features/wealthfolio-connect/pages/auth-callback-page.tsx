import { useWealthfolioConnect } from "@/features/wealthfolio-connect";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

/**
 * Auth callback page that handles OAuth and magic link redirects.
 * Waits for the WealthfolioConnectContext to process the auth tokens,
 * then redirects to the connect settings page.
 */
export default function AuthCallbackPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { isConnected, isLoading, error } = useWealthfolioConnect();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    setHasCheckedAuth(true);

    if (isConnected) {
      navigate("/settings/connect", { replace: true });
      return;
    }

    if (error) {
      console.error("Auth error:", error);
      navigate("/settings/connect", { replace: true });
      return;
    }

    const timer = setTimeout(() => {
      navigate("/settings/connect", { replace: true });
    }, 5000);

    return () => clearTimeout(timer);
  }, [isConnected, isLoading, error, navigate]);

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Icons.Spinner className="text-muted-foreground h-8 w-8 animate-spin" />
        <p className="text-muted-foreground text-sm">
          {hasCheckedAuth && !isConnected
            ? t("connect.auth_callback.processing")
            : t("connect.auth_callback.completing")}
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    </div>
  );
}
