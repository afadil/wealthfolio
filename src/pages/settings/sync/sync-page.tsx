import { logger } from "@/adapters";
import { recalculatePortfolio } from "@/commands/portfolio";
import { updateSettings } from "@/commands/settings";
import {
  forceFullSyncWithPeer,
  generatePairingPayload,
  getSyncStatus,
  initializeSyncForExistingData,
  pairAndSync,
  syncNow,
  type PeerInfo,
  type SyncStatus as SyncStatusData,
} from "@/commands/sync";
import { usePlatform } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cancel, Format, requestPermissions, scan } from "@tauri-apps/plugin-barcode-scanner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertFeedback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icons,
  Textarea,
  useToast,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { SettingsHeader } from "../header";
import { UpgradeCallout } from "./components/upgrade-callout";

type SyncUIStatus = "idle" | "generating" | "scanning" | "syncing" | "success" | "error";

type CameraPermissionState = "idle" | "pending" | "granted" | "denied";

interface PairPayload {
  device_id: string;
  device_name?: string;
  fingerprint?: string;
  listen_endpoints?: string[];
  host?: string;
  alt?: string[];
  port?: number;
  note?: string;
  ts?: string;
  v?: number;
}

function sanitizeEndpoints(endpoints: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const entry of endpoints) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "") continue;

    const normalized = trimmed.includes("://")
      ? trimmed
      : `quic://${trimmed.replace(/^quic:\/\//i, "")}`;
    const lower = normalized.toLowerCase();
    if (
      lower.includes("://0.0.0.0") ||
      lower.includes("://[::]") ||
      lower.includes("://localhost")
    ) {
      continue;
    }
    if (!seen.has(lower)) {
      seen.add(lower);
      cleaned.push(normalized);
    }
  }

  return cleaned;
}

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

