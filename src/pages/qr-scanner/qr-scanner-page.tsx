import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { scan, Format, cancel, requestPermissions, openAppSettings } from '@tauri-apps/plugin-barcode-scanner';
import { Button, Icons, AlertFeedback } from '@wealthfolio/ui';

export default function QRScannerPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const returnPath = state?.returnTo || '/settings/sync';
  const [permission, setPermission] = useState<'idle' | 'pending' | 'granted' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleScanSuccess = useCallback(
    (content: string) => {
      // Store the scan result in sessionStorage to pass it back
      sessionStorage.setItem('qr_scan_result', content);
      navigate(returnPath, { replace: true });
    },
    [navigate, returnPath],
  );

  const cancelScan = useCallback(() => {
    cancel().catch(() => {}).finally(() => navigate(returnPath, { replace: true }));
  }, [navigate, returnPath]);

  // Force transparent root (html/body) so native camera view shows through
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevHtmlColor = html.style.backgroundColor;
    const prevBodyColor = body.style.backgroundColor;
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    html.style.backgroundColor = 'transparent';
    body.style.backgroundColor = 'transparent';
    body.classList.add('qr-scan-active');
    return () => {
      body.classList.remove('qr-scan-active');
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      html.style.backgroundColor = prevHtmlColor;
      body.style.backgroundColor = prevBodyColor;
    };
  }, []);

  // Request permission on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      setPermission('pending');
      try {
        const perm = await requestPermissions();
        if (!mounted) return;
        if (perm === 'granted') {
          setPermission('granted');
        } else {
          setPermission('denied');
        }
      } catch {
        if (mounted) {
          setPermission('denied');
        }
      }
    })();
    return () => { mounted = false; cancel().catch(() => {}); };
  }, []);

  // Start scanning once permission granted
  useEffect(() => {
    if (permission !== 'granted' || isScanning) return;
    let cancelled = false;
    const run = async () => {
      setIsScanning(true);
      setError(null);
      try {
        const result = await scan({
          windowed: true, // windowed avoids freezing issues
          formats: [Format.QRCode]
        });
        if (cancelled) return;
        if (result?.content) {
          handleScanSuccess(result.content.trim());
        } else {
          // Keep scanner open instead of navigating back immediately
          setError('No QR detected. Try again.');
          setIsScanning(false); // allow retry
        }
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.toString() || 'Scan failed';
        const isCancellation = msg.includes('cancel');
        if (!isCancellation) {
          setError(msg);
        } else {
          navigate(returnPath, { replace: true });
        }
        setIsScanning(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [permission, isScanning, handleScanSuccess, navigate, returnPath]);

  const retry = () => {
    setError(null);
    setIsScanning(false); // effect will re-run when permission is granted and isScanning false
  };

  const openSettings = () => {
    openAppSettings().catch(() => {});
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 text-white pointer-events-none" style={{background:'transparent'}}>
      {/* Framing / mask layer */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0.55))',
        pointerEvents: 'auto'
      }} />
      <div className="absolute top-4 left-4 pointer-events-auto">
        <Button variant="outline" size="sm" onClick={cancelScan} className="bg-black/40 backdrop-blur border-white/30 text-white hover:bg-black/60">
          <Icons.Close className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-col items-center gap-5 pointer-events-none">
        <div className="text-center pointer-events-none">
          <h1 className="text-lg font-semibold drop-shadow">Scan QR Code</h1>
          {permission === 'pending' && <p className="text-xs opacity-80">Requesting camera permission...</p>}
        </div>
        {permission === 'denied' && (
          <div className="w-72 space-y-3 pointer-events-auto">
            <AlertFeedback variant="error" title="Camera Permission Denied">
              Enable camera access in system settings.
            </AlertFeedback>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={openSettings}>Settings</Button>
              <Button variant="outline" className="flex-1" onClick={cancelScan}>Back</Button>
            </div>
          </div>
        )}
        {permission === 'granted' && (
          <>
            <div className="relative w-64 h-64 pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-white" />
              <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-white" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-white" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-white" />
              {isScanning && <div className="absolute inset-0 animate-pulse bg-white/5 rounded" />}
            </div>
            {error && (
              <div className="w-72 space-y-3 pointer-events-auto">
                <AlertFeedback variant="error" title="Scan Error">{error}</AlertFeedback>
                <div className="flex gap-2">
                  <Button onClick={retry} className="flex-1">Retry</Button>
                  <Button variant="outline" onClick={cancelScan} className="flex-1">Cancel</Button>
                </div>
              </div>
            )}
            {!error && !isScanning && (
              <div className="pointer-events-auto">
                <Button onClick={retry} variant="outline" className="bg-black/40 hover:bg-black/60 border-white/30 text-white">Retry</Button>
              </div>
            )}
            <p className="text-[10px] opacity-70">Camera overlay (windowed) – middle transparent</p>
          </>
        )}
      </div>
    </div>
  );
}
