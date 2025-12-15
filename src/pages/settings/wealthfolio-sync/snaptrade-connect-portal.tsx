import { logger, openUrlInBrowser } from "@/adapters";
import { listBrokerConnections, syncBrokerData, type BrokerConnection } from "@/commands/brokers-sync";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { toast } from "@/components/ui/use-toast";
import {
  SNAPTRADE_CALLBACK_EVENT,
  type SnapTradeCallbackData,
} from "@/context/wealthfolio-sync-context";
import { QueryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Polling interval for checking new connections (5 seconds)
const POLLING_INTERVAL_MS = 5000;

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
  onError?: (error: { statusCode?: string; detail?: string }) => void;

  /**
   * Initial connection IDs to compare against when polling for new connections.
   * Used to detect when a new connection is added.
   */
  initialConnectionIds?: string[];
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
 * Opens the SnapTrade connection portal in the system browser and shows a
 * waiting dialog. When the user completes the OAuth flow, SnapTrade redirects
 * back to the app via deep link (wealthfolio://), which triggers the success
 * callback.
 *
 * This approach avoids the iframe-based SDK which shows confusing "return to
 * other tab" messages in desktop apps.
 */
export function SnapTradeConnectPortal({
  loginLink,
  isOpen,
  onClose,
  onSuccess,
  onError,
  initialConnectionIds = [],
}: SnapTradeConnectPortalProps) {
  const queryClient = useQueryClient();
  const [isWaiting, setIsWaiting] = useState(false);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialIdsRef = useRef<Set<string>>(new Set(initialConnectionIds));

  // Update initial IDs when prop changes
  useEffect(() => {
    initialIdsRef.current = new Set(initialConnectionIds);
  }, [initialConnectionIds]);

  // Memoize the themed URL to avoid recalculating on every render
  const themedLoginLink = useMemo(() => {
    if (!loginLink) return null;
    return appendThemeToUrl(loginLink);
  }, [loginLink]);

  const handleSuccess = useCallback(
    async (authorizationId: string) => {
      logger.info(`SnapTrade connection successful: ${authorizationId}`);
      setIsWaiting(false);
      setBrowserOpened(false);

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
    (error: { statusCode?: string; detail?: string }) => {
      logger.error(`SnapTrade connection error: ${error.detail}`);
      setIsWaiting(false);
      setBrowserOpened(false);
      toast.error(`Connection failed: ${error.detail || "Unknown error"}`);
      onError?.(error);
    },
    [onError],
  );

  const handleClose = useCallback(() => {
    logger.info("SnapTrade connection portal closed by user");
    setIsWaiting(false);
    setBrowserOpened(false);
    onClose();
  }, [onClose]);

  // Open browser when portal becomes visible and we have a link
  useEffect(() => {
    if (isOpen && themedLoginLink && !browserOpened) {
      setBrowserOpened(true);
      setIsWaiting(true);
      logger.info("Opening SnapTrade portal in system browser");
      openUrlInBrowser(themedLoginLink).catch((err) => {
        logger.error(`Failed to open browser: ${String(err)}`);
        toast.error("Failed to open browser. Please try again.");
        setIsWaiting(false);
        setBrowserOpened(false);
      });
    }
  }, [isOpen, themedLoginLink, browserOpened]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setBrowserOpened(false);
      setIsWaiting(false);
    }
  }, [isOpen]);

  // Listen for SnapTrade deep link callbacks
  useEffect(() => {
    if (!isOpen) return;

    const handleSnapTradeDeepLink = (event: Event) => {
      const customEvent = event as CustomEvent<SnapTradeCallbackData>;
      const data = customEvent.detail;

      logger.info(`SnapTrade deep link callback received: ${JSON.stringify(data)}`);

      if (data.status === "SUCCESS") {
        void handleSuccess(data.authorizationId ?? "SUCCESS");
      } else if (data.status === "ERROR") {
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

  // Poll for new connections as a fallback mechanism
  // This helps detect successful connections when deep link redirect doesn't work
  useEffect(() => {
    if (!isOpen || !isWaiting) {
      // Clear polling when dialog closes or not waiting
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setIsPolling(false);
      return;
    }

    // Start polling after a short delay to allow deep link to work first
    const startPollingTimeout = setTimeout(() => {
      if (!isOpen || !isWaiting) return;

      setIsPolling(true);
      logger.info("Starting connection polling as fallback mechanism");

      const pollForConnections = async () => {
        try {
          const connections = await listBrokerConnections();
          const currentIds = new Set(connections.map((c: BrokerConnection) => c.id));

          // Find new connection IDs that weren't in the initial set
          const newConnectionIds = [...currentIds].filter((id) => !initialIdsRef.current.has(id));

          if (newConnectionIds.length > 0) {
            logger.info(`Polling detected new connection(s): ${newConnectionIds.join(", ")}`);
            // Use the first new connection ID
            void handleSuccess(newConnectionIds[0]);
          }
        } catch (error) {
          logger.error(`Polling error: ${String(error)}`);
          // Don't show error to user, just continue polling
        }
      };

      // Poll immediately once, then at intervals
      void pollForConnections();
      pollingIntervalRef.current = setInterval(pollForConnections, POLLING_INTERVAL_MS);
    }, 3000); // Wait 3 seconds before starting to poll

    return () => {
      clearTimeout(startPollingTimeout);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isOpen, isWaiting, handleSuccess]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Manual check for connections (backup button)
  const handleManualCheck = useCallback(async () => {
    try {
      const connections = await listBrokerConnections();
      const currentIds = new Set(connections.map((c: BrokerConnection) => c.id));
      const newConnectionIds = [...currentIds].filter((id) => !initialIdsRef.current.has(id));

      if (newConnectionIds.length > 0) {
        logger.info(`Manual check found new connection(s): ${newConnectionIds.join(", ")}`);
        void handleSuccess(newConnectionIds[0]);
      } else {
        toast.info("No new connections detected yet. Please complete the connection in your browser.");
      }
    } catch (error) {
      toast.error(
        `Failed to check connections: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }, [handleSuccess]);

  // Don't render anything if there's no login link
  if (!themedLoginLink) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Your Broker</DialogTitle>
          <DialogDescription>
            Complete the connection in your browser. This window will update automatically when
            you're done.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-8">
          {isWaiting ? (
            <>
              <div className="relative">
                <Icons.Spinner className="text-primary h-12 w-12 animate-spin" />
              </div>
              <p className="text-muted-foreground mt-4 text-center text-sm">
                Waiting for you to complete the connection in your browser...
              </p>
              {isPolling && (
                <p className="text-muted-foreground mt-1 text-center text-xs">
                  Checking for new connections...
                </p>
              )}
              <p className="text-muted-foreground mt-2 text-center text-xs">
                If the browser didn't open,{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    if (themedLoginLink) {
                      openUrlInBrowser(themedLoginLink);
                    }
                  }}
                >
                  click here to try again
                </button>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-center text-sm">Preparing connection...</p>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {isWaiting && (
            <Button variant="secondary" onClick={handleManualCheck}>
              <Icons.Refresh className="mr-2 h-4 w-4" />
              I've Completed Connection
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
