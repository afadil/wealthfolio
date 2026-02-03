// AI Providers Commands
import type {
  AiProvidersResponse,
  UpdateProviderSettingsRequest,
  SetDefaultProviderRequest,
  ListModelsResponse,
} from "@/lib/types";

import { invoke } from "./platform";

/**
 * Get all AI providers merged with user settings.
 * Returns catalog data merged with user overrides and computed hasApiKey flag.
 */
export const getAiProviders = async (): Promise<AiProvidersResponse> => {
  return invoke<AiProvidersResponse>("get_ai_providers");
};

/**
 * Update settings for a specific AI provider.
 */
export const updateAiProviderSettings = async (
  request: UpdateProviderSettingsRequest,
): Promise<void> => {
  return invoke<void>("update_ai_provider_settings", { request });
};

/**
 * Set or clear the default AI provider.
 */
export const setDefaultAiProvider = async (request: SetDefaultProviderRequest): Promise<void> => {
  return invoke<void>("set_default_ai_provider", { request });
};

/**
 * List available models from a provider.
 * Fetches models from the provider's API using backend-stored secrets.
 */
export const listAiModels = async (providerId: string): Promise<ListModelsResponse> => {
  return invoke<ListModelsResponse>("list_ai_models", { providerId });
};
