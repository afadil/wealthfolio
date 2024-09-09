import { invoke } from '@tauri-apps/api';
import { Settings } from '@/lib/types';

// getSettings
export const getSettings = async (): Promise<Settings> => {
  try {
    const settings = await invoke('get_settings');
    return settings as Settings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    return {} as Settings;
  }
};

// saveSettings
export const saveSettings = async (settings: Settings): Promise<Settings> => {
  try {
    const updatedSettings = await invoke('update_settings', { settings });
    return updatedSettings as Settings;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};
