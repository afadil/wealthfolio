import { useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  requestPermissions, 
  openAppSettings,
} from '@tauri-apps/plugin-barcode-scanner';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '@/adapters';

export function useScannerOrClipboard(onScanResult: (text: string) => void) {
  const navigate = useNavigate();
  const location = useLocation();

  // Check for scan results when returning from scanner
  useEffect(() => {
    const checkScanResult = () => {
      const result = sessionStorage.getItem('qr_scan_result');
      const error = sessionStorage.getItem('qr_scan_error');
      
      if (result) {
        console.log('Hook: Found scan result:', result);
        sessionStorage.removeItem('qr_scan_result');
        onScanResult(result);
      }
      
      if (error) {
        console.log('Hook: Found scan error:', error);
        sessionStorage.removeItem('qr_scan_error');
        console.error('Scanner error:', error);
      }
    };

    // Check immediately when component mounts
    checkScanResult();

    // Also check on focus (when returning from scanner)
    window.addEventListener('focus', checkScanResult);
    
    return () => {
      window.removeEventListener('focus', checkScanResult);
    };
  }, [onScanResult]);

  const handleScanOrPaste = useCallback(async () => {
    console.log('Hook: handleScanOrPaste called');
    
    try {
      // Check if we're on mobile platform
      const platform = await invoke<string>('get_platform');
      const isMobile = platform === 'ios' || platform === 'android';
      
      console.log('Hook: Platform detected:', platform, 'isMobile:', isMobile);

      if (isMobile) {
        // Request camera permissions first
        try {
          console.log('Hook: Requesting camera permissions...');
          const permissionState = await requestPermissions();
          logger.info('Camera permission state:' + permissionState);
          
          if (permissionState === 'denied') {
            console.log('Hook: Camera permission denied, opening settings');
            await openAppSettings();
            return;
          } else if (permissionState === 'granted') {
            // Navigate to dedicated scanner page
            console.log('Hook: Permission granted, navigating to scanner');
            logger.info('Navigating to QR scanner');
            navigate('/qr-scanner', {
              state: {
                returnTo: location.pathname,
              },
            });
          }
        } catch (permError) {
          console.error('Hook: Permission error:', permError);
          // Fallback: try to navigate to scanner anyway
          navigate('/qr-scanner', {
            state: {
              returnTo: location.pathname,
            },
          });
        }
      } else {
        // On desktop, go directly to scanner
        console.log('Hook: Desktop platform, navigating to scanner');
        navigate('/qr-scanner', {
          state: {
            returnTo: location.pathname,
          },
        });
      }
    } catch (error) {
      console.error('Hook: Error in handleScanOrPaste:', error);
      // Fallback: try scanner page
      navigate('/qr-scanner', {
        state: {
          returnTo: location.pathname,
        },
      });
    }
  }, [navigate, location.pathname, onScanResult]);

  return { handleScanOrPaste };
}
