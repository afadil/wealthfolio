import { getRunEnv, logger, RUN_ENV } from "@/adapters";
import { getCurrentWindow, Theme } from "@tauri-apps/api/window";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";

import { useSettings } from "@/hooks/use-settings";
import { useSettingsMutation } from "@/hooks/use-settings-mutation";
import { Settings, SettingsContextType } from "@/lib/types";

interface ExtendedSettingsContextType extends SettingsContextType {
  updateSettings: (
    updates: Partial<
      Pick<
        Settings,
        "theme" | "font" | "baseCurrency" | "onboardingCompleted" | "menuBarVisible" | "syncEnabled"
      >
    >,
  ) => Promise<void>;
  refetch: () => Promise<void>;
}

const SettingsContext = createContext<ExtendedSettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, refetch } = useSettings();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accountsGrouped, setAccountsGrouped] = useState(true);

  const updateMutation = useSettingsMutation(setSettings, applySettingsToDocument);

  const updateBaseCurrency = async (baseCurrency: Settings["baseCurrency"]) => {
    if (!settings) throw new Error("Settings not loaded");
    await updateMutation.mutateAsync({ baseCurrency });
  };

  // Batch update function
  const updateSettings = async (
    updates: Partial<
      Pick<
        Settings,
        "theme" | "font" | "baseCurrency" | "onboardingCompleted" | "menuBarVisible" | "syncEnabled"
      >
    >,
  ) => {
    if (!settings) throw new Error("Settings not loaded");
    await updateMutation.mutateAsync(updates);
  };

  useEffect(() => {
    if (data) {
      setSettings(data);
      applySettingsToDocument(data);
    }
  }, [data]);

  // Cleanup any lingering listeners when provider unmounts
  useEffect(() => {
    return () => {
      try {
        cleanupSystemThemeListeners();
      } catch {
        // noop
      }
    };
  }, []);

  const contextValue: ExtendedSettingsContextType = {
    settings,
    isLoading,
    isError,
    updateBaseCurrency,
    updateSettings,
    refetch: async () => {
      await refetch();
    },
    accountsGrouped,
    setAccountsGrouped,
  };

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettingsContext must be used within a SettingsProvider");
  }
  return context;
}
// Keep references to system theme listeners so we can clean up when switching modes
let tauriThemeUnlisten: (() => void) | null = null;
let mediaQueryList: MediaQueryList | null = null;
let mediaQueryUnsubscribe: (() => void) | null = null;

// Apply the resolved theme (light or dark) to the DOM
function applyResolvedTheme(resolved: "light" | "dark") {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
  document.documentElement.style.colorScheme = resolved;
}

// Cleanup any existing system listeners
function cleanupSystemThemeListeners() {
  if (tauriThemeUnlisten) {
    try {
      tauriThemeUnlisten();
    } catch {
      // noop
    }
    tauriThemeUnlisten = null;
  }
  if (mediaQueryUnsubscribe) {
    try {
      mediaQueryUnsubscribe();
    } catch {
      // noop
    }
    mediaQueryUnsubscribe = null;
  }
  mediaQueryList = null;
}

// Helper function to apply settings to the document
const applySettingsToDocument = (newSettings: Settings) => {
  // Font classes
  document.body.classList.remove("font-mono", "font-sans", "font-serif");
  document.body.classList.add(newSettings.font);

  // Always clean up previous listeners before applying a new theme mode
  cleanupSystemThemeListeners();

  // Handle theme mode
  if (newSettings.theme === "system") {
    // Resolve initial theme from media query (immediate), fallback to light
    let initial: "light" | "dark" = "dark";
    if (typeof window !== "undefined" && window.matchMedia) {
      mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
      initial = mediaQueryList.matches ? "dark" : "light";
      const handler = (e: MediaQueryListEvent) => applyResolvedTheme(e.matches ? "dark" : "light");
      if (mediaQueryList.addEventListener) {
        mediaQueryList.addEventListener("change", handler);
        mediaQueryUnsubscribe = () => mediaQueryList?.removeEventListener("change", handler);
      } else {
        // Legacy API support - addListener is deprecated but needed for older browsers
        mediaQueryList.addListener(handler);
        mediaQueryUnsubscribe = () => {
          try {
            mediaQueryList?.removeListener(handler);
          } catch {
            // noop
          }
        };
      }
    }

    // On desktop, also sync with Tauri window theme + listen to OS changes
    if (getRunEnv() === RUN_ENV.DESKTOP) {
      (async () => {
        try {
          const currentWindow = getCurrentWindow();
          await currentWindow.setTheme(null);
          const current = await currentWindow.theme();
          if (current === "dark" || current === "light") {
            applyResolvedTheme(current);
          }
          tauriThemeUnlisten = await currentWindow.onThemeChanged(({ payload }) => {
            const next = payload === "dark" ? "dark" : "light";
            applyResolvedTheme(next);
          });
        } catch {
          logger.error("Error setting window theme.");
        }
      })();
    }

    applyResolvedTheme(initial);
    return;
  }

  // Explicit light/dark mode
  const explicit = newSettings.theme === "dark" ? "dark" : "light";
  applyResolvedTheme(explicit);

  // Only call Tauri window APIs when running the desktop app for explicit modes
  if (getRunEnv() === RUN_ENV.DESKTOP) {
    (async () => {
      try {
        const currentWindow = getCurrentWindow();
        await currentWindow.setTheme(explicit as Theme);
      } catch {
        logger.error("Error setting window theme.");
      }
    })();
  }
};
