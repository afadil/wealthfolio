import { Icons } from "@/components/ui/icons";
import { useWealthfolioConnect } from "@/features/wealthfolio-connect";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Auth callback page that handles OAuth and magic link redirects.
 * Waits for the WealthfolioConnectContext to process the auth tokens,
 * then redirects to the connect settings page.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { isConnected, isLoading, error } = useWealthfolioConnect();
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  useEffect(() => {
    // Log the current URL for debugging
    console.log("AuthCallbackPage mounted, URL:", window.location.href);
    console.log("Hash:", window.location.hash);
  }, []);

  useEffect(() => {
    // Wait for the context to finish loading
    if (isLoading) {
      return;
    }

    setHasCheckedAuth(true);

    // If connected, redirect to sync settings
    if (isConnected) {
      navigate("/settings/wealthfolio-connect", { replace: true });
      return;
    }

    // If there's an error, still redirect but show error on the settings page
    if (error) {
      console.error("Auth error:", error);
      navigate("/settings/wealthfolio-connect", { replace: true });
      return;
    }

    // If not connected after checking, wait a bit more then redirect
    // (the context might still be processing)
    const timer = setTimeout(() => {
      console.log("Timeout reached, redirecting to settings...");
      navigate("/settings/wealthfolio-connect", { replace: true });
    }, 5000);

    return () => clearTimeout(timer);
  }, [isConnected, isLoading, error, navigate]);

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Icons.Spinner className="text-muted-foreground h-8 w-8 animate-spin" />
        <p className="text-muted-foreground text-sm">
          {hasCheckedAuth && !isConnected
            ? "Processing authentication..."
            : "Completing sign in..."}
        </p>
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
    </div>
  );
}
