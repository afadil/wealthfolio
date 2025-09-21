import { logger } from "@/adapters";
import { recalculatePortfolio } from "@/commands/portfolio";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
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
  Icons,
  Textarea,
  useToast,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { SettingsHeader } from "../header";

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

interface PeerInfo {
  id: string;
  name: string;
  address: string;
  paired: boolean;
  last_seen?: string;
  last_sync?: string;
  fingerprint: string;
  listen_endpoints: string[];
}

interface SyncStatusData {
  device_id: string;
  device_name: string;
  server_running: boolean;
  peers: PeerInfo[];
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

  const [status, setStatus] = useState<SyncStatusData | null>(null);
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

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<SyncStatusData>("get_sync_status");
      setStatus(s);
    } catch (e) {
      console.error("Failed to get sync status:", e);
    }
  }, []);

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
        const parsed = JSON.parse(scannedContent);
        const hasDevice = typeof parsed.device_id === "string" && parsed.device_id.length > 0;
        const rawEndpoints = Array.isArray(parsed.listen_endpoints) ? parsed.listen_endpoints : [];
        const sanitizedEndpoints = sanitizeEndpoints(rawEndpoints);
        const hasEndpoints =
          sanitizedEndpoints.length > 0 ||
          (typeof parsed.host === "string" &&
            parsed.host.trim() !== "" &&
            typeof parsed.port === "number");

        if (hasDevice && hasEndpoints) {
          setSyncStatus("syncing");
          const payload = JSON.stringify({
            ...parsed,
            listen_endpoints: sanitizedEndpoints,
          });
          invoke<string>("sync_with_peer", { payload })
            .then(() => {
              setSyncStatus("success");
              toast({
                title: "Sync Successful",
                description: `Connected to ${parsed.device_name ?? parsed.device_id.slice(0, 8)}`,
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
  }, []);

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
      .catch(() => {})
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
    setIsGeneratingQR(true);
    setSyncStatus("generating");
    setError(null);

    try {
      const payload = await invoke<string>("generate_pairing_payload");
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
  }, [toast]);

  const doSync = useCallback(async () => {
    if (!pairPayload.trim() || !parsedPayload) return;

    setSyncStatus("syncing");
    setError(null);

    try {
      const payload = JSON.stringify(parsedPayload);
      const result = await invoke<string>("sync_with_peer", { payload });
      setSyncStatus("success");
      toast({ title: "Sync Completed", description: result });
      await handlePostSyncSuccess();
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to sync with peer");
      setError(errorMessage);
      setSyncStatus("error");
      toast({ title: "Sync Failed", description: errorMessage, variant: "destructive" });
    }
  }, [handlePostSyncSuccess, pairPayload, parsedPayload, toast]);

  const doFullSync = useCallback(async () => {
    if (!pairPayload.trim() || !parsedPayload) return;

    setSyncStatus("syncing");
    setError(null);

    try {
      const payload = JSON.stringify(parsedPayload);
      const result = await invoke<string>("force_full_sync_with_peer", { payload });
      setSyncStatus("success");
      toast({ title: "Full Sync Completed", description: result });
      await handlePostSyncSuccess();
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to perform full sync with peer");
      setError(errorMessage);
      setSyncStatus("error");
      toast({ title: "Full Sync Failed", description: errorMessage, variant: "destructive" });
    }
  }, [handlePostSyncSuccess, pairPayload, parsedPayload, toast]);

  const syncExistingPeer = useCallback(
    async (peer: PeerInfo) => {
      setSyncStatus("syncing");
      setError(null);
      try {
        await invoke("sync_now", { payload: { peer_id: peer.id } });
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
    [handlePostSyncSuccess, toast],
  );

  const forceResyncPeer = useCallback(
    async (peer: PeerInfo) => {
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
        const result = await invoke<string>("force_full_sync_with_peer", { payload });
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
    [handlePostSyncSuccess, toast],
  );

  const initializeSync = useCallback(async () => {
    setSyncStatus("generating");
    setError(null);

    try {
      const result = await invoke<string>("initialize_sync_for_existing_data");
      setSyncStatus("success");
      toast({ title: "Sync Initialized", description: result });
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to initialize sync");
      setError(errorMessage);
      setSyncStatus("error");
      toast({ title: "Initialization Failed", description: errorMessage, variant: "destructive" });
    }
  }, [toast]);

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
    if (!qrPayload && !isGeneratingQR) {
      generateQR();
    }
  }, [generateQR, isGeneratingQR, qrPayload]);

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
    <div className="w-full max-w-full space-y-4 overflow-x-hidden lg:space-y-6">
      {isScanningActive && renderOverlay()}

      <SettingsHeader
        heading="Peer Sync"
        text="Share pairing information and connect your devices without a primary/secondary distinction."
      />

      <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="text-muted-foreground text-sm">This device</p>
          <p className="text-lg font-semibold">{status?.device_name ?? "Unknown device"}</p>
          <p className="text-muted-foreground text-xs break-all">{status?.device_id ?? ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={status?.server_running ? "default" : "destructive"}>
            {status?.server_running ? "Listener running" : "Listener stopped"}
          </Badge>
          {getSyncStatusBadge()}
        </div>
      </div>

      {error && (
        <AlertFeedback variant="error" title="Sync Issue">
          {error}
        </AlertFeedback>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.QrCode className="h-5 w-5" />
              Share Pairing Code
            </CardTitle>
            <CardDescription>
              Generate a QR code or copy the payload so another device can connect to this one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="bg-background rounded-lg border p-4 shadow-inner">
                {qrPayload ? (
                  <QRCode value={qrPayload} size={180} className="h-auto w-36 sm:w-48" />
                ) : (
                  <div className="text-muted-foreground flex h-36 w-36 items-center justify-center text-sm sm:h-48 sm:w-48">
                    QR unavailable
                  </div>
                )}
              </div>
              <div className="flex w-full flex-col gap-2">
                <Button
                  onClick={generateQR}
                  disabled={isGeneratingQR}
                  className="transition-transform active:scale-95"
                >
                  {isGeneratingQR ? (
                    <>
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Icons.Refresh className="mr-2 h-4 w-4" />
                      Regenerate QR
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => qrPayload && copyToClipboard(qrPayload)}
                  disabled={!qrPayload}
                  className="transition-transform active:scale-95"
                >
                  <Icons.Copy className="mr-2 h-4 w-4" />
                  Copy Payload
                </Button>
              </div>
            </div>
            {qrPayload && (
              <div className="bg-muted/40 text-muted-foreground rounded-md border p-3 font-mono text-xs leading-relaxed">
                {qrPayload}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.Link className="h-5 w-5" />
              Connect to a Peer
            </CardTitle>
            <CardDescription>
              Scan or paste a pairing payload shared by another device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={startInlineScan}
                variant="outline"
                disabled={syncStatus === "scanning"}
                className="transition-transform active:scale-95"
              >
                {syncStatus === "scanning" ? (
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
              <Button
                variant="ghost"
                onClick={() => {
                  setPairPayload("");
                  updatePairPayload("");
                }}
              >
                <Icons.Eraser className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>

            <Textarea
              value={pairPayload}
              onChange={(event) => updatePairPayload(event.target.value)}
              placeholder="Paste or scan the pairing payload JSON here"
              rows={10}
            />

            {parsedPayload ? (
              <div className="bg-muted/40 text-muted-foreground rounded-md border p-3 text-sm">
                <p>
                  <span className="font-semibold">Device:</span>{" "}
                  {parsedPayload.device_name ?? parsedPayload.device_id}
                </p>
                <p>
                  <span className="font-semibold">Primary endpoint:</span>{" "}
                  {parsedPayload.listen_endpoints?.[0] ?? parsedPayload.host ?? "—"}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Provide a complete payload with a device id and at least one endpoint
                (listen_endpoints or host/port).
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={doSync} disabled={!parsedPayload || syncStatus === "syncing"}>
                {syncStatus === "syncing" ? (
                  <>
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Icons.Spinner className="mr-2 h-4 w-4" />
                    Sync Now
                  </>
                )}
              </Button>
              <Button
                onClick={doFullSync}
                disabled={!parsedPayload || syncStatus === "syncing"}
                variant="outline"
              >
                <Icons.Download className="mr-2 h-4 w-4" />
                Force Full Sync
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icons.Database className="h-5 w-5" />
            Prepare Existing Data
          </CardTitle>
          <CardDescription>
            Stamp current records with sync metadata before pairing this device with others.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Only needed the first time you enable sync on an existing database.
          </p>
          <Button onClick={initializeSync} disabled={syncStatus === "generating"}>
            {syncStatus === "generating" ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4" />
                Initialize Metadata
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icons.Users className="h-5 w-5" />
            Paired Devices
          </CardTitle>
          <CardDescription>Peers that have exchanged data with this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {peers.length ? (
            peers.map((peer) => (
              <div
                key={peer.id}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{peer.name}</span>
                    <Badge variant={peer.paired ? "default" : "secondary"}>
                      {peer.paired ? "Paired" : "Pending"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm break-all">
                    {peer.listen_endpoints[0] ?? peer.address}
                  </p>
                  <div className="text-muted-foreground space-y-1 text-xs">
                    <p>
                      Last seen: {peer.last_seen ? new Date(peer.last_seen).toLocaleString() : "—"}
                    </p>
                    <p>
                      Last sync: {peer.last_sync ? new Date(peer.last_sync).toLocaleString() : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
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
                        Sync Now
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
                    Force Full Sync
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">No peers paired yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
