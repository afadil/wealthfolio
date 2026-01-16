import { invoke, logger } from "@/adapters";
import type {
  AiProvidersResponse,
  UpdateProviderSettingsRequest,
  SetDefaultProviderRequest,
} from "@/lib/types";

/**
 * Get all AI providers merged with user settings.
 * Returns catalog data merged with user overrides and computed hasApiKey flag.
 */
export const getAiProviders = async (): Promise<AiProvidersResponse> => {
  try {
    return await invoke("get_ai_providers");
  } catch (error) {
    logger.error("Error fetching AI providers.");
    throw error;
  }
};

/**
 * Update settings for a specific AI provider.
 */
export const updateAiProviderSettings = async (
  request: UpdateProviderSettingsRequest,
): Promise<void> => {
  try {
    await invoke("update_ai_provider_settings", { request });
  } catch (error) {
    logger.error("Error updating AI provider settings.");
    throw error;
  }
};

/**
 * Set or clear the default AI provider.
 */
export const setDefaultAiProvider = async (
  request: SetDefaultProviderRequest,
): Promise<void> => {
  try {
    await invoke("set_default_ai_provider", { request });
  } catch (error) {
    logger.error("Error setting default AI provider.");
    throw error;
  }
};
