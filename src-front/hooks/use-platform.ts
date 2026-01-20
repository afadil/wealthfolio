import { useState, useEffect } from "react";
import {
  getPlatform as getPlatformApi,
  isDesktop as isDesktopEnv,
  isWeb as isWebEnv,
  type PlatformInfo,
} from "@/adapters";

export type { PlatformInfo };

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

    if (isDesktopEnv) {
      // We're in Tauri, get actual platform info
      getPlatformApi()
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

  const isTauri = isDesktopEnv;
  const isWeb = isWebEnv;

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
  } else if (userAgent.includes("android")) {
    os = "android";
  } else if (/mac|darwin/.test(platform) || userAgent.includes("macintosh")) {
    os = "macos";
  } else if (platform.includes("win") || userAgent.includes("windows")) {
    os = "windows";
  } else if (platform.includes("linux") || userAgent.includes("linux")) {
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

  if (isDesktopEnv) {
    try {
      const info = await getPlatformApi();
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
// Initialize synchronously to avoid flash of wrong state
const getInitialMobileViewport = () => {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768; // Same as Tailwind's 'md' breakpoint
};

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState<boolean>(getInitialMobileViewport);

  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  return isMobile;
}
