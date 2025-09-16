import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";
import type { InstalledAddon, ExtractedAddon } from "@/adapters/tauri";
import type { AddonManifest, AddonUpdateCheckResult } from "@wealthfolio/addon-sdk";
import type { AddonStoreListing } from "@/lib/types";

export const getInstalledAddons = async (): Promise<InstalledAddon[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("list_installed_addons");
      case RUN_ENV.WEB:
        return invokeWeb("list_installed_addons");
      default:
        throw new Error("Addon management is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error listing installed addons.");
    throw error;
  }
};

export const loadAddon = async (addonId: string): Promise<ExtractedAddon> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("load_addon_for_runtime", { addonId });
      case RUN_ENV.WEB:
        return invokeWeb("load_addon_for_runtime", { addonId });
      default:
        throw new Error("Addon loading is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error loading addon for runtime.");
    throw error;
  }
};

export const extractAddon = async (zipData: Uint8Array): Promise<ExtractedAddon> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("extract_addon_zip", { zipData: Array.from(zipData) });
      case RUN_ENV.WEB:
        return invokeWeb("extract_addon_zip", { zipData: Array.from(zipData) });
      default:
        throw new Error("Addon extraction is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error extracting addon ZIP.");
    throw error;
  }
};

export const installAddon = async (
  zipData: Uint8Array,
  enableAfterInstall?: boolean,
): Promise<AddonManifest> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("install_addon_zip", {
          zipData: Array.from(zipData),
          enableAfterInstall,
        });
      case RUN_ENV.WEB:
        return invokeWeb("install_addon_zip", {
          zipData: Array.from(zipData),
          enableAfterInstall,
        });
      default:
        throw new Error("Addon installation is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error installing addon ZIP.");
    throw error;
  }
};

export const toggleAddon = async (addonId: string, enabled: boolean): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("toggle_addon", { addonId, enabled });
      case RUN_ENV.WEB:
        return invokeWeb("toggle_addon", { addonId, enabled });
      default:
        throw new Error("Addon toggle is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error toggling addon.");
    throw error;
  }
};

export const uninstallAddon = async (addonId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("uninstall_addon", { addonId });
      case RUN_ENV.WEB:
        return invokeWeb("uninstall_addon", { addonId });
      default:
        throw new Error("Addon uninstallation is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error uninstalling addon.");
    throw error;
  }
};

export const getEnabledAddons = async (): Promise<ExtractedAddon[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_enabled_addons_on_startup");
      case RUN_ENV.WEB:
        return invokeWeb("get_enabled_addons_on_startup");
      default:
        throw new Error("Addon startup loading is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error getting enabled addons on startup.");
    throw error;
  }
};

export const checkAddonUpdate = async (addonId: string): Promise<AddonUpdateCheckResult> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("check_addon_update", { addonId });
      case RUN_ENV.WEB:
        return invokeWeb("check_addon_update", { addonId });
      default:
        throw new Error("Addon update checking is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error checking addon update.");
    throw error;
  }
};

export const checkAllAddonUpdates = async (): Promise<AddonUpdateCheckResult[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("check_all_addon_updates");
      case RUN_ENV.WEB:
        return invokeWeb("check_all_addon_updates");
      default:
        throw new Error("Addon update checking is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error checking all addon updates.");
    throw error;
  }
};

export const updateAddon = async (addonId: string): Promise<AddonManifest> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_addon_from_store_by_id", { addonId });
      case RUN_ENV.WEB:
        return invokeWeb("update_addon_from_store_by_id", { addonId });
      default:
        throw new Error("Addon updating is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error updating addon from store by ID.");
    throw error;
  }
};

export const downloadAddonForReview = async (addonId: string): Promise<ExtractedAddon> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("download_addon_to_staging", { addonId });
      case RUN_ENV.WEB:
        return invokeWeb("download_addon_to_staging", { addonId });
      default:
        throw new Error("Addon staging is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error downloading addon to staging.");
    throw error;
  }
};

export const installFromStaging = async (
  addonId: string,
  enableAfterInstall?: boolean,
): Promise<AddonManifest> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("install_addon_from_staging", {
          addonId,
          enableAfterInstall,
        });
      case RUN_ENV.WEB:
        return invokeWeb("install_addon_from_staging", {
          addonId,
          enableAfterInstall,
        });
      default:
        throw new Error("Addon installation from staging is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error installing addon from staging.");
    throw error;
  }
};

export const clearAddonStaging = async (addonId?: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("clear_addon_staging", { addonId });
      case RUN_ENV.WEB:
        return invokeWeb("clear_addon_staging", { addonId });
      default:
        throw new Error("Addon staging cleanup is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error clearing addon staging.");
    throw error;
  }
};

export const getAddonRatings = async (addonId: string): Promise<unknown[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_addon_ratings", { addonId });
      case RUN_ENV.WEB:
        return invokeWeb("get_addon_ratings", { addonId });
      default:
        throw new Error("Addon ratings are only supported on desktop");
    }
  } catch (error) {
    logger.error("Error getting addon ratings.");
    throw error;
  }
};

export const submitAddonRating = async (
  addonId: string,
  rating: number,
  review?: string,
): Promise<unknown> => {
  try {
    if (rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("submit_addon_rating", {
          addonId,
          rating,
          review,
        });
      case RUN_ENV.WEB:
        return invokeWeb("submit_addon_rating", {
          addonId,
          rating,
          review,
        });
      default:
        throw new Error("Addon rating submission is only supported on desktop");
    }
  } catch (error) {
    logger.error("Error submitting addon rating.");
    throw error;
  }
};

export const fetchAddonStoreListings = async (): Promise<AddonStoreListing[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("fetch_addon_store_listings");
      case RUN_ENV.WEB:
        return invokeWeb("fetch_addon_store_listings");
      default:
        throw new Error("Addon store is only supported on desktop/web");
    }
  } catch (error) {
    logger.error("Error fetching addon store listings.");
    throw error;
  }
};
