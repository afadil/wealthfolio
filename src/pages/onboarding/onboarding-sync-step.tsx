import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { scan, cancel, requestPermissions, Format } from "@tauri-apps/plugin-barcode-scanner";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, Icons, AlertFeedback } from "@wealthfolio/ui";
import { recalculatePortfolio } from "@/commands/portfolio";
import { logger } from "@/adapters";

interface OnboardingSyncStepProps {
  onSuccess: () => void;
  onBack: () => void;
}

export function OnboardingSyncStep({ onSuccess, onBack }: OnboardingSyncStepProps) {
  function toErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err.trim() === "" ? fallback : err;
    if (
      typeof err === "number" ||
      typeof err === "boolean" ||
      typeof err === "bigint" ||
      typeof err === "symbol"
    ) {
      return String(err);
    }
    return fallback;
  }

  const [status, setStatus] = useState<"idle" | "scanning">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scanPermission, setScanPermission] = useState<"idle" | "pending" | "granted" | "denied">(
    "idle",
  );
  const [isScanInFlight, setIsScanInFlight] = useState(false);
  const queryClient = useQueryClient();

  // Keep the camera preview visible by making the app background transparent
  useEffect(() => {
    if (!isScanningActive) {
      return;
    }
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevHtmlColor = html.style.backgroundColor;
    const prevBodyColor = body.style.backgroundColor;
    html.style.background = "transparent";
    body.style.background = "transparent";
    html.style.backgroundColor = "transparent";
    body.style.backgroundColor = "transparent";
    body.classList.add("qr-scan-active");
    return () => {
      body.classList.remove("qr-scan-active");
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      html.style.backgroundColor = prevHtmlColor;
      body.style.backgroundColor = prevBodyColor;
    };
  }, [isScanningActive]);

  const processScannedContent = useCallback(
    async (content: string) => {
      try {
        const parsed = JSON.parse(content);
        if (parsed.host && parsed.port) {
          // Preflight: trigger Local Network permission before actual sync
          try {
            await invoke("probe_local_network_access", { host: parsed.host, port: parsed.port });
          } catch (_) {}
          const payload = JSON.stringify({ host: parsed.host, port: parsed.port });
          await invoke("sync_with_master", { payload });
          await queryClient.invalidateQueries();
          await recalculatePortfolio();
          onSuccess();
          return;
        }
        setError("Invalid QR code payload");
      } catch (e: unknown) {
        logger.error("QR parse error: " + (e instanceof Error ? e.message : String(e)));
        setError("Invalid QR code");
      }
    },
    [onSuccess, queryClient],
  );

  const performScan = useCallback(async () => {
    if (scanPermission !== "granted" || isScanInFlight) {
      return;
    }
    setIsScanInFlight(true);
    setError(null);
    try {
      const result = await scan({ windowed: true, formats: [Format.QRCode] });
      const content = result?.content?.trim();
      if (content) {
        await processScannedContent(content);
        setIsScanningActive(false);
      } else {
        setError("No QR detected. Align code within frame.");
      }
    } catch (e: unknown) {
      const msg = toErrorMessage(e, "Scan failed");
      if (!msg.toLowerCase().includes("cancel")) {
        // Normalize unsupported into a friendly message
        if (msg.toLowerCase().includes("unsupported")) {
          setError(
            "QR scanning is unavailable in this environment. Please use the Settings → Sync page or a supported mobile build.",
          );
        } else {
          setError(msg);
        }
      }
    } finally {
      setIsScanInFlight(false);
      setStatus("idle");
    }
  }, [scanPermission, isScanInFlight, processScannedContent]);

  // Auto-run scan after permission granted
  useEffect(() => {
    if (isScanningActive && scanPermission === "granted") {
      void performScan();
    }
  }, [isScanningActive, scanPermission, performScan]);

  const startInlineScan = useCallback(async () => {
    setIsScanningActive(true);
    setStatus("scanning");
    setError(null);
    try {
      const perm = await requestPermissions();
      if (perm === "granted") {
        setScanPermission("granted");
      } else {
        setScanPermission("denied");
        setStatus("idle");
        setIsScanningActive(false);
        setError("Camera permission denied");
      }
    } catch (_e) {
      setScanPermission("denied");
      setStatus("idle");
      setIsScanningActive(false);
      setError("Failed to request camera permission");
    }
  }, []);

  const cancelInlineScan = useCallback(() => {
    cancel()
      .catch(() => {})
      .finally(() => {
        setIsScanningActive(false);
        setScanPermission("idle");
        setStatus("idle");
      });
  }, []);

  return (
    <div className="space-y-4 px-4 md:px-12 lg:px-16 xl:px-20">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Sync with Desktop</h1>
      <p className="text-muted-foreground pb-4 text-sm md:pb-6 md:text-base">
        Scan the QR code displayed on your desktop Wealthfolio instance.
      </p>
      <Card className="border-none shadow-none">
        <CardContent className="flex flex-col items-center gap-4 p-4 md:p-8">
          {error && (
            <AlertFeedback variant="error" title="Scan Error">
              {error}
            </AlertFeedback>
          )}
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              onClick={startInlineScan}
              disabled={status === "scanning"}
              className="flex-1 sm:flex-none"
            >
              {status === "scanning" ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Icons.QrCode className="mr-2 h-4 w-4" />
                  Scan QR Code
                </>
              )}
            </Button>
            {isScanningActive && (
              <Button onClick={cancelInlineScan} variant="outline">
                <Icons.Close className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={onBack} className="w-full sm:w-auto">
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default OnboardingSyncStep;
