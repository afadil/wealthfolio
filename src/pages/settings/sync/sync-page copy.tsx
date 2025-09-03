// import { useState, useCallback } from 'react';
// import { invoke } from '@tauri-apps/api/core';
// import { scan, Format } from '@tauri-apps/plugin-barcode-scanner';
// import QRCode from 'react-qr-code';
// import { SettingsHeader } from '../header';
// import { 
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
//   Separator,
//   Button,
//   Textarea,
//   Alert,
//   Badge,
//   Icons,
//   useToast,
//   Collapsible,
//   CollapsibleContent,
//   CollapsibleTrigger,
//   Input,
//   Label
// } from '@wealthfolio/ui';

// interface PairPayload {
//   host: string;
//   port: number;
//   alt?: string[];
//   ts?: number;
// }

// interface PeerInfo {
//   id: string;
//   name: string;
//   address: string;
//   paired: boolean;
//   last_seen?: string;
//   last_sync?: string;
// }

// interface SyncStatusData {
//   device_id: string;
//   device_name: string;
//   is_master: boolean;
//   server_running: boolean;
//   master_device?: PeerInfo;
//   other_peers: PeerInfo[];
// }

// type SyncUIStatus = 'idle' | 'generating' | 'scanning' | 'syncing' | 'success' | 'error';

// export default function SyncSettingsPage() {
//   const [status, setStatus] = useState<SyncStatusData | null>(null);
//   const [qrPayload, setQrPayload] = useState<string | null>(null);
//   const [pairPayload, setPairPayload] = useState('');
//   const [parsedPayload, setParsedPayload] = useState<PairPayload | null>(null);
//   const [syncStatus, setSyncStatus] = useState<SyncUIStatus>('idle');
//   const [error, setError] = useState<string | null>(null);
//   const [isGeneratingQR, setIsGeneratingQR] = useState(false);
//   const [showAdvanced, setShowAdvanced] = useState(false);
//   const { toast } = useToast();

//   // Parse payload whenever it changes
//   const updatePairPayload = useCallback((newPayload: string) => {
//     setPairPayload(newPayload);
//     if (newPayload.trim()) {
//       try {
//         const parsed: PairPayload = JSON.parse(newPayload);
//         setParsedPayload(parsed);
//         setError(null);
//       } catch {
//         setParsedPayload(null);
//         setError('Invalid JSON format');
//       }
//     } else {
//       setParsedPayload(null);
//       setError(null);
//     }
//   }, []);

//     const refresh = useCallback(async () => {
//     try {
//       const s = await invoke<SyncStatusData>('get_sync_status');
//       setStatus(s);
//     } catch (e) {
//       console.error('Failed to get sync status:', e);
//     }
//   }, []);

//   const handleSetAsMaster = useCallback(async () => {
//     try {
//       const result = await invoke<string>('set_as_master');
//       toast({
//         title: "Device Set as Master",
//         description: result,
//       });
//       await refresh();
//     } catch (e: any) {
//       toast({
//         title: "Failed to Set as Master",
//         description: e?.toString() || 'Unknown error',
//         variant: "destructive"
//       });
//     }
//   }, [toast, refresh]);

//   const handleRemoveMaster = useCallback(async () => {
//     try {
//       const result = await invoke<string>('remove_master_device');
//       toast({
//         title: "Master Device Removed",
//         description: result,
//       });
//       await refresh();
//     } catch (e: any) {
//       toast({
//         title: "Failed to Remove Master",
//         description: e?.toString() || 'Unknown error',
//         variant: "destructive"
//       });
//     }
//   }, [toast, refresh]);

//   const generate = useCallback(async () => {
//     setIsGeneratingQR(true);
//     setSyncStatus('generating');
//     setError(null);
    
//     try {
//       const payload = await invoke<string>('generate_pairing_payload');
//       setQrPayload(payload);
//       setSyncStatus('idle');
//       toast({
//         title: "QR Code Generated",
//         description: "Scan this QR code from your mobile device to pair",
//       });
//     } catch (e: any) { 
//       const errorMessage = e?.toString() || 'Failed to generate pairing payload';
//       setError(errorMessage);
//       setSyncStatus('error');
//       toast({
//         title: "Generation Failed",
//         description: errorMessage,
//         variant: "destructive"
//       });
//     } finally {
//       setIsGeneratingQR(false);
//     }
//   }, [toast]);

//   const handleScanQR = useCallback(async () => {
//     setSyncStatus('scanning');
//     setError(null);
    
//     try {
//       const result = await scan({ 
//         windowed: false,
//         formats: [Format.QRCode] 
//       });
      
//       if (result?.content) {
//         updatePairPayload(result.content);
//         setSyncStatus('idle');
        
