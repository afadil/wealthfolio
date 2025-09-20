import { recalculatePortfolio } from "@/commands/portfolio";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { SettingsHeader } from "../header";
// Inline scanner (replaces previous navigation-based scanner page)
import { logger } from "@/adapters";
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
  Input,
  Label,
  Separator,
  useToast,
} from "@wealthfolio/ui";

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
}

interface SyncStatusData {
  device_id: string;
  device_name: string;
  is_master: boolean;
  server_running: boolean;
  master_device?: PeerInfo;
  other_peers: PeerInfo[];
}

type SyncUIStatus = "idle" | "generating" | "scanning" | "syncing" | "success" | "error";

export default function SyncSettingsPage() {
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

  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [pairPayload, setPairPayload] = useState("");
  const [parsedPayload, setParsedPayload] = useState<PairPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncUIStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse payload whenever it changes (moved up for dependency ordering)
  const updatePairPayload = useCallback((newPayload: string) => {
    setPairPayload(newPayload);
    if (newPayload.trim()) {
      try {
        const parsed = JSON.parse(newPayload) as Partial<PairPayload>;
        const hasDevice = typeof parsed.device_id === "string" && parsed.device_id.length > 0;
        const endpoints = Array.isArray(parsed.listen_endpoints) ? parsed.listen_endpoints : [];
        const hasNetwork =
          endpoints.length > 0 ||
          (typeof parsed.host === "string" && parsed.host.trim() !== "" && typeof parsed.port === "number");

        if (hasDevice && hasNetwork) {
          setParsedPayload({
            device_id: parsed.device_id!,
            device_name: parsed.device_name,
            fingerprint: parsed.fingerprint,
            listen_endpoints: endpoints,
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

  // Refresh status (moved up for dependency ordering)
  const refresh = useCallback(async () => {
    try {
      const s = await invoke<SyncStatusData>("get_sync_status");
      setStatus(s);
    } catch (e) {
      console.error("Failed to get sync status:", e);
    }
  }, []);

  // Helper function to handle post-sync actions
  const handlePostSyncSuccess = useCallback(async () => {
    try {
      await queryClient.invalidateQueries();
      await recalculatePortfolio();
      await refresh();
    } catch (error) {
      console.error("Error during post-sync cleanup:", error);
      await refresh();
    }
  }, [queryClient, refresh]);

  // Inline scanning state
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scanPermission, setScanPermission] = useState<"idle" | "pending" | "granted" | "denied">(
    "idle",
  );
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanInFlight, setIsScanInFlight] = useState(false);

  const processScannedContent = useCallback(
    (scannedContent: string) => {
      updatePairPayload(scannedContent);
      try {
        const parsed = JSON.parse(scannedContent);
        if (parsed.host && parsed.port) {
          setSyncStatus("syncing");
          const payload = JSON.stringify({ host: parsed.host, port: parsed.port });
          invoke<string>("sync_with_master", { payload })
            .then(() => {
              setSyncStatus("success");
              toast({
                title: "Sync Successful",
                description: `Connected to ${parsed.host}:${parsed.port}`,
              });
              return handlePostSyncSuccess();
            })
            .catch((e: unknown) => {
              const errorMessage = toErrorMessage(e, "Failed to sync with master device");
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
    [updatePairPayload, toast, handlePostSyncSuccess],
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
  }, [scanPermission, isScanInFlight, processScannedContent]);

  // Run scan when permission granted
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

  // Make root transparent while scanning
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

  // (refresh moved above)

  const handleSetAsMaster = useCallback(async () => {
    try {
      const result = await invoke<string>("set_as_master");
      toast({
        title: "Device Set as Master",
        description: result,
      });
      await refresh();
    } catch (e: unknown) {
      toast({
        title: "Failed to Set as Master",
        description: toErrorMessage(e, "Unknown error"),
        variant: "destructive",
      });
    }
  }, [toast, refresh]);

  const handleRemoveMaster = useCallback(async () => {
    try {
      const result = await invoke<string>("remove_master_device");
      toast({
        title: "Master Device Removed",
        description: result,
      });
      await refresh();
    } catch (e: unknown) {
      toast({
        title: "Failed to Remove Master",
        description: toErrorMessage(e, "Unknown error"),
        variant: "destructive",
      });
    }
  }, [toast, refresh]);

  const generateQR = useCallback(async () => {
    setIsGeneratingQR(true);
    setSyncStatus("generating");
    setError(null);

    try {
      const payload = await invoke<string>("generate_pairing_payload");
      setQrPayload(payload);
      setSyncStatus("idle");
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Failed to generate QR code"));
      setSyncStatus("error");
      toast({
        title: "Generation Failed",
        description: toErrorMessage(e, "Failed to generate QR code"),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingQR(false);
    }
  }, [toast]);

  const handleScanQR = useCallback(async () => {
    startInlineScan();
  }, [startInlineScan]);

  const doSync = useCallback(async () => {
    if (!pairPayload.trim() || !parsedPayload) return;

    setSyncStatus("syncing");
    setError(null);

    try {
      const payload = JSON.stringify({
        host: parsedPayload.host,
        port: parsedPayload.port,
      });

      const result = await invoke<string>("sync_with_master", { payload });
      setSyncStatus("success");
      toast({
        title: "Sync Completed",
        description: result,
      });
      await handlePostSyncSuccess();
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to sync with master device");
      setError(errorMessage);
      setSyncStatus("error");
      toast({
        title: "Sync Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [pairPayload, parsedPayload, toast, refresh]);

  const doFullSync = useCallback(async () => {
    if (!pairPayload.trim() || !parsedPayload) return;

    setSyncStatus("syncing");
    setError(null);

    try {
      const payload = JSON.stringify({
        host: parsedPayload.host,
        port: parsedPayload.port,
      });

      const result = await invoke<string>("force_full_sync_with_master", { payload });
      setSyncStatus("success");
      toast({
        title: "Full Sync Completed",
        description: result,
      });
      await handlePostSyncSuccess();
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to perform full sync with master device");
      setError(errorMessage);
      setSyncStatus("error");
      toast({
        title: "Full Sync Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [pairPayload, parsedPayload, toast, refresh]);

  const initializeSync = useCallback(async () => {
    setSyncStatus("generating");
    setError(null);

    try {
      const result = await invoke<string>("initialize_sync_for_existing_data");
      setSyncStatus("success");
      toast({
        title: "Sync Initialized",
        description: result,
      });
    } catch (e: unknown) {
      const errorMessage = toErrorMessage(e, "Failed to initialize sync");
      setError(errorMessage);
      setSyncStatus("error");
      toast({
        title: "Initialization Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [toast]);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Copied",
          description: "Pairing data copied to clipboard",
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-generate QR when this device is master
  useEffect(() => {
    if (status?.is_master && !qrPayload && !isGeneratingQR) {
      generateQR();
    }
  }, [status?.is_master, qrPayload, isGeneratingQR, generateQR]);

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

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden lg:space-y-6">
      {isScanningActive && (
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
              <h1 className="text-lg font-semibold drop-shadow">Scan QR Code</h1>
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
                        Retry
                      </Button>
                      <Button variant="outline" onClick={cancelInlineScan} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {!scanError && !isScanInFlight && scanPermission === "granted" && (
                  <div className="pointer-events-auto">
                    <Button
                      onClick={retryInlineScan}
                      variant="outline"
                      className="border-white/30 bg-black/40 text-white hover:bg-black/60"
                    >
                      Rescan
                    </Button>
                  </div>
                )}
                <p className="text-[10px] opacity-70">Camera overlay (inline)</p>
              </>
            )}
          </div>
        </div>
      )}
      <div
        className={
          "flex flex-col space-y-2 transition-opacity duration-300 lg:flex-row lg:items-center lg:justify-between lg:space-y-0 " +
          (isScanningActive ? "pointer-events-none opacity-0 select-none" : "opacity-100")
        }
        aria-hidden={isScanningActive}
      >
        <SettingsHeader
          heading="Device Sync"
          text={
            status?.is_master
              ? "This device is set as master. Generate QR codes for mobile devices to connect."
              : "Sync data between devices using QR code pairing or manual connection."
          }
        />
        <div className="flex justify-start lg:justify-end">{getSyncStatusBadge()}</div>
      </div>

      {!isScanningActive && <Separator />}

      {syncStatus === "success" && (
        <AlertFeedback variant="success" title="Sync Complete" className="mb-4">
          Device synchronization completed successfully.
        </AlertFeedback>
      )}

      {error && (
        <AlertFeedback variant="error" title="Sync Error" className="mb-4">
          {error}
        </AlertFeedback>
      )}

      {/* Device Status Card */}
      {!isScanningActive && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col space-y-2 lg:flex-row lg:items-center lg:gap-2 lg:space-y-0">
              <div className="flex items-center gap-2">
                <Icons.Smartphone className="h-5 w-5" />
                <span className="break-all lg:break-normal">
                  {status?.device_name ?? "This Device"}
                </span>
              </div>
              {status?.is_master && <Badge variant="default">Master</Badge>}
            </CardTitle>
            <CardDescription className="break-all">
              Device ID: {status?.device_id ?? "Loading..."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Sync Server</span>
                <Badge variant={status?.server_running ? "default" : "secondary"}>
                  {status?.server_running ? "Running" : "Stopped"}
                </Badge>
              </div>

              <div className="flex flex-col gap-2 lg:flex-row">
                {!status?.is_master ? (
                  <Button
                    onClick={handleSetAsMaster}
                    variant="outline"
                    size="sm"
                    className="w-full transition-transform duration-200 active:scale-95 lg:w-auto"
                  >
                    <Icons.Star className="mr-2 h-4 w-4" />
                    Set as Master
                  </Button>
                ) : (
                  <Button
                    onClick={handleRemoveMaster}
                    variant="outline"
                    size="sm"
                    className="w-full transition-transform duration-200 active:scale-95 lg:w-auto"
                  >
                    <Icons.XCircle className="mr-2 h-4 w-4" />
                    Remove Master Status
                  </Button>
                )}

                <Button
                  onClick={initializeSync}
                  variant="outline"
                  size="sm"
                  disabled={syncStatus === "generating"}
                  className="w-full transition-transform duration-200 active:scale-95 lg:w-auto"
                >
                  <Icons.Settings className="mr-2 h-4 w-4" />
                  Initialize Sync
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Master Device Section - Only show if not master */}
      {!isScanningActive && !status?.is_master && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.Monitor className="h-5 w-5" />
              Master Device Connection
            </CardTitle>
            <CardDescription>Connect to your master device for syncing</CardDescription>
          </CardHeader>
          <CardContent>
            {status?.master_device ? (
              <div className="space-y-4">
                <div className="bg-muted flex items-center justify-between rounded-lg p-3">
                  <div>
                    <p className="font-medium">{status.master_device.name}</p>
                    <p className="text-muted-foreground text-sm">{status.master_device.address}</p>
                    {status.master_device.last_sync && (
                      <p className="text-muted-foreground text-xs">
                        Last sync: {new Date(status.master_device.last_sync).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Badge variant={status.master_device.paired ? "default" : "secondary"}>
                    {status.master_device.paired ? "Paired" : "Unpaired"}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (status?.master_device) {
                        const payload = JSON.stringify({
                          host: status.master_device.address.split(":")[0],
                          port: parseInt(status.master_device.address.split(":")[1]) || 33445,
                        });
                        setPairPayload(payload);
                        updatePairPayload(payload);
                        doSync();
                      }
                    }}
                    disabled={syncStatus === "syncing"}
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
                        Sync Now
                      </>
                    )}
                  </Button>

                  <Button onClick={handleRemoveMaster} variant="outline" size="sm">
                    <Icons.Close className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  No master device paired. Scan a QR code or enter connection details.
                </p>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Button
                    onClick={handleScanQR}
                    variant="outline"
                    disabled={syncStatus === "scanning"}
                    className="w-full transition-transform duration-200 active:scale-95"
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

                  <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full transition-transform duration-200 active:scale-95"
                      >
                        <Icons.Settings className="mr-2 h-4 w-4" />
                        Manual Setup
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 space-y-4">
                      <div className="grid gap-2">
                        <Label htmlFor="host">Host Address</Label>
                        <Input
                          id="host"
                          placeholder="192.168.1.100"
                          value={parsedPayload?.host ?? ""}
                          className="w-full"
                          onChange={(e) => {
                            const newPayload = JSON.stringify({
                              host: e.target.value,
                              port: parsedPayload?.port ?? 33445,
                            });
                            updatePairPayload(newPayload);
                          }}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="port">Port</Label>
                        <Input
                          id="port"
                          type="number"
                          placeholder="33445"
                          value={parsedPayload?.port ?? ""}
                          onChange={(e) => {
                            const newPayload = JSON.stringify({
                              host: parsedPayload?.host ?? "",
                              // Keep logical OR to handle NaN from parseInt
                              port: parseInt(e.target.value) || 33445,
                            });
                            updatePairPayload(newPayload);
                          }}
                        />
                      </div>

                      {parsedPayload && (
                        <div className="flex gap-2">
                          <Button
                            onClick={doSync}
                            disabled={syncStatus === "syncing"}
                            className="flex-1"
                          >
                            {syncStatus === "syncing" ? (
                              <>
                                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <Icons.Wifi className="mr-2 h-4 w-4" />
                                Connect & Sync
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={doFullSync}
                            disabled={syncStatus === "syncing"}
                            variant="outline"
                          >
                            <Icons.Download className="mr-2 h-4 w-4" />
                            Full Sync
                          </Button>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Desktop Master Section - Only show if is master */}
      {!isScanningActive && status?.is_master && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.QrCode className="h-5 w-5" />
              Pair New Device
            </CardTitle>
            <CardDescription>
              Scan the QR code on the mobile device to link it to this device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-center">
                  <div className="rounded-lg border bg-white p-4 shadow-sm">
                    {qrPayload ? (
                      <QRCode value={qrPayload} size={180} className="h-auto max-w-full" />
                    ) : (
                      <div className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Icons.Spinner className="h-4 w-4 animate-spin" />
                        <span>Generating QR...</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 lg:flex-row lg:justify-center lg:gap-2">
                  <Button
                    onClick={generateQR}
                    disabled={isGeneratingQR}
                    className="w-full transition-transform duration-200 active:scale-95 lg:w-auto"
                  >
                    {isGeneratingQR ? (
                      <>
                        <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <Icons.QrCode className="mr-2 h-4 w-4" />
                        Regenerate
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (qrPayload) {
                        copyToClipboard(qrPayload);
                      }
                    }}
                    disabled={!qrPayload}
                    className="w-full transition-transform duration-200 active:scale-95 lg:w-auto"
                  >
                    <Icons.Copy className="mr-2 h-4 w-4" />
                    Copy Data
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connected Devices */}
      {!isScanningActive && status?.other_peers && status.other_peers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.Users className="h-5 w-5" />
              Connected Devices ({status.other_peers.length})
            </CardTitle>
            <CardDescription>Devices that have synced with this master device</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.other_peers.map((peer) => (
                <div
                  key={peer.id}
                  className="bg-muted flex items-center justify-between rounded-lg p-3"
                >
                  <div>
                    <p className="font-medium">{peer.name}</p>
                    <p className="text-muted-foreground text-sm">{peer.address}</p>
                    {peer.last_sync && (
                      <p className="text-muted-foreground text-xs">
                        Last sync: {new Date(peer.last_sync).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={peer.paired ? "default" : "secondary"}>
                      {peer.paired ? "Connected" : "Disconnected"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Implement remove peer functionality
                        console.log("Remove peer:", peer.id);
                      }}
                    >
                      <Icons.Close className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paired Devices - Show all connected and paired devices */}
      {!isScanningActive && status && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.Users className="h-5 w-5" />
              Paired Devices
            </CardTitle>
            <CardDescription>Devices connected to your sync network</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Master Device */}
              {status.master_device && (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icons.Monitor className="text-primary h-5 w-5" />
                      <div>
                        <p className="font-medium">{status.master_device.name}</p>
                        <p className="text-muted-foreground text-sm">
                          {status.master_device.address}
                        </p>
                        {status.master_device.last_sync && (
                          <p className="text-muted-foreground text-xs">
                            Last sync: {new Date(status.master_device.last_sync).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Master</Badge>
                      <Badge variant={status.master_device.paired ? "default" : "secondary"}>
                        {status.master_device.paired ? "Paired" : "Unpaired"}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Connected Devices */}
              {status.other_peers && status.other_peers.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-muted-foreground text-sm font-medium">
                    Client Devices ({status.other_peers.length})
                  </h4>
                  {status.other_peers.map((peer) => (
                    <div key={peer.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icons.Smartphone className="text-muted-foreground h-4 w-4" />
                          <div>
                            <p className="font-medium">{peer.name}</p>
                            <p className="text-muted-foreground text-sm">{peer.address}</p>
                            {peer.last_sync && (
                              <p className="text-muted-foreground text-xs">
                                Last sync: {new Date(peer.last_sync).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={peer.paired ? "default" : "secondary"}>
                            {peer.paired ? "Paired" : "Unpaired"}
                          </Badge>
                          {peer.last_seen && (
                            <Badge variant="outline" className="text-xs">
                              {new Date(peer.last_seen).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No devices paired */}
              {!status.master_device &&
                (!status.other_peers || status.other_peers.length === 0) && (
                  <div className="text-muted-foreground py-8 text-center">
                    <Icons.Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                    <p className="text-sm">No devices paired yet</p>
                    <p className="text-xs">Generate a QR code or scan one to connect devices</p>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
