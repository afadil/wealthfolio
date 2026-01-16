import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAiProviders,
  updateAiProviderSettings,
  setDefaultAiProvider,
} from "@/commands/ai-providers";
import { setSecret, getSecret, deleteSecret } from "@/commands/secrets";
import type { UpdateProviderSettingsRequest, SetDefaultProviderRequest } from "@/lib/types";

const AI_PROVIDERS_KEY = ["ai-providers"] as const;

/**
 * Hook to fetch all AI providers with merged settings.
 */
export function useAiProviders() {
  return useQuery({
    queryKey: AI_PROVIDERS_KEY,
    queryFn: getAiProviders,
  });
}

/**
 * Hook to update a provider's settings.
 */
export function useUpdateAiProviderSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateProviderSettingsRequest) => updateAiProviderSettings(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });
}

/**
 * Hook to set the default AI provider.
 */
export function useSetDefaultAiProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SetDefaultProviderRequest) => setDefaultAiProvider(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });
}

/**
 * Hook to manage API keys for AI providers.
 * Uses the ai_{providerId} key format in the secret store.
 */
export function useAiProviderApiKey(providerId: string) {
  const queryClient = useQueryClient();
  const secretKey = `ai_${providerId}`;

  const setApiKey = useMutation({
    mutationFn: async (apiKey: string) => {
      await setSecret(secretKey, apiKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });

  const deleteApiKey = useMutation({
    mutationFn: async () => {
      await deleteSecret(secretKey);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });

  const revealApiKey = async (): Promise<string | null> => {
    return getSecret(secretKey);
  };

  return {
    setApiKey,
    deleteApiKey,
    revealApiKey,
  };
}