//         toast({
//           title: "QR Code Scanned",
//           description: "Pairing data captured successfully",
//         });
//       } else {
//         setSyncStatus('idle');
//       }
//     } catch (e: any) {
//       setSyncStatus('idle');
//       console.error('QR scan error:', e);
      
//       // Don't show error for user cancellation
//       if (!e.toString().includes('cancelled') && !e.toString().includes('canceled')) {
//         const errorMessage = e?.toString() || 'Failed to scan QR code';
//         setError(errorMessage);
//         setSyncStatus('error');
//         toast({
//           title: "Scan Failed",
//           description: errorMessage,
//           variant: "destructive"
//         });
//       }
//     }
//   }, [toast, updatePairPayload]);

//   const doSync = useCallback(async () => {
//     if (!pairPayload.trim() || !parsedPayload) return;
    
//     setSyncStatus('syncing');
//     setError(null);
    
//     try {
//       const payload = JSON.stringify({
//         host: parsedPayload.host,
//         port: parsedPayload.port
//       });
      
//       const result = await invoke<string>('sync_with_master', { payload });
//       setSyncStatus('success');
//       toast({
//         title: "Sync Completed",
//         description: result,
//       });
//       await refresh();
//     } catch (e: any) { 
//       const errorMessage = e?.toString() || 'Failed to sync with master device';
//       setError(errorMessage);
//       setSyncStatus('error');
//       toast({
//         title: "Sync Failed",
//         description: errorMessage,
//         variant: "destructive"
//       });
//     }
//   }, [pairPayload, parsedPayload, toast, refresh]);

//   const doFullSync = useCallback(async () => {
//     if (!pairPayload.trim() || !parsedPayload) return;
    
//     setSyncStatus('syncing');
//     setError(null);
    
//     try {
//       const payload = JSON.stringify({
//         host: parsedPayload.host,
//         port: parsedPayload.port
//       });
      
//       const result = await invoke<string>('force_full_sync_with_master', { payload });
//       setSyncStatus('success');
//       toast({
//         title: "Full Sync Completed",
//         description: result,
//       });
//       await refresh();
//     } catch (e: any) { 
//       const errorMessage = e?.toString() || 'Failed to perform full sync with master device';
//       setError(errorMessage);
//       setSyncStatus('error');
//       toast({
//         title: "Full Sync Failed",
//         description: errorMessage,
//         variant: "destructive"
//       });
//     }
//   }, [pairPayload, parsedPayload, toast, refresh]);

//   const initializeSync = useCallback(async () => {
//     setSyncStatus('generating');
//     setError(null);
    
//     try {
//       const result = await invoke<string>('initialize_sync_for_existing_data');
//       setSyncStatus('success');
//       toast({
//         title: "Sync Initialized",
//         description: result,
//       });
//       await refresh();
//     } catch (e: any) { 
//       const errorMessage = e?.toString() || 'Failed to initialize sync for existing data';
//       setError(errorMessage);
//       setSyncStatus('error');
//       toast({
//         title: "Initialization Failed",
//         description: errorMessage,
//         variant: "destructive"
//       });
//     }
//   }, [toast, refresh]);

//   const copyToClipboard = useCallback(async (text: string) => {
//     try {
//       await navigator.clipboard.writeText(text);
//       toast({
//         title: "Copied",
//         description: "Pairing data copied to clipboard",
//       });
//     } catch {
//       toast({
//         title: "Copy Failed",
//         description: "Could not copy to clipboard",
//         variant: "destructive"
//       });
//     }
//   }, [toast]);

//   const getSyncStatusBadge = () => {
//     switch (syncStatus) {
//       case 'generating':
//         return <Badge variant="secondary" className="animate-pulse">Generating...</Badge>;
//       case 'scanning':
//         return <Badge variant="secondary" className="animate-pulse">Scanning...</Badge>;
//       case 'syncing':
//         return <Badge variant="secondary" className="animate-pulse">Syncing...</Badge>;
//       case 'success':
//         return <Badge variant="default" className="bg-green-500">Success</Badge>;
//       case 'error':
//         return <Badge variant="destructive">Error</Badge>;
//       default:
//         return <Badge variant="outline">Ready</Badge>;
//     }
//   };

//   return (
//     <div className="space-y-6">
//       <div className="flex items-center justify-between">
//         <SettingsHeader heading="Device Sync" text="Pair mobile devices by scanning a QR code or entering pairing data." />
//         {getSyncStatusBadge()}
//       </div>
      
//       <Separator />

