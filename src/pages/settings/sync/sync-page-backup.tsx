import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { scan, Format, cancel } from '@tauri-apps/plugin-barcode-scanner';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import { SettingsHeader } from '../header';
import { recalculatePortfolio } from '@/commands/portfolio';
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Button,
  Textarea,
  Alert,
  Badge,
  Icons,
  useToast,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label
} from '@wealthfolio/ui';

interface PairPayload {
  host: string;
  port: number;
  alt?: string[];
  ts?: number;
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

type SyncUIStatus = 'idle' | 'generating' | 'scanning' | 'syncing' | 'success' | 'error';

export default function SyncSettingsPage() {
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [pairPayload, setPairPayload] = useState('');
  const [parsedPayload, setParsedPayload] = useState<PairPayload | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncUIStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isScanningRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse payload whenever it changes
  const updatePairPayload = useCallback((newPayload: string) => {
    setPairPayload(newPayload);
    if (newPayload.trim()) {
      try {
        const parsed = JSON.parse(newPayload);
        if (parsed.host && parsed.port) {
          setParsedPayload(parsed);
          setError(null);
        } else {
          setParsedPayload(null);
          setError('Invalid payload: missing host or port');
        }
      } catch (e) {
        setParsedPayload(null);
        setError('Invalid JSON format');
      }
    } else {
      setParsedPayload(null);
      setError(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<SyncStatusData>('get_sync_status');
      setStatus(s);
    } catch (e) {
      console.error('Failed to get sync status:', e);
    }
  }, []);

  const handleSetAsMaster = useCallback(async () => {
    try {
      const result = await invoke<string>('set_as_master');
      toast({
        title: "Device Set as Master",
        description: result,
      });
      await refresh();
    } catch (e: any) {
      toast({
        title: "Failed to Set as Master",
        description: e?.toString() || 'Unknown error',
        variant: "destructive"
      });
    }
  }, [toast, refresh]);

  const handleRemoveMaster = useCallback(async () => {
    try {
      const result = await invoke<string>('remove_master_device');
      toast({
        title: "Master Device Removed",
        description: result,
      });
      await refresh();
    } catch (e: any) {
      toast({
        title: "Failed to Remove Master",
        description: e?.toString() || 'Unknown error',
        variant: "destructive"
      });
    }
  }, [toast, refresh]);

  const generateQR = useCallback(async () => {
    setIsGeneratingQR(true);
    setSyncStatus('generating');
    setError(null);

    try {
      const payload = await invoke<string>('generate_pairing_payload');
      setQrPayload(payload);
      setSyncStatus('idle');

      toast({
        title: "QR Code Generated",
        description: "Ready for mobile device to scan",
      });
    } catch (e: any) {
      setError(e?.toString() || 'Failed to generate QR code');
      setSyncStatus('error');
      toast({
        title: "Generation Failed",
        description: e?.toString() || 'Failed to generate QR code',
        variant: "destructive"
      });
    } finally {
      setIsGeneratingQR(false);
    }
  }, [toast]);

  const handleScanQR = useCallback(async () => {
    if (isScanningRef.current) {
      console.log('Scan already in progress');
      return;
    }

    console.log('Starting QR scan...');
    setSyncStatus('scanning');
    setError(null);
    isScanningRef.current = true;
    
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // Shorter timeout to prevent hanging
      timeoutId = setTimeout(() => {
        console.warn('QR scan timeout');
        if (isScanningRef.current) {
          isScanningRef.current = false;
          setSyncStatus('idle');
          cancel().catch(console.error);
          toast({
            title: "Scan Timeout",
            description: "Please try again",
            variant: "destructive"
          });
        }
      }, 8000);
      
      const scanResult = await scan({ 
        windowed: false,
        formats: [Format.QRCode] 
      });
      
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      console.log('QR scan completed:', scanResult);
      
      if (scanResult?.content) {
        updatePairPayload(scanResult.content);
        
        try {
          const parsed = JSON.parse(scanResult.content);
          if (parsed.host && parsed.port) {
            setSyncStatus('syncing');
            
            const payload = JSON.stringify({
              host: parsed.host,
              port: parsed.port
            });
            
            await invoke<string>('sync_with_master', { payload });
            setSyncStatus('success');
            
            toast({
              title: "Sync Successful",
              description: `Connected to ${parsed.host}:${parsed.port}`,
            });
            
            await refresh();
            await queryClient.invalidateQueries();
          } else {
            setSyncStatus('idle');
            toast({
              title: "QR Scanned",
              description: "Data captured",
            });
          }
        } catch (parseError) {
          console.error('Parse error:', parseError);
          setSyncStatus('idle');
          toast({
            title: "QR Scanned",
            description: "Data captured",
          });
        }
      } else {
        setSyncStatus('idle');
      }
    } catch (e: any) {
      console.error('QR scan error:', e);
      
      if (!e.toString().includes('cancelled') && !e.toString().includes('canceled')) {
        const errorMessage = e?.toString() || 'Failed to scan QR code';
        setError(errorMessage);
        setSyncStatus('error');
        toast({
          title: "Scan Failed",
          description: errorMessage,
          variant: "destructive"
        });
      } else {
        setSyncStatus('idle');
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      isScanningRef.current = false;
      console.log('QR scan cleanup completed');
    }
  }, [toast, updatePairPayload, refresh, queryClient]);

  const handleCancelScan = useCallback(async () => {
    console.log('Cancel scan requested');
    
    if (isScanningRef.current) {
      isScanningRef.current = false;
      setSyncStatus('idle');
      
      try {
        await cancel();
        toast({
          title: "Scan Cancelled",
          description: "Camera scan cancelled",
        });
      } catch (e) {
        console.error('Error cancelling scan:', e);
        toast({
          title: "Scan Cancelled",
          description: "Camera scan cancelled",
        });
      }
    } else {
      setSyncStatus('idle');
    }
  }, [toast]);

  // Helper function to handle post-sync actions
  const handlePostSyncSuccess = useCallback(async () => {
    try {
      await queryClient.invalidateQueries();
      await recalculatePortfolio();
      await refresh();
    } catch (error) {
      console.error('Error during post-sync cleanup:', error);
      await refresh();
    }
  }, [queryClient, refresh]);

  const doSync = useCallback(async () => {
    if (!pairPayload.trim() || !parsedPayload) return;
    
    setSyncStatus('syncing');
    setError(null);
    
    try {
      const payload = JSON.stringify({
        host: parsedPayload.host,
        port: parsedPayload.port
      });
      
      const result = await invoke<string>('sync_with_master', { payload });
      setSyncStatus('success');
      toast({
        title: "Sync Completed",
        description: result,
      });
      await handlePostSyncSuccess();
    } catch (e: any) { 
      const errorMessage = e?.toString() || 'Failed to sync with master device';
      setError(errorMessage);
      setSyncStatus('error');
      toast({
        title: "Sync Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [pairPayload, parsedPayload, toast, handlePostSyncSuccess]);

  const doFullSync = useCallback(async () => {
    if (!pairPayload.trim() || !parsedPayload) return;
    
    setSyncStatus('syncing');
    setError(null);
    
    try {
      const payload = JSON.stringify({
        host: parsedPayload.host,
        port: parsedPayload.port
      });
      
      const result = await invoke<string>('force_full_sync_with_master', { payload });
      setSyncStatus('success');
      toast({
        title: "Full Sync Completed",
        description: result,
      });
      await handlePostSyncSuccess();
    } catch (e: any) { 
      const errorMessage = e?.toString() || 'Failed to perform full sync with master device';
      setError(errorMessage);
      setSyncStatus('error');
      toast({
        title: "Full Sync Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [pairPayload, parsedPayload, toast, handlePostSyncSuccess]);

  const initializeSync = useCallback(async () => {
    setSyncStatus('generating');
    setError(null);
    
    try {
      const result = await invoke<string>('initialize_sync_for_existing_data');
      setSyncStatus('success');
      toast({
        title: "Sync Initialized",
        description: result,
      });
    } catch (e: any) {
      const errorMessage = e?.toString() || 'Failed to initialize sync';
      setError(errorMessage);
      setSyncStatus('error');
      toast({
        title: "Initialization Failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [toast]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "Pairing data copied to clipboard",
      });
    } catch (e) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard",
        variant: "destructive"
      });
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cleanup effect to ensure camera resources are released on unmount
  useEffect(() => {
    return () => {
      if (isScanningRef.current) {
        try {
          cancel();
          console.log('Cancelled barcode scan on component unmount');
        } catch (e) {
          console.error('Error cancelling barcode scan:', e);
        }
      }
    };
  }, []);

  const getSyncStatusBadge = () => {
    switch (syncStatus) {
      case 'generating':
        return <Badge variant="secondary" className="animate-pulse">Generating...</Badge>;
      case 'scanning':
        return <Badge variant="secondary" className="animate-pulse">Scanning...</Badge>;
      case 'syncing':
        return <Badge variant="secondary" className="animate-pulse">Syncing...</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-500">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Ready</Badge>;
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 lg:space-y-6">
      <div className="flex flex-col space-y-2 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
        <SettingsHeader 
          heading="Device Sync" 
          text={status?.is_master 
            ? "This device is set as master. Generate QR codes for mobile devices to connect." 
            : "Sync data between devices using QR code pairing or manual connection."
          } 
        />
        <div className="flex justify-start lg:justify-end">
          {getSyncStatusBadge()}
        </div>
      </div>
      
      <Separator />

      {error && (
        <Alert variant="destructive">
          <Icons.AlertCircle className="h-4 w-4" />
          <div>
            <h4 className="font-medium">Error</h4>
            <p className="text-sm">{error}</p>
          </div>
        </Alert>
      )}

      {/* Device Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-col space-y-2 lg:flex-row lg:items-center lg:gap-2 lg:space-y-0">
            <div className="flex items-center gap-2">
              <Icons.Smartphone className="h-5 w-5" />
              <span className="break-all lg:break-normal">{status?.device_name || 'This Device'}</span>
            </div>
            {status?.is_master && <Badge variant="default">Master</Badge>}
          </CardTitle>
          <CardDescription className="break-all">
            Device ID: {status?.device_id || 'Loading...'}
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
                  className="w-full lg:w-auto active:scale-95 transition-transform duration-200"
                >
                  <Icons.Star className="mr-2 h-4 w-4" />
                  Set as Master
                </Button>
              ) : (
                <Button 
                  onClick={handleRemoveMaster} 
                  variant="outline" 
                  size="sm"
                  className="w-full lg:w-auto active:scale-95 transition-transform duration-200"
                >
                  <Icons.XCircle className="mr-2 h-4 w-4" />
                  Remove Master Status
                </Button>
              )}
              
              <Button 
                onClick={initializeSync} 
                variant="outline" 
                size="sm" 
                disabled={syncStatus === 'generating'}
                className="w-full lg:w-auto active:scale-95 transition-transform duration-200"
              >
                <Icons.Settings className="mr-2 h-4 w-4" />
                Initialize Sync
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Master Device Section - Only show if not master */}
      {!status?.is_master && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.Monitor className="h-5 w-5" />
              Master Device Connection
            </CardTitle>
            <CardDescription>
              Connect to your master device for syncing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status?.master_device ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{status.master_device.name}</p>
                    <p className="text-sm text-muted-foreground">{status.master_device.address}</p>
                    {status.master_device.last_sync && (
                      <p className="text-xs text-muted-foreground">
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
                          host: status.master_device.address.split(':')[0],
                          port: parseInt(status.master_device.address.split(':')[1]) || 33445
                        });
                        setPairPayload(payload);
                        updatePairPayload(payload);
                        doSync();
                      }
                    }}
                    disabled={syncStatus === 'syncing'}
                    className="flex-1 active:scale-95 transition-transform duration-200"
                  >
                    {syncStatus === 'syncing' ? (
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
                    onClick={handleRemoveMaster}
                    variant="outline"
                    size="sm"
                    className="active:scale-95 transition-transform duration-200"
                  >
                    <Icons.Close className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  No master device paired. Scan a QR code or enter connection details.
                </p>
                
                <div className="grid gap-4 lg:grid-cols-2">
                  {syncStatus === 'scanning' ? (
                    <div className="space-y-2">
                      <Button
                        onClick={handleCancelScan}
                        variant="destructive"
                        className="w-full active:scale-95 transition-transform duration-200"
                      >
                        <Icons.Close className="mr-2 h-4 w-4" />
                        Cancel Scan
                      </Button>
                      <p className="text-xs text-center text-muted-foreground">
                        Camera active - Point at QR code or cancel
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={handleScanQR}
                      variant="outline"
                      className="w-full active:scale-95 transition-transform duration-200"
                    >
                      <Icons.QrCode className="mr-2 h-4 w-4" />
                      Scan QR Code
                    </Button>
                  )}
                  
                  <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full active:scale-95 transition-transform duration-200"
                      >
                        <Icons.Settings className="mr-2 h-4 w-4" />
                        Manual Setup
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 mt-4">
                      <div className="grid gap-2">
                        <Label htmlFor="host">Host Address</Label>
                        <Input
                          id="host"
                          placeholder="192.168.1.100"
                          value={parsedPayload?.host || ''}
                          className="w-full"
                          onChange={(e) => {
                            const newPayload = JSON.stringify({
                              host: e.target.value,
                              port: parsedPayload?.port || 33445
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
                          value={parsedPayload?.port || ''}
                          onChange={(e) => {
                            const newPayload = JSON.stringify({
                              host: parsedPayload?.host || '',
                              port: parseInt(e.target.value) || 33445
                            });
                            updatePairPayload(newPayload);
                          }}
                        />
                      </div>
                      
                      {parsedPayload && (
                        <div className="flex gap-2">
                          <Button
                            onClick={doSync}
                            disabled={!parsedPayload.host || !parsedPayload.port || syncStatus === 'syncing'}
                            className="flex-1"
                          >
                            {syncStatus === 'syncing' ? 'Syncing...' : 'Connect'}
                          </Button>
                          <Button
                            onClick={doFullSync}
                            variant="outline"
                            disabled={!parsedPayload.host || !parsedPayload.port || syncStatus === 'syncing'}
                          >
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
      {status?.is_master && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.QrCode className="h-5 w-5" />
              Pair New Device
            </CardTitle>
            <CardDescription>
              Generate a QR code for mobile devices to scan and connect
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button 
                onClick={generateQR} 
                disabled={isGeneratingQR}
                className="w-full active:scale-95 transition-transform duration-200"
              >
                {isGeneratingQR ? (
                  <>
                    <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Icons.QrCode className="mr-2 h-4 w-4" />
                    Generate Pairing QR
                  </>
                )}
              </Button>
              
              {qrPayload && (
                <div className="space-y-3">
                  <div className="flex justify-center">
                    <div className="p-4 bg-white rounded-lg shadow-sm border">
                      <QRCode value={qrPayload} size={180} className="max-w-full h-auto" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 lg:flex-row lg:gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(qrPayload)}
                      className="flex-1 active:scale-95 transition-transform duration-200"
                    >
                      <Icons.Copy className="mr-2 h-3 w-3" />
                      Copy Data
                    </Button>
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="w-full lg:w-auto active:scale-95 transition-transform duration-200"
                        >
                          <Icons.Eye className="mr-2 h-3 w-3" />
                          View Data
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <Textarea
                          value={qrPayload}
                          readOnly
                          className="mt-2 text-xs font-mono max-w-full"
                          rows={4}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connected Devices */}
      {status?.other_peers && status.other_peers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icons.Users className="h-5 w-5" />
              Connected Devices ({status.other_peers.length})
            </CardTitle>
            <CardDescription>
              Devices that have synced with this master device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.other_peers.map((peer) => (
                <div key={peer.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{peer.name}</p>
                    <p className="text-sm text-muted-foreground">{peer.address}</p>
                    {peer.last_sync && (
                      <p className="text-xs text-muted-foreground">
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
                        console.log('Remove peer:', peer.id);
                      }}
                      className="active:scale-95 transition-transform duration-200"
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
    </div>
  );
}
