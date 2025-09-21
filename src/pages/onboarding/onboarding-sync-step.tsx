import { logger } from '@/adapters';
import { recalculatePortfolio } from '@/commands/portfolio';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { cancel, Format, requestPermissions, scan } from '@tauri-apps/plugin-barcode-scanner';
import { AlertFeedback, Button, Card, CardContent, Icons } from '@wealthfolio/ui';
import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface OnboardingSyncStepProps {
  onSuccess: () => void;
  onBack: () => void;
}

function sanitizeEndpoints(endpoints: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const entry of endpoints) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed === '') continue;

    const normalized = trimmed.includes('://')
      ? trimmed
      : `quic://${trimmed.replace(/^quic:\/\//i, '')}`;
    const lower = normalized.toLowerCase();
    if (
      lower.includes('://0.0.0.0') ||
      lower.includes('://[::]') ||
      lower.includes('://localhost')
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

export function OnboardingSyncStep({ onSuccess, onBack }: OnboardingSyncStepProps) {
  function toErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err.trim() === '' ? fallback : err;
    if (
      typeof err === 'number' ||
      typeof err === 'boolean' ||
      typeof err === 'bigint' ||
      typeof err === 'symbol'
    ) {
      return String(err);
    }
    return fallback;
  }

  const [status, setStatus] = useState<'idle' | 'scanning'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const [scanPermission, setScanPermission] = useState<'idle' | 'pending' | 'granted' | 'denied'>(
    'idle',
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
  }, [isScanningActive]);

  const processScannedContent = useCallback(
    async (content: string) => {
      try {
        const parsed = JSON.parse(content);
        const hasDevice = typeof parsed.device_id === 'string' && parsed.device_id.length > 0;
        const rawEndpoints = Array.isArray(parsed.listen_endpoints) ? parsed.listen_endpoints : [];
        const sanitizedEndpoints = sanitizeEndpoints(rawEndpoints);
        const hasEndpoints =
          sanitizedEndpoints.length > 0 ||
          (typeof parsed.host === 'string' && parsed.host.trim() !== '' && typeof parsed.port === 'number');

        if (hasDevice && hasEndpoints) {
          if (parsed.host && parsed.port) {
            try {
              await invoke('probe_local_network_access', { host: parsed.host, port: parsed.port });
            } catch (_) {}
          }

          const payload = JSON.stringify({
            ...parsed,
            listen_endpoints: sanitizedEndpoints,
          });
          await invoke('sync_with_peer', { payload });
          await queryClient.invalidateQueries();
          await recalculatePortfolio();
          onSuccess();
          return;
        }
        setError('Invalid QR code payload');
      } catch (e: unknown) {
        logger.error('QR parse error: ' + (e instanceof Error ? e.message : String(e)));
        setError('Invalid QR code');
      }
    },
    [onSuccess, queryClient],
  );

  const performScan = useCallback(async () => {
    if (scanPermission !== 'granted' || isScanInFlight) {
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
        setError('No QR detected. Align code within frame.');
      }
    } catch (e: unknown) {
      const msg = toErrorMessage(e, 'Scan failed');
      if (!msg.toLowerCase().includes('cancel')) {
        // Normalize unsupported into a friendly message
        if (msg.toLowerCase().includes('unsupported')) {
          setError(
            'QR scanning is unavailable in this environment. Please use the Settings → Sync page or a supported mobile build.',
          );
        } else {
          setError(msg);
        }
      }
    } finally {
      setIsScanInFlight(false);
      setStatus('idle');
    }
  }, [scanPermission, isScanInFlight, processScannedContent]);

  // Auto-run scan after permission granted
  useEffect(() => {
    if (isScanningActive && scanPermission === 'granted') {
      void performScan();
    }
  }, [isScanningActive, scanPermission, performScan]);

  const startInlineScan = useCallback(async () => {
    setIsScanningActive(true);
    setStatus('scanning');
    setError(null);
    try {
      const perm = await requestPermissions();
      if (perm === 'granted') {
        setScanPermission('granted');
      } else {
        setScanPermission('denied');
        setStatus('idle');
        setIsScanningActive(false);
        setError('Camera permission denied');
      }
    } catch (_e) {
      setScanPermission('denied');
      setStatus('idle');
      setIsScanningActive(false);
      setError('Failed to request camera permission');
    }
  }, []);

  const cancelInlineScan = useCallback(() => {
    cancel()
      .catch(() => {})
      .finally(() => {
        setIsScanningActive(false);
        setScanPermission('idle');
        setStatus('idle');
      });
  }, []);

  const containerVariants: Variants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    initial: { opacity: 0, y: 20 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 24,
      },
    },
  };

  const scanningStates = {
    idle: {
      icon: Icons.QrCode,
      title: 'Ready to Scan',
      description: 'Tap the button below to start scanning the QR code from your desktop.',
    },
    scanning: {
      icon: Icons.Spinner,
      title: 'Scanning...',
      description: 'Point your camera at the QR code displayed on your desktop Wealthfolio.',
    },
  };

  const currentState = scanningStates[status];

  const cancelOverlay =
    isScanningActive && typeof document !== 'undefined'
      ? createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[1000] flex justify-center">
            <Button
              onClick={cancelInlineScan}
              variant="outline"
              size="lg"
              className="pointer-events-auto px-6 py-3 shadow-lg"
            >
              <Icons.Close className="mr-2 h-5 w-5" />
              Cancel Scan
            </Button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className={`space-y-8 px-4 py-4 md:px-12 lg:px-16 xl:px-20 ${
          isScanningActive ? 'scan-hide-target' : ''
        }`}
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="space-y-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Sync with Desktop</h1>
          <p className="text-muted-foreground mx-auto max-w-lg text-sm leading-relaxed md:text-base">
            Connect to your desktop Wealthfolio instance by scanning the QR code displayed in the
            sync settings.
          </p>
        </motion.div>

        {/* Main Content Card */}
        <motion.div variants={itemVariants} className="mx-auto max-w-2xl">
          <Card className="border-border/40 border-2 shadow-lg">
            <CardContent className="space-y-6 p-8">
              {/* Status Section */}
              <motion.div
                key={status}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4 text-center"
              >
                <div
                  className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
                    status === 'scanning' ? 'bg-primary/20' : 'bg-muted/80'
                  }`}
                >
                  <currentState.icon
                    className={`h-10 w-10 ${
                      status === 'scanning' ? 'text-primary animate-spin' : 'text-muted-foreground'
                    }`}
                  />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">{currentState.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {currentState.description}
                  </p>
                </div>
              </motion.div>

              {/* Error Feedback */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AlertFeedback variant="error" title="Scan Error">
                    {error}
                  </AlertFeedback>
                </motion.div>
              )}

              {/* Action Buttons */}
              <motion.div
                variants={itemVariants}
                className="flex flex-col justify-center gap-3 sm:flex-row"
              >
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    onClick={startInlineScan}
                    disabled={status === 'scanning'}
                    size="lg"
                    className="w-full px-6 py-3 sm:w-auto"
                  >
                    {status === 'scanning' ? (
                      <>
                        <Icons.Spinner className="mr-2 h-5 w-5 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Icons.QrCode className="mr-2 h-5 w-5" />
                        Start Scan
                      </>
                    )}
                  </Button>
                </motion.div>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Back Button */}
        <motion.div variants={itemVariants} className="flex justify-center">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="ghost" onClick={onBack} className="px-6">
              <Icons.ArrowLeft className="mr-2 h-4 w-4" />
              Back to Options
            </Button>
          </motion.div>
        </motion.div>

        {/* Helpful Tips */}
        <motion.div variants={itemVariants} className="mx-auto max-w-lg">
          <Card className="bg-muted/30 border-muted/50">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="mt-0.5 flex-shrink-0">
                  <Icons.Info className="text-muted-foreground h-4 w-4" />
                </div>
                <div className="text-muted-foreground space-y-2 text-sm">
                  <p className="text-foreground font-medium">Quick Tips:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Ensure your desktop app is running and visible</li>
                    <li>• Go to Settings → Sync in your desktop app</li>
                    <li>• Hold your device steady when scanning</li>
                    <li>• Make sure both devices are on the same network</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
      {cancelOverlay}
    </>
  );
}

export default OnboardingSyncStep;
