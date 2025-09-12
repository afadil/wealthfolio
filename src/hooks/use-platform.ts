import { useState, useEffect } from "react";
import { getRunEnv, RUN_ENV } from "@/adapters";
import { invoke } from "@tauri-apps/api/core";

export interface PlatformInfo {
  os: string;
  is_mobile: boolean;
  is_desktop: boolean;
}

export interface UsePlatformResult {
  platform: PlatformInfo | null;
  isMobile: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMacOS: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isWeb: boolean;
  isTauri: boolean;
  loading: boolean;
}

// Cache platform info to avoid multiple invocations
let cachedPlatform: PlatformInfo | null = null;

export function usePlatform(): UsePlatformResult {
  const [platform, setPlatform] = useState<PlatformInfo | null>(cachedPlatform);
  const [loading, setLoading] = useState(!cachedPlatform);

  useEffect(() => {
    // If we already have cached platform info, use it
    if (cachedPlatform) {
      setPlatform(cachedPlatform);
      setLoading(false);
      return;
    }

    const runEnv = getRunEnv();

    if (runEnv === RUN_ENV.DESKTOP) {
      // We're in Tauri, get actual platform info
      invoke<PlatformInfo>("get_platform")
        .then((info) => {
          cachedPlatform = info;
          setPlatform(info);
          setLoading(false);
        })
        .catch((error) => {
          console.error("Failed to get platform info:", error);
          // Fallback detection based on user agent
          const fallbackInfo = detectPlatformFromUserAgent();
          cachedPlatform = fallbackInfo;
          setPlatform(fallbackInfo);
          setLoading(false);
        });
    } else {
      // We're in web environment, use user agent detection
      const webPlatform = detectPlatformFromUserAgent();
      cachedPlatform = webPlatform;
      setPlatform(webPlatform);
      setLoading(false);
    }
  }, []);

  const runEnv = getRunEnv();
  const isTauri = runEnv === RUN_ENV.DESKTOP;
  const isWeb = runEnv === RUN_ENV.WEB;

  return {
    platform,
    isMobile: platform?.is_mobile ?? false,
    isDesktop: platform?.is_desktop ?? true,
    isIOS: platform?.os === "ios",
    isAndroid: platform?.os === "android",
    isMacOS: platform?.os === "macos",
    isWindows: platform?.os === "windows",
    isLinux: platform?.os === "linux",
    isWeb,
    isTauri,
    loading,
  };
}

// Fallback detection using user agent (less reliable but works everywhere)
function detectPlatformFromUserAgent(): PlatformInfo {
  if (typeof window === "undefined") {
    return {
      os: "unknown",
      is_mobile: false,
      is_desktop: true,
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() || "";

  // Check for mobile devices
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
    userAgent,
  );
  const isTablet = /ipad|tablet|playbook|silk/i.test(userAgent);

  // Detect OS
  let os = "unknown";
  if (/iphone|ipad|ipod/.test(userAgent)) {
    os = "ios";
  } else if (/android/.test(userAgent)) {
    os = "android";
  } else if (/mac|darwin/.test(platform) || /macintosh/.test(userAgent)) {
    os = "macos";
  } else if (/win/.test(platform) || /windows/.test(userAgent)) {
    os = "windows";
  } else if (/linux/.test(platform) || /linux/.test(userAgent)) {
    os = "linux";
  }

  const is_mobile = isMobileUA || isTablet;

  return {
    os,
    is_mobile,
    is_desktop: !is_mobile,
  };
}

// Utility function for one-time platform detection (non-reactive)
export async function getPlatform(): Promise<PlatformInfo> {
  if (cachedPlatform) {
    return cachedPlatform;
  }

  const runEnv = getRunEnv();

  if (runEnv === RUN_ENV.DESKTOP) {
    try {
      const info = await invoke<PlatformInfo>("get_platform");
      cachedPlatform = info;
      return info;
    } catch (error) {
      console.error("Failed to get platform info:", error);
    }
  }

  // Fallback to user agent detection
  const fallback = detectPlatformFromUserAgent();
  cachedPlatform = fallback;
  return fallback;
}

// Simple utility to check if device is mobile
export async function isMobileDevice(): Promise<boolean> {
  const platform = await getPlatform();
  return platform.is_mobile;
}

// Viewport-based mobile detection (responsive design)
export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768); // Same as Tailwind's 'md' breakpoint
    };

    checkViewport();
    window.addEventListener("resize", checkViewport);

    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  return isMobile;
}
