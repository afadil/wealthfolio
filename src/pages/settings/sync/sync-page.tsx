import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import QRCode from 'react-qr-code';
// Lazy load scanner to avoid failing on platforms without camera
import { QrReader } from 'react-qr-reader';
import { SettingsHeader } from '../header';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function SyncSettingsPage() {
  const [status, setStatus] = useState<any>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [pairPayload, setPairPayload] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const refresh = async () => {
    try {
      const s = await invoke('get_sync_status');
      setStatus(s);
    } catch (e:any) { setMessage(e.toString()); }
  };

  const generate = async () => {
    try {
      const payload = await invoke<string>('generate_pairing_payload');
      setQrPayload(payload);
      setMessage(null);
    } catch (e:any) { setMessage(e.toString()); }
  };

  const doSync = async () => {
    setBusy(true);
    try {
      await invoke('sync_with_master', { payload: pairPayload });
      setMessage('Sync completed');
      refresh();
    } catch (e:any) { setMessage(e.toString()); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <SettingsHeader heading="Sync" text="Pair mobile devices by scanning a QR code or paste a pairing payload." />
      <Separator />
      <div className="space-y-4">
        <h3 className="font-medium">Desktop (Master)</h3>
        <p className="text-sm text-muted-foreground">Generate a QR code and scan it from the mobile app.</p>
        <Button variant="secondary" onClick={generate}>Generate Pairing QR</Button>
        {qrPayload && (
          <div className="p-4 bg-muted inline-block">
            <QRCode value={qrPayload} size={220} />
            <p className="mt-2 break-all text-[10px] leading-snug max-w-xs">{qrPayload}</p>
          </div>
        )}
      </div>
      <Separator />
      <div className="space-y-4">
        <h3 className="font-medium">Mobile / Client</h3>
        <p className="text-sm text-muted-foreground">Paste the scanned payload (JSON) below if automatic handoff is not available and start sync.</p>
        <div className="space-y-2">
          <Button variant={scanning ? 'destructive' : 'outline'} onClick={()=>setScanning(s=>!s)}>
            {scanning ? 'Stop Scanner' : 'Scan QR'}
          </Button>
          {scanning && (
            <div className="w-full max-w-xs aspect-square bg-black/5 rounded overflow-hidden">
              <QrReader
                constraints={{ facingMode: 'environment' }}
                scanDelay={250}
                onResult={(res: any, err: any) => {
                  const text = (res?.getText?.() ?? res?.text)?.trim();
                  if (text) {
                    // Basic validation: expect JSON with host + port
                    let ok = false;
                    try {
                      const parsed = JSON.parse(text);
                      ok = typeof parsed?.host === 'string' && !!parsed?.port;
                    } catch { /* ignore parse errors */ }
                    setPairPayload(text);
                    setScanning(false);
                    setMessage(ok ? 'QR captured' : 'QR captured (unvalidated JSON)');
                  }
                  // Ignore frequent NotFound / Checksum errors; surface others once
                  if (err && err.name && !['NotFoundException','ChecksumException','FormatException'].includes(err.name)) {
                    setMessage(err.message || String(err));
                  }
                }}
                containerStyle={{ width: '100%', height: '100%' }}
                videoStyle={{ objectFit: 'cover' }}
              />
            </div>
          )}
        </div>
        <Textarea value={pairPayload} onChange={(e)=>setPairPayload(e.target.value)} placeholder='{"host":"192.168.1.10","port":33445}' />
        <Button onClick={doSync} disabled={busy || !pairPayload}>Connect & Sync</Button>
      </div>
      <Separator />
      <div className="space-y-2">
        <div className="flex items-center gap-2"><h3 className="font-medium">Status</h3><Button size="sm" variant="outline" onClick={refresh}>Refresh</Button></div>
        <pre className="text-xs bg-muted p-3 rounded max-h-64 overflow-auto">{status ? JSON.stringify(status, null, 2) : 'No status yet'}</pre>
      </div>
      {message && <div className="text-sm text-muted-foreground">{message}</div>}
    </div>
  );
}
