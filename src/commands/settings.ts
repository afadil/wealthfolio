import { Settings } from '@/lib/types';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';

export const getSettings = async (): Promise<Settings> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_settings');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error fetching settings:', error);
    return {} as Settings;
  }
};

export const saveSettings = async (settings: Settings): Promise<Settings> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_settings', { settings });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

export const backupDatabase = async (): Promise<{ filename: string; data: Uint8Array }> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        const result = await invokeTauri<[string, number[]]>('backup_database');
        const [filename, data] = result;
        return { filename, data: new Uint8Array(data) };
      default:
        throw new Error(`Unsupported environment for database backup`);
    }
  } catch (error) {
    console.error('Error backing up database:', error);
    throw error;
  }
};
