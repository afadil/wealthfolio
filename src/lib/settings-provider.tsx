import { createContext, useState, useEffect, ReactNode, useContext } from 'react';
import { Settings, SettingsContextType } from './types';
import { useSettings } from './useSettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { saveSettings } from '@/commands/setting';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useSettings();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accountsGrouped, setAccountsGrouped] = useState(true);

  const updateMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (updatedSettings) => {
      setSettings(updatedSettings);
      applySettingsToDocument(updatedSettings);
      queryClient.invalidateQueries();
      toast({
        title: 'Settings updated successfully.',
        className: 'bg-green-500 text-white border-none',
      });
    },
    onError: () => {
      toast({
        title: 'Uh oh! Something went wrong.',
        description: 'There was a problem updating your settings.',
        className: 'bg-red-500 text-white border-none',
      });
    },
  });

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
const applySettingsToDocument = (newSettings: Settings) => {
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(newSettings.theme);

  document.body.classList.remove('font-mono', 'font-sans', 'font-serif');
  document.body.classList.add(newSettings.font);

  // Color scheme must be applied to document element (`<html>`)
  document.documentElement.style.colorScheme = newSettings.theme;
};
