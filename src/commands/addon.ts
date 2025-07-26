import { getRunEnv, RUN_ENV, invokeTauri, logger } from '@/adapters';
import type { InstalledAddon, ExtractedAddon } from '@/adapters/tauri';
import type { AddonManifest } from '@wealthfolio/addon-sdk';

export const listInstalledAddons = async (): Promise<InstalledAddon[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('list_installed_addons');
      default:
        throw new Error('Addon management is only supported on desktop');
    }
  } catch (error) {
    logger.error('Error listing installed addons.');
    throw error;
  }
};

export const loadAddonForRuntime = async (addonId: string): Promise<ExtractedAddon> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('load_addon_for_runtime', { addonId });
      default:
        throw new Error('Addon loading is only supported on desktop');
    }
  } catch (error) {
    logger.error('Error loading addon for runtime.');
    throw error;
  }
};

export const extractAddonZip = async (zipData: Uint8Array): Promise<ExtractedAddon> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('extract_addon_zip', { zipData: Array.from(zipData) });
      default:
        throw new Error('Addon extraction is only supported on desktop');
    }
  } catch (error) {
    logger.error('Error extracting addon ZIP.');
    throw error;
  }
};

export const installAddonZip = async (
  zipData: Uint8Array, 
  enableAfterInstall?: boolean
): Promise<AddonManifest> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('install_addon_zip', { 
          zipData: Array.from(zipData),
          enableAfterInstall
        });
      default:
        throw new Error('Addon installation is only supported on desktop');
    }
  } catch (error) {
    logger.error('Error installing addon ZIP.');
    throw error;
  }
};

export const toggleAddon = async (addonId: string, enabled: boolean): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('toggle_addon', { addonId, enabled });
      default:
        throw new Error('Addon toggle is only supported on desktop');
    }
  } catch (error) {
    logger.error('Error toggling addon.');
    throw error;
  }
};

export const uninstallAddon = async (addonId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('uninstall_addon', { addonId });
      default:
        throw new Error('Addon uninstallation is only supported on desktop');
    }
  } catch (error) {
    logger.error('Error uninstalling addon.');
    throw error;
  }
};

export const getEnabledAddonsOnStartup = async (): Promise<ExtractedAddon[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_enabled_addons_on_startup');
      default:
        throw new Error('Addon startup loading is only supported on desktop');
    }
  } catch (error) {
    logger.error('Error getting enabled addons on startup.');
    throw error;
  }
};
