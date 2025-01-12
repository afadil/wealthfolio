import { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { getCurrentWindow, Theme } from '@tauri-apps/api/window';

import { Settings, SettingsContextType } from './types';
import { useSettings } from './useSettings';
import { useSettingsMutation } from './useSettingsMutation';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useSettings();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accountsGrouped, setAccountsGrouped] = useState(true);

  const updateMutation = useSettingsMutation(setSettings, applySettingsToDocument, settings);

  const updateSettings = (newSettings: Settings) => {
    updateMutation.mutate(newSettings);
  };

  useEffect(() => {
    if (data) {
      setSettings(data);
      applySettingsToDocument(data);
    }
  }, [data]);

  const contextValue: SettingsContextType = {
    settings,
    isLoading,
    isError,
    updateSettings,
    accountsGrouped,
    setAccountsGrouped,
  };

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettingsContext must be used within a SettingsProvider');
  }
  return context;
}

// Helper function to apply settings to the document
const applySettingsToDocument = async (newSettings: Settings) => {
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(newSettings.theme);

  document.body.classList.remove('font-mono', 'font-sans', 'font-serif');
  document.body.classList.add(newSettings.font);

  // Color scheme must be applied to document element (`<html>`)
  document.documentElement.style.colorScheme = newSettings.theme;
  const currentWindow = await getCurrentWindow();
  currentWindow.setTheme(newSettings.theme as Theme);
};
