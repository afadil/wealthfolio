import { logger } from "@/adapters";
import { syncBrokerData } from "@/commands/brokers-sync";
import { toast } from "@/components/ui/use-toast";
import {
  SNAPTRADE_CALLBACK_EVENT,
  type SnapTradeCallbackData,
} from "@/context/wealthfolio-sync-context";
import { QueryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo } from "react";
import { SnapTradeReact, type ErrorData } from "snaptrade-react";

interface SnapTradeConnectPortalProps {
  /**
   * The login link URL for the SnapTrade connection portal.
   * Retrieved from the backend's `get_connect_portal_url` command.
   */
  loginLink: string | null;

  /**
   * Controls whether the modal is visible.
   */
  isOpen: boolean;

  /**
   * Callback invoked when the modal should be closed.
   * Called on user exit, close button click, or after successful connection.
   */
  onClose: () => void;

  /**
   * Optional callback triggered after a successful connection.
   * @param authorizationId - The authorization ID for the new connection.
   */
  onSuccess?: (authorizationId: string) => void;

  /**
   * Optional callback triggered when an error occurs during connection.
   * @param error - Error details from SnapTrade.
   */
  onError?: (error: ErrorData) => void;
}

/**
 * Resolves the current theme from the DOM.
 * Checks the document element's class list for 'dark' or 'light'.
 * Falls back to checking the color-scheme style or media query.
 */
function resolveCurrentTheme(): "light" | "dark" {
  if (typeof document === "undefined") {
    return "light";
  }

  // Check document class (set by settings provider)
  if (document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  if (document.documentElement.classList.contains("light")) {
    return "light";
  }

  // Fallback: check color-scheme style
  const colorScheme = document.documentElement.style.colorScheme;
  if (colorScheme === "dark") {
    return "dark";
  }
  if (colorScheme === "light") {
    return "light";
  }

  // Fallback: check system preference
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "light";
}

/**
 * Appends the darkMode parameter to the SnapTrade login URL based on current app theme.
 */
function appendThemeToUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const isDarkMode = resolveCurrentTheme() === "dark";
    parsedUrl.searchParams.set("darkMode", isDarkMode.toString());
    return parsedUrl.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * SnapTrade Connect Portal Component
 *
 * Renders the SnapTrade connection portal in a modal using the official
 * snaptrade-react SDK. Handles success/error callbacks and automatically
 * syncs broker data on successful connection.
 *
 * The component automatically passes the current app theme (dark/light) to
 * SnapTrade via the `darkMode` URL parameter for a consistent visual experience.
 *
 * @see https://github.com/passiv/snaptrade-react
 */
export function SnapTradeConnectPortal({
  loginLink,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: SnapTradeConnectPortalProps) {
  const queryClient = useQueryClient();

  // Memoize the themed URL to avoid recalculating on every render
  const themedLoginLink = useMemo(() => {
    if (!loginLink) return null;
    return appendThemeToUrl(loginLink);
  }, [loginLink]);

  const handleSuccess = useCallback(
    async (authorizationId: string) => {
      logger.info(`SnapTrade connection successful: ${authorizationId}`);

      toast.success("Broker account connected successfully!");

      // Invalidate broker connections to trigger a refetch
      queryClient.invalidateQueries({ queryKey: [QueryKeys.BROKER_CONNECTIONS] });

      // Automatically sync broker data after successful connection
      try {
        await syncBrokerData();
        queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
        queryClient.invalidateQueries({ queryKey: [QueryKeys.PLATFORMS] });
      } catch (syncError) {
        logger.error(`Failed to sync broker data after connection: ${String(syncError)}`);
      }

      // Close the modal and notify parent
      onClose();
      onSuccess?.(authorizationId);
    },
    [queryClient, onClose, onSuccess],
  );

  const handleError = useCallback(
    (error: ErrorData) => {
      logger.error(`SnapTrade connection error: ${error.detail}`);
      toast.error(`Connection failed: ${error.detail || "Unknown error"}`);
      onError?.(error);
    },
    [onError],
  );

  const handleClose = useCallback(() => {
    logger.info("SnapTrade connection portal closed");
    onClose();
  }, [onClose]);

  // Listen for SnapTrade deep link callbacks (for OAuth flows that open external browser)
  useEffect(() => {
    if (!isOpen) return;

    const handleSnapTradeDeepLink = (event: Event) => {
      const customEvent = event as CustomEvent<SnapTradeCallbackData>;
      const data = customEvent.detail;

      logger.info(`SnapTrade deep link callback received: ${JSON.stringify(data)}`);

      if (data.status === "SUCCESS") {
        // Trigger the success handler with the authorization ID
        void handleSuccess(data.authorizationId ?? "SUCCESS");
      } else if (data.status === "ERROR") {
        // Trigger the error handler
        handleError({
          statusCode: data.errorCode ?? "UNKNOWN_ERROR",
          detail: data.detail ?? "Connection failed",
        });
      }
    };

    window.addEventListener(SNAPTRADE_CALLBACK_EVENT, handleSnapTradeDeepLink);

    return () => {
      window.removeEventListener(SNAPTRADE_CALLBACK_EVENT, handleSnapTradeDeepLink);
    };
  }, [isOpen, handleSuccess, handleError]);

  // Don't render anything if there's no login link
  if (!themedLoginLink) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <SnapTradeReact
          loginLink={themedLoginLink}
          isOpen={isOpen}
          close={handleClose}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      </CardContent>
    </Card>
  );
}
