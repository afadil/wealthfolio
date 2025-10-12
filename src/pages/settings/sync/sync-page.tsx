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
import { cancel, Format, scan } from "@tauri-apps/plugin-barcode-scanner";
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
  Icons,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
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

  type PairingTab = "scan" | "manual";

  const [pairingTab, setPairingTab] = useState<PairingTab>("scan");
  const [pairPayload, setPairPayload] = useState("");
  const [parsedPayload, setParsedPayload] = useState<PairPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncUIStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scanPermission, setScanPermission] = useState<CameraPermissionState>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanInFlight, setIsScanInFlight] = useState(false);

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

  // const startInlineScan = useCallback(async () => {
  //   if (!isPro || !isSyncEnabled) return;
  //   setIsScanningActive(true);
  //   setScanError(null);
  //   setScanPermission("pending");
  //   setSyncStatus("scanning");
  //   try {
  //     const perm = await requestPermissions();
  //     if (perm === "granted") {
  //       setScanPermission("granted");
  //     } else {
  //       setScanPermission("denied");
  //       setSyncStatus("idle");
  //     }
  //   } catch {
  //     setScanPermission("denied");
  //     setSyncStatus("idle");
  //   }
  // }, [isPro, isSyncEnabled]);

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

  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }),
    [],
  );
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    [],
  );

  const formatRelativeTime = useCallback(
    (value?: string | null) => {
      if (!value) return "Never";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Unknown";

      const diffMs = date.getTime() - Date.now();
      const absDiff = Math.abs(diffMs);
      const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ["year", 1000 * 60 * 60 * 24 * 365],
        ["month", 1000 * 60 * 60 * 24 * 30],
        ["week", 1000 * 60 * 60 * 24 * 7],
        ["day", 1000 * 60 * 60 * 24],
        ["hour", 1000 * 60 * 60],
        ["minute", 1000 * 60],
      ];

      for (const [unit, msPerUnit] of units) {
        if (absDiff >= msPerUnit || unit === "minute") {
          const valueForUnit = Math.round(diffMs / msPerUnit);
          return relativeTimeFormatter.format(valueForUnit, unit);
        }
      }

      return "Just now";
    },
    [relativeTimeFormatter],
  );

  const formatAbsoluteTime = useCallback(
    (value?: string | null) => {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return dateTimeFormatter.format(date);
    },
    [dateTimeFormatter],
  );

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
  const onlinePeerCount = useMemo(() => {
    return peers.filter((peer) => {
      if (!peer.last_seen) return false;
      const lastSeen = Date.parse(peer.last_seen);
      if (Number.isNaN(lastSeen)) return false;
      return Date.now() - lastSeen < 1000 * 60 * 3;
    }).length;
  }, [peers]);

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

          <Card className="border-muted/60">
            <CardHeader className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <Icons.QrCode className="h-5 w-5 text-primary" />
                Pair a device
              </CardTitle>
              <CardDescription>
                Share a QR code or paste a pairing token to connect another device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs
                value={pairingTab}
                onValueChange={(value: string) => setPairingTab(value as PairingTab)}
                className="w-full"
              >
                <TabsList className="bg-muted/40 flex w-full items-center justify-start gap-1 rounded-lg p-1 sm:w-auto">
                  <TabsTrigger value="scan" className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium">
                    <Icons.Camera className="h-4 w-4" />
                    Scan & share
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium">
                    <Icons.Type className="h-4 w-4" />
                    Manual pairing
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="scan" className="mt-6 space-y-6">
                  <div className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-6 shadow-sm">
                    <div className="flex flex-col items-center gap-6 text-center">
                      <div className="space-y-2">
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          Share from this device
                        </Badge>
                        <h3 className="text-lg font-semibold">Display pairing QR</h3>
                        <p className="text-muted-foreground text-sm">
                          Let your other device scan this code to connect securely.
                        </p>
                      </div>
                      <div className="rounded-3xl border bg-background p-5 shadow-inner">
                        {qrPayload ? (
                          <QRCode value={qrPayload} size={216} className="h-auto w-52" />
                        ) : (
                          <div className="text-muted-foreground flex h-52 w-52 items-center justify-center text-sm">
                            {isGeneratingQR ? "Generating..." : "QR code unavailable"}
                          </div>
                        )}
                      </div>
                      <div className="flex w-full flex-col gap-3 sm:flex-row">
                        <Button onClick={generateQR} disabled={isGeneratingQR} className="w-full sm:flex-1">
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
                          className="w-full sm:flex-1"
                        >
                          <Icons.Copy className="mr-2 h-4 w-4" />
                          Copy code
                        </Button>
                      </div>
                      <div className="grid gap-3 text-left text-sm text-muted-foreground sm:grid-cols-2">
                        <div className="rounded-lg border border-dashed bg-background/60 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Need a hand?</p>
                          <ul className="mt-2 space-y-1 text-xs">
                            <li>Open Wealthfolio on the device you want to connect.</li>
                            <li>Go to <span className="font-semibold">Settings › Device Sync</span>.</li>
                            <li>Tap <span className="font-semibold">Scan QR code</span> and point the camera here.</li>
                            <li>Sync will start automatically once the scan completes.</li>
                          </ul>
                        </div>
                        <div className="rounded-lg border border-dashed bg-background/60 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">Tip</p>
                          <p className="mt-2 text-xs">
                            QR codes expire after a short time. Regenerate if the other device can’t join.
                          </p>
                          {!isMobile && (
                            <p className="mt-2 text-xs">
                              Pairing another desktop? Copy the code and open the Manual pairing tab on that machine.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="manual" className="mt-6 space-y-4">
                  <div className="rounded-2xl border bg-muted/30 p-6 shadow-sm">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold">Paste a pairing payload</h3>
                        <p className="text-muted-foreground text-sm">
                          Use this when QR scanning isn’t possible or when connecting two desktops.
                        </p>
                      </div>
                      <Textarea
                        value={pairPayload}
                        onChange={(event) => updatePairPayload(event.target.value)}
                        placeholder='{"device_id":"..."}'
                        rows={6}
                        className="font-mono text-xs shadow-sm"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          onClick={doSync}
                          disabled={!parsedPayload || syncStatus === "syncing"}
                          className="min-w-[140px] flex-1 sm:flex-none"
                        >
                          {syncStatus === "syncing" ? (
                            <>
                              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                              Syncing
                            </>
                          ) : (
                            <>
                              <Icons.Refresh className="mr-2 h-4 w-4" />
                              Pair & sync
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={doFullSync}
                          disabled={!parsedPayload || syncStatus === "syncing"}
                          variant="outline"
                          className="min-w-[140px] flex-1 sm:flex-none"
                        >
                          <Icons.Download className="mr-2 h-4 w-4" />
                          Full sync
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updatePairPayload("")}
                          disabled={!pairPayload}
                          className="border border-transparent hover:border-muted"
                        >
                          <Icons.Eraser className="h-4 w-4" />
                        </Button>
                      </div>
                      {parsedPayload ? (
                        <div className="rounded-lg border bg-background/60 p-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full">
                              <Icons.Monitor className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">Ready to connect</p>
                              <p className="text-sm font-semibold text-foreground">
                                {parsedPayload.device_name ?? parsedPayload.device_id}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div>
                              <p className="text-[11px] uppercase text-muted-foreground/80">Primary endpoint</p>
                              <p className="font-mono text-[11px] text-foreground/80 break-all">
                                {parsedPayload.listen_endpoints?.[0] ?? parsedPayload.host ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase text-muted-foreground/80">Fingerprint</p>
                              <p className="font-mono text-[11px] text-foreground/80 break-all">
                                {parsedPayload.fingerprint ?? "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed bg-background/60 p-4 text-xs text-muted-foreground">
                          Paste a valid JSON payload to enable sync actions.
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Paired devices overview */}
          <Card className="border-muted/60">
            <CardHeader className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                <Icons.Smartphone className="h-5 w-5 text-primary" />
                Connected devices
              </CardTitle>
              <CardDescription>
                Monitor every device linked to this profile and trigger manual syncs when needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                <li className="list-none rounded-xl border bg-background/80 p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{status?.device_name ?? "This device"}</span>
                        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                          This device
                        </Badge>
                        <Badge
                          variant={status?.server_running ? "default" : "destructive"}
                          className={status?.server_running ? "bg-emerald-500/10 text-emerald-600" : undefined}
                        >
                          {status?.server_running ? "Sync engine online" : "Server offline"}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        Connected to {peers.length} {peers.length === 1 ? "device" : "devices"} • {onlinePeerCount} online
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {status?.server_running
                          ? "Ready to accept pairing requests."
                          : "Start Wealthfolio on another device to bring it online."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {getSyncStatusBadge()}
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        Auto-sync {isSyncEnabled ? "enabled" : "disabled"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground/80">Device ID</p>
                      <p className="font-mono text-[11px] text-foreground/80 break-all">
                        {status?.device_id ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-muted-foreground/80">Last sync status</p>
                      <p>{syncStatus === "success" ? "Last action completed" : "Ready for manual sync"}</p>
                    </div>
                  </div>
                </li>
                {peers.length > 0 ? (
                  peers.map((peer) => {
                    const sanitizedPeerEndpoints = sanitizeEndpoints(
                      peer.listen_endpoints.length > 0 ? peer.listen_endpoints : [peer.address],
                    );
                    const hasDialableEndpoint = sanitizedPeerEndpoints.length > 0;
                    const lastSeenMs = peer.last_seen ? Date.parse(peer.last_seen) : Number.NaN;
                    const isOnline = Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < 1000 * 60 * 3;
                    const pairingBadgeClasses = peer.paired
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600"
                      : "border-amber-400/50 bg-amber-500/10 text-amber-600";
                    const pairingBadgeLabel = peer.paired ? "Paired" : "Awaiting approval";
                    const connectionBadgeClasses = isOnline
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600"
                      : hasDialableEndpoint
                      ? "border-sky-400/40 bg-sky-500/10 text-sky-600"
                      : "border-muted text-muted-foreground";
                    const connectionBadgeLabel = isOnline
                      ? "Online now"
                      : hasDialableEndpoint
                      ? "Reachable"
                      : "Awaiting device";
                    const primaryEndpoint = sanitizedPeerEndpoints[0] ?? peer.address ?? "—";
                    const fingerprintFull = peer.fingerprint ?? peer.id;
                    const fingerprintLabel =
                      fingerprintFull.length > 8 ? `${fingerprintFull.slice(0, 8)}...` : fingerprintFull;
                    const fingerprintTitle = peer.fingerprint
                      ? `Fingerprint ${peer.fingerprint}`
                      : `Device ID ${peer.id}`;
                    const lastSeenFriendly = formatRelativeTime(peer.last_seen);
                    const lastSyncFriendly = formatRelativeTime(peer.last_sync);
                    const lastSeenExact = formatAbsoluteTime(peer.last_seen);
                    const lastSyncExact = formatAbsoluteTime(peer.last_sync);

                    return (
                      <li
                        key={peer.id}
                        className="list-none rounded-xl border bg-background/80 p-5 shadow-sm transition-colors hover:border-primary/40"
                      >
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-foreground">{peer.name}</span>
                                <Badge variant="outline" className={pairingBadgeClasses}>
                                  {pairingBadgeLabel}
                                </Badge>
                                <Badge variant="outline" className={connectionBadgeClasses}>
                                  {connectionBadgeLabel}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground text-xs">
                                Primary endpoint: <span className="font-mono text-[11px] text-foreground/80 break-all">{primaryEndpoint}</span>
                              </p>
                            </div>
                            <Badge variant="outline" className="font-mono text-[11px]" title={fingerprintTitle}>
                              {fingerprintLabel}
                            </Badge>
                          </div>
                          <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <div>
                              <dt className="text-[11px] uppercase text-muted-foreground/80">Last seen</dt>
                              <dd title={lastSeenExact}>{lastSeenFriendly}</dd>
                            </div>
                            <div>
                              <dt className="text-[11px] uppercase text-muted-foreground/80">Last sync</dt>
                              <dd title={lastSyncExact}>{lastSyncFriendly}</dd>
                            </div>
                          </dl>
                          {!hasDialableEndpoint && (
                            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-600">
                              Ask {peer.name} to open Wealthfolio so we can reconnect.
                            </p>
                          )}
                          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                            {hasDialableEndpoint ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => syncExistingPeer(peer)}
                                  disabled={syncStatus === "syncing"}
                                >
                                  {syncStatus === "syncing" ? (
                                    <>
                                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                                      Syncing
                                    </>
                                  ) : (
                                    <>
                                      <Icons.Refresh className="mr-2 h-4 w-4" />
                                      Sync now
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
                                  Full sync
                                </Button>
                              </div>
                            ) : (
                              <Badge variant="outline" className="border-muted text-muted-foreground">
                                Waiting for device
                              </Badge>
                            )}
                            <p className="text-muted-foreground text-xs sm:text-right">
                              {hasDialableEndpoint
                                ? "We'll queue updates and deliver them when the device responds."
                                : isDesktop
                                ? "Device is offline right now."
                                : "We'll sync automatically once it comes online."}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="list-none rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    <Icons.Smartphone className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                    <p className="text-foreground text-base font-medium">No paired devices yet</p>
                    <p>Use the Pair a device tab to connect your next device.</p>
                  </li>
                )}
              </ul>
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