//       {error && (
//         <Alert variant="destructive">
//           <Icons.AlertCircle className="h-4 w-4" />
//           <div>
//             <h4 className="font-medium">Error</h4>
//             <p className="text-sm">{error}</p>
//           </div>
//         </Alert>
//       )}

//       <div className="grid gap-6 md:grid-cols-2">
//         {/* Desktop (Master) Card */}
//         <Card>
//           <CardHeader>
//             <CardTitle className="flex items-center gap-2">
//               <Icons.Monitor className="h-5 w-5" />
//               Desktop (Master)
//             </CardTitle>
//             <CardDescription>
//               Generate a QR code to pair with mobile devices
//             </CardDescription>
//           </CardHeader>
//           <CardContent className="space-y-4">
//             <Button 
//               onClick={generate} 
//               disabled={isGeneratingQR}
//               className="w-full"
//             >
//               {isGeneratingQR ? (
//                 <>
//                   <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
//                   Generating...
//                 </>
//               ) : (
//                 <>
//                   <Icons.QrCode className="mr-2 h-4 w-4" />
//                   Generate Pairing QR
//                 </>
//               )}
//             </Button>

//             <Button 
//               variant="outline"
//               onClick={initializeSync} 
//               disabled={syncStatus === 'generating'}
//               className="w-full"
//             >
//               {syncStatus === 'generating' ? (
//                 <>
//                   <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
//                   Initializing...
//                 </>
//               ) : (
//                 <>
//                   <Icons.Settings className="mr-2 h-4 w-4" />
//                   Initialize Sync for Existing Data
//                 </>
//               )}
//             </Button>
//             <p className="text-xs text-muted-foreground">
//               Run "Initialize Sync" once after enabling sync to prepare existing data for synchronization
//             </p>
            
//             {qrPayload && (
//               <div className="space-y-3">
//                 <div className="flex justify-center">
//                   <div className="p-4 bg-white rounded-lg shadow-sm border">
//                     <QRCode value={qrPayload} size={200} />
//                   </div>
//                 </div>
//                 <div className="flex gap-2">
//                   <Button
//                     variant="outline"
//                     size="sm"
//                     onClick={() => copyToClipboard(qrPayload)}
//                     className="flex-1"
//                   >
//                     <Icons.Copy className="mr-2 h-3 w-3" />
//                     Copy Data
//                   </Button>
//                   <Collapsible>
//                     <CollapsibleTrigger asChild>
//                       <Button variant="outline" size="sm" className="flex-1">
//                         <Icons.Eye className="mr-2 h-3 w-3" />
//                         View JSON
//                       </Button>
//                     </CollapsibleTrigger>
//                     <CollapsibleContent className="mt-2">
//                       <div className="p-3 bg-muted rounded text-xs font-mono break-all border">
//                         {qrPayload}
//                       </div>
//                     </CollapsibleContent>
//                   </Collapsible>
//                 </div>
//               </div>
//             )}
//           </CardContent>
//         </Card>

//         {/* Mobile / Client Card */}
//         <Card>
//           <CardHeader>
//             <CardTitle className="flex items-center gap-2">
//               <Icons.Smartphone className="h-5 w-5" />
//               Mobile / Client
//             </CardTitle>
//             <CardDescription>
//               Scan QR code or enter pairing data manually
//             </CardDescription>
//           </CardHeader>
//           <CardContent className="space-y-4">
//             <Button 
//               variant="outline" 
//               onClick={handleScanQR}
//               disabled={syncStatus === 'scanning'}
//               className="w-full"
//             >
//               {syncStatus === 'scanning' ? (
//                 <>
//                   <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
//                   Scanning...
//                 </>
//               ) : (
//                 <>
//                   <Icons.Camera className="mr-2 h-4 w-4" />
//                   Scan QR Code
//                 </>
//               )}
//             </Button>
            
//             <div className="space-y-3">
//               <div className="flex items-center justify-between">
//                 <Label htmlFor="connection-details" className="text-sm font-medium">
//                   Connection Details
//                 </Label>
//                 <Button
//                   type="button"
//                   variant="ghost"
//                   size="sm"
//                   onClick={() => setShowAdvanced(!showAdvanced)}
//                   className="text-xs"
//                 >
//                   {showAdvanced ? 'Simple' : 'Advanced'}
//                 </Button>
//               </div>
              