export default function SyncSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings, isLoading: isSettingsLoading, refetch: refetchSettings } = useSettingsContext();
  const { isMobile, isDesktop } = usePlatform();

  const [manualPairingOverride, setManualPairingOverride] = useState(false);
  const [manualPairingOpenState, setManualPairingOpenState] = useState(false);
  const [pairPayload, setPairPayload] = useState("");
  const [parsedPayload, setParsedPayload] = useState<PairPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncUIStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scanPermission, setScanPermission] = useState<CameraPermissionState>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanInFlight, setIsScanInFlight] = useState(false);
  const manualPairingOpen = manualPairingOverride ? manualPairingOpenState : !isMobile;

  const handleManualPairingToggle = useCallback((open: boolean) => {
    setManualPairingOverride(true);
    setManualPairingOpenState(open);
  }, []);

  const isPro = Boolean(settings?.isPro);
  const isSyncEnabled = Boolean(settings?.syncEnabled);
  const [isEnablingSync, setIsEnablingSync] = useState(false);

  const {
    data: statusData,
    refetch: refetchStatus,
    isFetching: isStatusFetching,
  } = useQuery({
    queryKey: ["sync-status"],
    queryFn: getSyncStatus,
    enabled: isPro && isSyncEnabled && !isSettingsLoading,
    staleTime: 10_000,
  });
  const status: SyncStatusData | null = statusData ?? null;

  const {
    data: qrPayload,
    refetch: refetchQr,
    isFetching: isQrFetching,
  } = useQuery({
    queryKey: ["sync-qr"],
    queryFn: async () => {
      if (!isPro || !isSyncEnabled) {
        return null;
      }
      return generatePairingPayload();
    },
    enabled: isPro && isSyncEnabled && !isSettingsLoading,
    refetchOnWindowFocus: false,
  });
  const isGeneratingQR = isQrFetching;
  const isRefreshingStatus = isStatusFetching;

  const updatePairPayload = useCallback((newPayload: string) => {
    setPairPayload(newPayload);
    if (newPayload.trim()) {
      try {
        const parsed = JSON.parse(newPayload) as Partial<PairPayload>;
        const hasDevice = typeof parsed.device_id === "string" && parsed.device_id.length > 0;
        const rawEndpoints = Array.isArray(parsed.listen_endpoints) ? parsed.listen_endpoints : [];
        const sanitizedEndpoints = sanitizeEndpoints(rawEndpoints);
        const hasNetwork =
          sanitizedEndpoints.length > 0 ||
          (typeof parsed.host === "string" &&
            parsed.host.trim() !== "" &&
            typeof parsed.port === "number");

        if (hasDevice && hasNetwork) {
          setParsedPayload({
            device_id: parsed.device_id!,
            device_name: parsed.device_name,
            fingerprint: parsed.fingerprint,
            listen_endpoints: sanitizedEndpoints,
            host: parsed.host,
            alt: Array.isArray(parsed.alt) ? parsed.alt : undefined,
            port: parsed.port,
            note: parsed.note,
            ts: typeof parsed.ts === "string" ? parsed.ts : undefined,
            v: typeof parsed.v === "number" ? parsed.v : undefined,
          });
          setError(null);
        } else {
          setParsedPayload(null);
          setError("Invalid payload: missing device info or endpoints");
        }
      } catch (_e) {
        setParsedPayload(null);
        setError("Invalid JSON format");
      }
    } else {
      setParsedPayload(null);
      setError(null);
    }
  }, []);

  const handlePostSyncSuccess = useCallback(async () => {
    try {
      await queryClient.invalidateQueries();
      await recalculatePortfolio();
      await refetchStatus();
    } catch (err) {
      console.error("Error during post-sync cleanup:", err);
      await refetchStatus();
    }
  }, [queryClient, refetchStatus]);

  const processScannedContent = useCallback(
    (scannedContent: string) => {
      updatePairPayload(scannedContent);
      try {
        const raw: unknown = JSON.parse(scannedContent);
        if (typeof raw !== "object" || raw === null) {
          throw new Error("Invalid pairing data");
        }
        interface PairingDraft {
          device_id?: unknown;
          device_name?: unknown;
          fingerprint?: unknown;
          listen_endpoints?: unknown;
          host?: unknown;
          alt?: unknown;
          port?: unknown;
          note?: unknown;
          ts?: unknown;
          v?: unknown;
        }
        const rec = raw as PairingDraft;
        const deviceId = typeof rec.device_id === "string" ? rec.device_id : "";
        const hasDevice = deviceId.length > 0;
        const rawEndpointsUnknown = Array.isArray(rec.listen_endpoints) ? rec.listen_endpoints : [];
        const rawEndpoints: string[] = rawEndpointsUnknown.filter(
          (v): v is string => typeof v === "string",
        );
        const sanitizedEndpoints = sanitizeEndpoints(rawEndpoints);
        const hasEndpoints =
          sanitizedEndpoints.length > 0 ||
          (typeof rec.host === "string" && rec.host.trim() !== "" && typeof rec.port === "number");

        if (hasDevice && hasEndpoints) {
          setSyncStatus("syncing");
          const payloadObj: PairPayload = {
            device_id: deviceId,
            device_name: typeof rec.device_name === "string" ? rec.device_name : undefined,
            fingerprint: typeof rec.fingerprint === "string" ? rec.fingerprint : undefined,
            listen_endpoints: sanitizedEndpoints,
            host: typeof rec.host === "string" ? rec.host : undefined,
            alt: Array.isArray(rec.alt)
              ? rec.alt.filter((v): v is string => typeof v === "string")
              : undefined,
            port: typeof rec.port === "number" ? rec.port : undefined,
            note: typeof rec.note === "string" ? rec.note : undefined,
            ts: typeof rec.ts === "string" ? rec.ts : undefined,
            v: typeof rec.v === "number" ? rec.v : undefined,
          };
          const payload = JSON.stringify(payloadObj);
          pairAndSync(payload)
            .then(() => {
              setSyncStatus("success");
              toast({
                title: "Sync Successful",
                description: `Connected to ${payloadObj.device_name ?? payloadObj.device_id.slice(0, 8)}`,
              });
              return handlePostSyncSuccess();
            })
            .catch((e: unknown) => {
              const errorMessage = toErrorMessage(e, "Failed to sync with peer");
              setError(errorMessage);
              setSyncStatus("error");
              toast({ title: "Sync Failed", description: errorMessage, variant: "destructive" });
            });
        } else {
          setSyncStatus("idle");
          toast({ title: "QR Scanned", description: "Pairing data captured successfully" });
        }
      } catch (parseError) {
        logger.error("Parse error: " + String(parseError));
        setSyncStatus("idle");
        toast({ title: "QR Scanned", description: "Pairing data captured successfully" });
      }
    },
    [handlePostSyncSuccess, toast, updatePairPayload],
  );

  const startInlineScan = useCallback(async () => {
    if (!isPro || !isSyncEnabled) return;
    setIsScanningActive(true);
    setScanError(null);
    setScanPermission("pending");
    setSyncStatus("scanning");
    try {
      const perm = await requestPermissions();
      if (perm === "granted") {
        setScanPermission("granted");
      } else {
        setScanPermission("denied");
        setSyncStatus("idle");
      }
    } catch {
      setScanPermission("denied");
      setSyncStatus("idle");
    }
  }, [isPro, isSyncEnabled]);

  const performScan = useCallback(async () => {
    if (scanPermission !== "granted" || isScanInFlight) return;
    setIsScanInFlight(true);
    setScanError(null);
    try {
      const result = await scan({ windowed: true, formats: [Format.QRCode] });
      if (result?.content) {
        processScannedContent(result.content.trim());
        setIsScanningActive(false);
      } else {
        setScanError("No QR detected. Align code within frame.");
      }
    } catch (e: unknown) {
      const msg = toErrorMessage(e, "Scan failed");
      if (!msg.includes("cancel")) {
        setScanError(msg);
      }
    } finally {
      setIsScanInFlight(false);
    }
  }, [isScanInFlight, processScannedContent, scanPermission]);

  useEffect(() => {
    if (isScanningActive && scanPermission === "granted") {
      performScan();
    }
  }, [isScanningActive, scanPermission, performScan]);

  const cancelInlineScan = useCallback(() => {
    cancel()
      .catch((err: unknown) => {
        logger.debug("Cancel scan error: " + String(err));
      })
      .finally(() => {
        setIsScanningActive(false);
        setScanPermission("idle");
        setScanError(null);
        if (syncStatus === "scanning") setSyncStatus("idle");
      });
  }, [syncStatus]);

  const retryInlineScan = useCallback(() => {
    setScanError(null);
    performScan();
  }, [performScan]);

  useEffect(() => {
    if (!isScanningActive) return;
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

  const generateQR = useCallback(async () => {
    if (!isPro || !isSyncEnabled) return;
    setSyncStatus("generating");
    setError(null);

    const result = await refetchQr();
    if (result.error) {
      const message = toErrorMessage(result.error, "Failed to generate QR code");
      setError(message);
      setSyncStatus("error");
      toast({ title: "Generation Failed", description: message, variant: "destructive" });
      return;
    }

    setSyncStatus("idle");
  }, [isPro, isSyncEnabled, refetchQr, toast]);

  const doSync = useCallback(async () => {
    if (!isPro || !isSyncEnabled || !pairPayload.trim() || !parsedPayload) return;

    setSyncStatus("syncing");
    setError(null);

    try {
      const payload = JSON.stringify(parsedPayload);
      const result = await pairAndSync(payload);
      setSyncStatus("success");
      toast({ title: "Sync Completed", description: result });
      await handlePostSyncSuccess();
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to sync with peer");
      setError(errorMessage);
      setSyncStatus("error");
      toast({ title: "Sync Failed", description: errorMessage, variant: "destructive" });
    }
  }, [handlePostSyncSuccess, pairPayload, parsedPayload, toast, isPro, isSyncEnabled]);

  const doFullSync = useCallback(async () => {
    if (!isPro || !isSyncEnabled || !pairPayload.trim() || !parsedPayload) return;

    setSyncStatus("syncing");
    setError(null);

    try {
      const payload = JSON.stringify(parsedPayload);
      const result = await forceFullSyncWithPeer(payload);
      setSyncStatus("success");
      toast({ title: "Full Sync Completed", description: result });
      await handlePostSyncSuccess();
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to perform full sync with peer");
      setError(errorMessage);
      setSyncStatus("error");
      toast({ title: "Full Sync Failed", description: errorMessage, variant: "destructive" });
    }
  }, [handlePostSyncSuccess, pairPayload, parsedPayload, toast, isPro, isSyncEnabled]);

  const syncExistingPeer = useCallback(
    async (peer: PeerInfo) => {
      if (!isPro || !isSyncEnabled) return;
      setSyncStatus("syncing");
      setError(null);
      try {
        await syncNow({ peer_id: peer.id });
        setSyncStatus("success");
        toast({
          title: "Sync in progress",
          description: isMobile
            ? `Fetching updates from ${peer.name}.`
            : `We'll sync with ${peer.name} as soon as it comes online.`,
        });
        await handlePostSyncSuccess();
      } catch (e: unknown) {
        const errorMessage = toErrorMessage(e, "Failed to sync with peer");
        setError(errorMessage);
        setSyncStatus("error");
        toast({ title: "Sync Failed", description: errorMessage, variant: "destructive" });
      }
    },
    [handlePostSyncSuccess, isMobile, toast, isPro, isSyncEnabled],
  );

  const forceResyncPeer = useCallback(
    async (peer: PeerInfo, preSanitized?: string[]) => {
      if (!isPro || !isSyncEnabled) return;
      setSyncStatus("syncing");
      setError(null);
      try {
        const sanitized =
          preSanitized ??
          sanitizeEndpoints(
            peer.listen_endpoints.length > 0 ? peer.listen_endpoints : [peer.address],
          );
        if (sanitized.length === 0) {
          throw new Error("Peer does not have any routable endpoints");
        }

        const payload = JSON.stringify({
          device_id: peer.id,
          device_name: peer.name,
          fingerprint: peer.fingerprint,
          listen_endpoints: sanitized,
        });
        const result = await forceFullSyncWithPeer(payload);
        setSyncStatus("success");
        toast({
          title: "Full sync in progress",
          description: isMobile ? result : `${result} We'll finish as soon as the device responds.`,
        });
        await handlePostSyncSuccess();
      } catch (e: unknown) {
        const errorMessage = toErrorMessage(e, "Failed to perform full sync with peer");
        setError(errorMessage);
        setSyncStatus("error");
        toast({ title: "Full Sync Failed", description: errorMessage, variant: "destructive" });
      }
    },
    [handlePostSyncSuccess, isMobile, toast, isPro, isSyncEnabled],
  );

  const initializeSync = useCallback(async () => {
    if (!isPro || !isSyncEnabled) return;
    setSyncStatus("generating");
    setError(null);

    try {
      const result = await initializeSyncForExistingData();
      setSyncStatus("success");
      toast({ title: "Sync Initialized", description: result });
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to initialize sync");
      setError(errorMessage);
      setSyncStatus("error");
      toast({ title: "Initialization Failed", description: errorMessage, variant: "destructive" });
    }
  }, [toast, isPro, isSyncEnabled]);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Pairing code copied",
          description: "Paste it into Manual pairing on the other device.",
        });
      } catch (_e) {
        toast({
          title: "Copy Failed",
          description: "Could not copy to clipboard",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const headerDescription = isMobile
    ? "Scan the desktop QR code or paste a sync code below to connect."
    : "Show the QR code to a phone/tablet or copy the sync code for another desktop.";

  const getSyncStatusBadge = () => {
    if (syncStatus === "idle" && (isGeneratingQR || isRefreshingStatus)) {
      return (
        <Badge variant="secondary" className="animate-pulse">
          Refreshing...
        </Badge>
      );
    }

    switch (syncStatus) {
      case "generating":
        return (
          <Badge variant="secondary" className="animate-pulse">
            Generating...
          </Badge>
        );
      case "scanning":
        return (
          <Badge variant="secondary" className="animate-pulse">
            Scanning...
          </Badge>
        );
      case "syncing":
        return (
          <Badge variant="secondary" className="animate-pulse">
            Syncing...
          </Badge>
        );
      case "success":
        return (
          <Badge variant="default" className="bg-green-500">
            Success
          </Badge>
        );
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Ready</Badge>;
    }
  };

  const peers = status?.peers ?? [];

  const enableSync = useCallback(async () => {
    if (!isPro) return;
    setIsEnablingSync(true);
    try {
      await updateSettings({ syncEnabled: true });
      await refetchSettings();
      toast({
        title: "Sync Enabled",
        description: "Sync has been enabled successfully.",
      });
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to enable sync");
      toast({ title: "Enable Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsEnablingSync(false);
    }
  }, [isPro, refetchSettings, toast]);

  const disableSync = useCallback(async () => {
    if (!isPro || !isSyncEnabled) return;
    setIsEnablingSync(true);
    try {
      await updateSettings({ syncEnabled: false });
      await refetchSettings();
      toast({
        title: "Sync Disabled",
        description: "Sync has been disabled successfully.",
      });
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to disable sync");
      toast({ title: "Disable Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsEnablingSync(false);
    }
  }, [isPro, isSyncEnabled, refetchSettings, toast]);

  const renderOverlay = () => (
    <div
      className="qr-overlay pointer-events-none fixed inset-0 z-50 flex items-center justify-center text-white"
      style={{ background: "transparent" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0.55))",
          pointerEvents: "auto",
        }}
      />
      <div className="pointer-events-auto absolute top-4 left-4">
        <Button
          variant="outline"
          size="sm"
          onClick={cancelInlineScan}
          className="border-white/30 bg-black/40 text-white backdrop-blur hover:bg-black/60"
        >
          <Icons.Close className="h-4 w-4" />
        </Button>
      </div>
      <div className="pointer-events-none flex flex-col items-center gap-5">
        <div className="text-center">
          <h1 className="text-lg font-semibold drop-shadow">Scan Pairing QR</h1>
          {scanPermission === "pending" && (
            <p className="text-xs opacity-80">Requesting camera permission...</p>
          )}
          {scanPermission === "denied" && (
            <p className="text-xs opacity-80">Camera permission denied</p>
          )}
        </div>
        {scanPermission === "granted" && (
          <>
            <div className="pointer-events-none relative h-64 w-64">
              <div className="absolute top-0 left-0 h-8 w-8 border-t-4 border-l-4 border-white" />
              <div className="absolute top-0 right-0 h-8 w-8 border-t-4 border-r-4 border-white" />
              <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-white" />
              <div className="absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 border-white" />
              {isScanInFlight && (
                <div className="absolute inset-0 animate-pulse rounded bg-white/5" />
              )}
            </div>
            {scanError && (
              <div className="pointer-events-auto w-72 space-y-3">
                <AlertFeedback variant="error" title="Scan Error">
                  {scanError}
                </AlertFeedback>
                <div className="flex gap-2">
                  <Button onClick={retryInlineScan} className="flex-1">
                    Try Again
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={cancelInlineScan}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {scanPermission === "denied" && (
          <div className="pointer-events-auto w-72 space-y-3">
            <AlertFeedback variant="error" title="Camera access denied">
              Enable camera access from system settings to scan pairing QR codes, or paste the
              payload manually.
            </AlertFeedback>
            <Button onClick={cancelInlineScan} className="w-full">
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      {isSettingsLoading ? (
        <>
          <SettingsHeader heading="Device Sync" text="Checking your sync setup..." />
          <Card>
            <CardContent className="flex items-center gap-2 p-4 text-sm">
              <Icons.Spinner className="h-4 w-4 animate-spin" />
              Loading settings...
            </CardContent>
          </Card>
        </>
      ) : !isPro ? (
        <>
          <SettingsHeader
            heading="Device Sync"
            text="Sync is only available in Wealthfolio Pro. Upgrade to unlock advanced features."
          />
          <UpgradeCallout />
        </>
      ) : !isSyncEnabled ? (
        <>
          <SettingsHeader
            heading="Device Sync"
            text="Keep your portfolio in sync across all your devices."
          />
          <Card className="border-primary/20 from-primary/5 to-primary/10 bg-gradient-to-br">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                  <Icons.Refresh className="text-primary h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl">Enable Device Sync</CardTitle>
                  <CardDescription className="text-muted-foreground/80 mt-1">
                    Stay synchronized across all your devices
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h4 className="font-medium">Key Features</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <Icons.Check className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      <strong>Real-time sync:</strong> Changes appear instantly on all paired
                      devices
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icons.Check className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      <strong>Secure pairing:</strong> End-to-end encrypted connections between your
                      devices
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icons.Check className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      <strong>Local-first:</strong> Your data stays on your devices, no cloud
                      required
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Icons.Check className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                      <strong>Conflict resolution:</strong> Smart merge keeps your data consistent
                    </span>
                  </li>
                </ul>
              </div>
              <div className="bg-muted/40 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Icons.Info className="text-muted-foreground mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">How it works</p>
                    <p className="text-muted-foreground">
                      After enabling sync, you'll generate a pairing code to connect this device
                      with your other devices. Changes will automatically sync when devices are on
                      the same network or online.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <Button onClick={enableSync} disabled={isEnablingSync} size="lg" className="w-full">
                  {isEnablingSync ? (
                    <>
                      <Icons.Spinner className="mr-2 h-5 w-5 animate-spin" />
                      Enabling...
                    </>
                  ) : (
                    <>
                      <Icons.Refresh className="mr-2 h-5 w-5" />
                      Enable Sync
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {isScanningActive && renderOverlay()}

          <SettingsHeader heading="Device Sync" text={headerDescription} />

          {error && (
            <AlertFeedback variant="error" title="Sync Error">
              {error}
            </AlertFeedback>
          )}

          {/* Share QR Code Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.QrCode className="h-5 w-5" />
                Scan QR code
              </CardTitle>
              <CardDescription>
                {isMobile
                  ? "Show this code on the other screen, then tap Scan below to pair instantly."
                  : "Have a phone or tablet scan this code to link right away."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-6">
                <div className="bg-background rounded-lg border p-4 shadow-inner">
                  {qrPayload ? (
                    <QRCode value={qrPayload} size={200} className="h-auto w-48" />
                  ) : (
                    <div className="text-muted-foreground flex h-48 w-48 items-center justify-center text-sm">
                      {isGeneratingQR ? "Generating..." : "No QR code"}
                    </div>
                  )}
                </div>
                <div className="flex w-full max-w-sm gap-2">
                  <Button onClick={generateQR} disabled={isGeneratingQR} className="flex-1">
                    {isGeneratingQR ? (
                      <>
                        <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Icons.Refresh className="mr-2 h-4 w-4" />
                        New code
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => qrPayload && copyToClipboard(qrPayload)}
                    disabled={!qrPayload}
                    className="flex-1"
                  >
                    <Icons.Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                </div>
                {!isMobile && (
                  <p className="text-muted-foreground text-center text-xs">
                    Pairing another desktop? Click Copy and paste the code into Manual pairing on
                    that machine.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mobile-only QR Scanner */}
          {isMobile && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icons.Camera className="h-5 w-5" />
                  Scan QR code
                </CardTitle>
                <CardDescription>
                  Point your camera at the QR code displayed on the desktop to finish pairing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={startInlineScan}
                  disabled={syncStatus === "scanning"}
                  className="w-full"
                >
                  {syncStatus === "scanning" ? (
                    <>
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Icons.QrCode className="mr-2 h-4 w-4" />
                      Scan QR code
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Advanced Manual Pairing */}
          <Collapsible open={manualPairingOpen} onOpenChange={handleManualPairingToggle}>
            <Card>
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0">
                    <div className="flex items-center gap-2">
                      <Icons.Settings className="h-5 w-5" />
                      <CardTitle>Manual pairing</CardTitle>
                    </div>
                    <Icons.ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CardDescription className="mt-2">
                  Use this when pairing two desktops: copy the code from one device and paste it
                  here.
                </CardDescription>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-4 pt-0">
                  <Textarea
                    value={pairPayload}
                    onChange={(event) => updatePairPayload(event.target.value)}
                    placeholder="Paste sync code here..."
                    rows={6}
                    className="font-mono text-xs"
                  />

                  {parsedPayload && (
                    <div className="bg-muted/40 text-muted-foreground rounded-md border p-3 text-sm">
                      <p>
                        <span className="font-semibold">Device:</span>{" "}
                        {parsedPayload.device_name ?? parsedPayload.device_id}
                      </p>
                      <p>
                        <span className="font-semibold">Address:</span>{" "}
                        {parsedPayload.listen_endpoints?.[0] ?? parsedPayload.host ?? "—"}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={doSync}
                      disabled={!parsedPayload || syncStatus === "syncing"}
                      className="flex-1"
                    >
                      {syncStatus === "syncing" ? (
                        <>
                          <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Icons.Refresh className="mr-2 h-4 w-4" />
                          Sync
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={doFullSync}
                      disabled={!parsedPayload || syncStatus === "syncing"}
                      variant="outline"
                      className="flex-1"
                    >
                      <Icons.Download className="mr-2 h-4 w-4" />
                      Full sync
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPairPayload("");
                        updatePairPayload("");
                      }}
                    >
                      <Icons.Eraser className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Paired Devices - Include current device */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.Smartphone className="h-5 w-5" />
                Devices
              </CardTitle>
              <CardDescription>All your connected devices.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Device */}
              <div className="border-primary/20 bg-primary/5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{status?.device_name ?? "This device"}</span>
                    <Badge variant="outline" className="border-primary/50 text-primary">
                      This device
                    </Badge>
                    <Badge variant={status?.server_running ? "default" : "destructive"}>
                      {status?.server_running ? "Online" : "Offline"}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">{getSyncStatusBadge()}</div>
              </div>

              {/* Other Paired Devices */}
              {peers.length > 0 ? (
                peers.map((peer) => {
                  const sanitizedPeerEndpoints = sanitizeEndpoints(
                    peer.listen_endpoints.length > 0 ? peer.listen_endpoints : [peer.address],
                  );
                  const hasDialableEndpoint = sanitizedPeerEndpoints.length > 0;

                  return (
                    <div
                      key={peer.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{peer.name}</span>
                          <Badge variant={peer.paired ? "default" : "secondary"}>
                            {peer.paired ? "Connected" : "Pending"}
                          </Badge>
                          {!hasDialableEndpoint && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Awaiting device
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground space-y-1 text-sm">
                          <p>
                            Last seen:{" "}
                            {peer.last_seen ? new Date(peer.last_seen).toLocaleString() : "Never"}
                          </p>
                          <p>
                            Last sync:{" "}
                            {peer.last_sync ? new Date(peer.last_sync).toLocaleString() : "Never"}
                          </p>
                          {!hasDialableEndpoint && (
                            <p>Ask {peer.name} to open Wealthfolio to start the sync.</p>
                          )}
                        </div>
                      </div>
                      {hasDialableEndpoint ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => syncExistingPeer(peer)}
                            disabled={syncStatus === "syncing"}
                          >
                            {syncStatus === "syncing" ? (
                              <>
                                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <Icons.Refresh className="mr-2 h-4 w-4" />
                                Sync
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => forceResyncPeer(peer, sanitizedPeerEndpoints)}
                            disabled={syncStatus === "syncing"}
                          >
                            <Icons.Download className="mr-2 h-4 w-4" />
                            Full
                          </Button>
                        </div>
                      ) : (
                        <div className="text-muted-foreground text-sm sm:text-right">
                          {isDesktop
                            ? "Waiting for the device to connect."
                            : "We will sync as soon as this device is online."}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center">
                  <Icons.Smartphone className="text-muted-foreground/50 mx-auto mb-4 h-12 w-12" />
                  <p className="text-muted-foreground text-sm">
                    No other devices yet. Share your QR code to connect.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sync Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.Settings className="h-5 w-5" />
                Sync Management
              </CardTitle>
              <CardDescription>Manage your sync settings and data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Initialize existing data */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Initialize existing data</p>
                  <p className="text-muted-foreground text-sm">
                    Run once to enable sync on existing data.
                  </p>
                </div>
                <Button
                  onClick={initializeSync}
                  disabled={syncStatus === "generating"}
                  variant="outline"
                  className="sm:w-auto"
                >
                  {syncStatus === "generating" ? (
                    <>
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Icons.Database className="mr-2 h-4 w-4" />
                      Setup sync
                    </>
                  )}
                </Button>
              </div>

              {/* Disable sync */}
              <div className="border-t pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Disable sync</p>
                    <p className="text-muted-foreground text-sm">
                      Turn off sync and stop the sync engine.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={isEnablingSync} variant="destructive" className="sm:w-auto">
                        <Icons.Close className="mr-2 h-4 w-4" />
                        Disable sync
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disable Device Sync?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will turn off sync and stop the sync engine. Your data will remain on
                          this device, but changes will no longer sync with your other devices.
                          <br />
                          <br />
                          You can re-enable sync anytime, and your existing paired devices will
                          remain configured.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={disableSync} disabled={isEnablingSync}>
                          {isEnablingSync ? (
                            <>
                              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                              Disabling...
                            </>
                          ) : (
                            "Disable sync"
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
