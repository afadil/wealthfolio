import { invoke, logger } from "@/adapters";
import type { InstalledAddon, ExtractedAddon } from "@/adapters";
import type { AddonManifest, AddonUpdateCheckResult } from "@wealthfolio/addon-sdk";
import type { AddonStoreListing } from "@/lib/types";

export const getInstalledAddons = async (): Promise<InstalledAddon[]> => {
  try {
    return await invoke("list_installed_addons");
  } catch (error) {
    logger.error("Error listing installed addons.");
    throw error;
  }
};

export const loadAddon = async (addonId: string): Promise<ExtractedAddon> => {
  try {
    return await invoke("load_addon_for_runtime", { addonId });
  } catch (error) {
    logger.error("Error loading addon for runtime.");
    throw error;
  }
};

export const extractAddon = async (zipData: Uint8Array): Promise<ExtractedAddon> => {
  try {
    return await invoke("extract_addon_zip", { zipData: Array.from(zipData) });
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
    return await invoke("install_addon_zip", {
      zipData: Array.from(zipData),
      enableAfterInstall,
    });
  } catch (error) {
    logger.error("Error installing addon ZIP.");
    throw error;
  }
};

export const toggleAddon = async (addonId: string, enabled: boolean): Promise<void> => {
  try {
    return await invoke("toggle_addon", { addonId, enabled });
  } catch (error) {
    logger.error("Error toggling addon.");
    throw error;
  }
};

export const uninstallAddon = async (addonId: string): Promise<void> => {
  try {
    return await invoke("uninstall_addon", { addonId });
  } catch (error) {
    logger.error("Error uninstalling addon.");
    throw error;
  }
};

export const getEnabledAddons = async (): Promise<ExtractedAddon[]> => {
  try {
    return await invoke("get_enabled_addons_on_startup");
  } catch (error) {
    logger.error("Error getting enabled addons on startup.");
    throw error;
  }
};

export const checkAddonUpdate = async (addonId: string): Promise<AddonUpdateCheckResult> => {
  try {
    return await invoke("check_addon_update", { addonId });
  } catch (error) {
    logger.error("Error checking addon update.");
    throw error;
  }
};

export const checkAllAddonUpdates = async (): Promise<AddonUpdateCheckResult[]> => {
  try {
    return await invoke("check_all_addon_updates");
  } catch (error) {
    logger.error("Error checking all addon updates.");
    throw error;
  }
};

export const updateAddon = async (addonId: string): Promise<AddonManifest> => {
  try {
    return await invoke("update_addon_from_store_by_id", { addonId });
  } catch (error) {
    logger.error("Error updating addon from store by ID.");
    throw error;
  }
};

export const downloadAddonForReview = async (addonId: string): Promise<ExtractedAddon> => {
  try {
    return await invoke("download_addon_to_staging", { addonId });
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
    return await invoke("install_addon_from_staging", {
      addonId,
      enableAfterInstall,
    });
  } catch (error) {
    logger.error("Error installing addon from staging.");
    throw error;
  }
};

export const clearAddonStaging = async (addonId?: string): Promise<void> => {
  try {
    return await invoke("clear_addon_staging", { addonId });
  } catch (error) {
    logger.error("Error clearing addon staging.");
    throw error;
  }
};

export const getAddonRatings = async (addonId: string): Promise<unknown[]> => {
  try {
    return await invoke("get_addon_ratings", { addonId });
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

    return await invoke("submit_addon_rating", {
      addonId,
      rating,
      review,
    });
  } catch (error) {
    logger.error("Error submitting addon rating.");
    throw error;
  }
};

export const fetchAddonStoreListings = async (): Promise<AddonStoreListing[]> => {
  try {
    return await invoke("fetch_addon_store_listings");
  } catch (error) {
    logger.error("Error fetching addon store listings.");
    throw error;
  }
};