//               {!showAdvanced && parsedPayload ? (
//                 <div className="space-y-3">
//                   <div className="grid grid-cols-2 gap-3">
//                     <div>
//                       <Label className="text-xs text-muted-foreground">Host</Label>
//                       <Input
//                         value={parsedPayload.host}
//                         onChange={(e) => {
//                           const newPayload = { ...parsedPayload, host: e.target.value };
//                           updatePairPayload(JSON.stringify(newPayload));
//                         }}
//                         placeholder="192.168.1.10"
//                         className="text-sm"
//                       />
//                     </div>
//                     <div>
//                       <Label className="text-xs text-muted-foreground">Port</Label>
//                       <Input
//                         type="number"
//                         value={parsedPayload.port}
//                         onChange={(e) => {
//                           const newPayload = { ...parsedPayload, port: parseInt(e.target.value) || 33445 };
//                           updatePairPayload(JSON.stringify(newPayload));
//                         }}
//                         placeholder="33445"
//                         className="text-sm"
//                       />
//                     </div>
//                   </div>
//                   {parsedPayload.alt && parsedPayload.alt.length > 0 && (
//                     <div>
//                       <Label className="text-xs text-muted-foreground">Alternative IPs</Label>
//                       <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
//                         {parsedPayload.alt.join(', ')}
//                       </div>
//                     </div>
//                   )}
//                   <div className="flex gap-2">
//                     <Button
//                       type="button"
//                       variant="outline"
//                       size="sm"
//                       onClick={() => copyToClipboard(pairPayload)}
//                       className="flex-1"
//                     >
//                       <Icons.Copy className="mr-2 h-3 w-3" />
//                       Copy JSON
//                     </Button>
//                     <Button
//                       type="button"
//                       variant="outline"
//                       size="sm"
//                       onClick={() => updatePairPayload('')}
//                       className="flex-1"
//                     >
//                       <Icons.Trash className="mr-2 h-3 w-3" />
//                       Clear
//                     </Button>
//                   </div>
//                 </div>
//               ) : (
//                 <div className="space-y-2">
//                   <Textarea 
//                     id="connection-details"
//                     value={pairPayload} 
//                     onChange={(e) => updatePairPayload(e.target.value)} 
//                     placeholder='{"host":"192.168.1.10","port":33445}'
//                     className="font-mono text-sm"
//                     rows={4}
//                   />
//                   {pairPayload && (
//                     <Button
//                       type="button"
//                       variant="outline"
//                       size="sm"
//                       onClick={() => copyToClipboard(pairPayload)}
//                       className="w-full"
//                     >
//                       <Icons.Copy className="mr-2 h-3 w-3" />
//                       Copy to Clipboard
//                     </Button>
//                   )}
//                 </div>
//               )}
//             </div>
            
//             <div className="space-y-2">
//               <Button 
//                 onClick={doSync} 
//                 disabled={syncStatus === 'syncing' || !parsedPayload}
//                 className="w-full"
//               >
//                 {syncStatus === 'syncing' ? (
//                   <>
//                     <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
//                     Syncing...
//                   </>
//                 ) : (
//                   <>
//                     <Icons.Wifi className="mr-2 h-4 w-4" />
//                     Connect & Sync
//                   </>
//                 )}
//               </Button>
              
//               <Button 
//                 variant="outline"
//                 onClick={doFullSync} 
//                 disabled={syncStatus === 'syncing' || !parsedPayload}
//                 className="w-full"
//                 title="Use this for first-time setup to download all data from the master device"
//               >
//                 {syncStatus === 'syncing' ? (
//                   <>
//                     <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
//                     Syncing...
//                   </>
//                 ) : (
//                   <>
//                     <Icons.Download className="mr-2 h-4 w-4" />
//                     Full Sync (First Time Setup)
//                   </>
//                 )}
//               </Button>
//               <p className="text-xs text-muted-foreground text-center">
//                 Use "Full Sync" for first-time setup or to reset and download all data from master device
//               </p>
//             </div>
//           </CardContent>
//         </Card>
//       </div>

//       <Separator />

//       {/* Status Card */}
//       <Card>
//         <CardHeader>
//           <div className="flex items-center justify-between">
//             <CardTitle className="flex items-center gap-2">
//               <Icons.Activity className="h-5 w-5" />
//               Sync Status
//             </CardTitle>
//             <Button size="sm" variant="outline" onClick={refresh}>
//               <Icons.Refresh className="mr-2 h-4 w-4" />
//               Refresh
//             </Button>
//           </div>
//         </CardHeader>
//         <CardContent>
//           {status ? (
//             <pre className="text-xs bg-muted p-4 rounded-md max-h-64 overflow-auto font-mono">
//               {JSON.stringify(status, null, 2)}
//             </pre>
//           ) : (
//             <div className="flex items-center justify-center py-8 text-muted-foreground">
//               <div className="text-center space-y-2">
//                 <Icons.Database className="h-8 w-8 mx-auto opacity-50" />
//                 <p className="text-sm">No sync status available</p>
//                 <p className="text-xs">Click refresh to check status</p>
//               </div>
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
