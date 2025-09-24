import { logger } from "@/adapters";
import { recalculatePortfolio } from "@/commands/portfolio";
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
import { useQueryClient } from "@tanstack/react-query";
import { cancel, Format, requestPermissions, scan } from "@tauri-apps/plugin-barcode-scanner";
import {
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
  const { settings, isLoading: isSettingsLoading } = useSettingsContext();
  const { isMobile } = usePlatform();

  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [pairPayload, setPairPayload] = useState("");
  const [parsedPayload, setParsedPayload] = useState<PairPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncUIStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scanPermission, setScanPermission] = useState<CameraPermissionState>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanInFlight, setIsScanInFlight] = useState(false);

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

  const isPro = Boolean(settings?.isPro);

  const refresh = useCallback(async () => {
    if (!isPro) return;

    try {
      const s = await getSyncStatus();
      setStatus(s);
    } catch (e) {
      console.error("Failed to get sync status:", e);
      setStatus(null);
    }
  }, [isPro]);

  const handlePostSyncSuccess = useCallback(async () => {
    try {
      await queryClient.invalidateQueries();
      await recalculatePortfolio();
      await refresh();
    } catch (err) {
      console.error("Error during post-sync cleanup:", err);
      await refresh();
    }
  }, [queryClient, refresh]);

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
    if (!isPro) return;
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
  }, [isPro]);

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
    if (!isPro) return;
    setIsGeneratingQR(true);
    setSyncStatus("generating");
    setError(null);

    try {
      const payload = await generatePairingPayload();
      setQrPayload(payload);
      setSyncStatus("idle");
    } catch (e: unknown) {
      const message = toErrorMessage(e, "Failed to generate QR code");
      setError(message);
      setSyncStatus("error");
      toast({ title: "Generation Failed", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingQR(false);
    }
  }, [toast, isPro]);

  const doSync = useCallback(async () => {
    if (!isPro || !pairPayload.trim() || !parsedPayload) return;

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
  }, [handlePostSyncSuccess, pairPayload, parsedPayload, toast, isPro]);

  const doFullSync = useCallback(async () => {
    if (!isPro || !pairPayload.trim() || !parsedPayload) return;

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
  }, [handlePostSyncSuccess, pairPayload, parsedPayload, toast, isPro]);

  const syncExistingPeer = useCallback(
    async (peer: PeerInfo) => {
      if (!isPro) return;
      setSyncStatus("syncing");
      setError(null);
      try {
        await syncNow({ peer_id: peer.id });
        setSyncStatus("success");
        toast({ title: "Sync Started", description: `Requested sync with ${peer.name}` });
        await handlePostSyncSuccess();
      } catch (e: unknown) {
        const errorMessage = toErrorMessage(e, "Failed to sync with peer");
        setError(errorMessage);
        setSyncStatus("error");
        toast({ title: "Sync Failed", description: errorMessage, variant: "destructive" });
      }
    },
    [handlePostSyncSuccess, toast, isPro],
  );

  const forceResyncPeer = useCallback(
    async (peer: PeerInfo) => {
      if (!isPro) return;
      setSyncStatus("syncing");
      setError(null);
      try {
        const endpoints = peer.listen_endpoints.length > 0 ? peer.listen_endpoints : [peer.address];
        const sanitized = sanitizeEndpoints(endpoints);
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
        toast({ title: "Full Sync Requested", description: result });
        await handlePostSyncSuccess();
      } catch (e: unknown) {
        const errorMessage = toErrorMessage(e, "Failed to perform full sync with peer");
        setError(errorMessage);
        setSyncStatus("error");
        toast({ title: "Full Sync Failed", description: errorMessage, variant: "destructive" });
      }
    },
    [handlePostSyncSuccess, toast, isPro],
  );

  const initializeSync = useCallback(async () => {
    if (!isPro) return;
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
  }, [toast, isPro]);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied", description: "Pairing data copied to clipboard" });
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isPro || isSettingsLoading) {
      return;
    }
    if (!qrPayload && !isGeneratingQR) {
      generateQR();
    }
  }, [generateQR, isGeneratingQR, qrPayload, isPro, isSettingsLoading]);

  const getSyncStatusBadge = () => {
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
      ) : (
        <>
          {isScanningActive && renderOverlay()}

          <SettingsHeader
            heading="Device Sync"
            text="Sync your portfolio across devices securely."
          />

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
                Scan this QR code on another device to link devices.
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
                <CardDescription>Scan from another device.</CardDescription>
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
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <Card>
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0">
                    <div className="flex items-center gap-2">
                      <Icons.Settings className="h-5 w-5" />
                      <CardTitle>Advanced</CardTitle>
                    </div>
                    <Icons.ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
                <CardDescription className="mt-2">Paste sync codes manually.</CardDescription>
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
                peers.map((peer) => (
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
                      </div>
                    </div>
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
                        onClick={() => forceResyncPeer(peer)}
                        disabled={syncStatus === "syncing"}
                      >
                        <Icons.Download className="mr-2 h-4 w-4" />
                        Full
                      </Button>
                    </div>
                  </div>
                ))
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

          {/* Initialize Sync */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icons.Database className="h-5 w-5" />
                Setup
              </CardTitle>
              <CardDescription>Prepare existing data for sync.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">
                Run once to enable sync on existing data.
              </p>
              <Button
                onClick={initializeSync}
                disabled={syncStatus === "generating"}
                variant="outline"
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
