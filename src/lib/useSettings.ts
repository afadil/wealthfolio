import { useQuery } from '@tanstack/react-query';
import { Settings } from './types';
import { invoke } from '@tauri-apps/api';

export function useSettings() {
  return useQuery<Settings, Error>({
    queryKey: ['settings'],
    queryFn: getSettings,
  });
}

export const getSettings = async (): Promise<Settings> => {
  try {
    const settings = await invoke('get_settings');
    return settings as Settings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    return {} as Settings;
  }
};
