import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { getAiProviders } from "@/commands/ai-providers";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { QueryKeys } from "@/lib/query-keys";
import type { AiProvidersResponse, MergedProvider } from "@/lib/types";

export const CHAT_MODEL_STORAGE_KEY = "chat_selected_model";

export interface StoredModelSelection {
  providerId: string;
  modelId: string;
}

export interface ChatModelState {
  isLoading: boolean;
  settings: AiProvidersResponse | undefined;
  enabledProviders: MergedProvider[];
  currentProviderId: string | undefined;
  currentModelId: string | undefined;
  currentProvider: MergedProvider | undefined;
  selectModel: (providerId: string, modelId: string) => Promise<void>;
}

export function useChatModel(): ChatModelState {
  const { data: settings, isLoading } = useQuery({
    queryKey: [QueryKeys.AI_PROVIDERS],
    queryFn: getAiProviders,
  });

  const [storedSelection, setStoredSelection] = usePersistentState<StoredModelSelection | null>(
    CHAT_MODEL_STORAGE_KEY,
    null,
  );

  // Get enabled providers
  // Local providers (like Ollama) don't require API keys
  // API providers require hasApiKey to be true
  const enabledProviders = useMemo(() => {
    return settings?.providers.filter((p) => {
      if (!p.enabled) return false;
      // Local providers don't need API keys
      if (p.type === "local") return true;
      // API providers require an API key
      return p.hasApiKey;
    }) ?? [];
  }, [settings?.providers]);

  // Determine current provider and model
  const { currentProviderId, currentModelId } = useMemo(() => {
    // Use the stored selection if it matches an enabled provider and model
    if (storedSelection) {
      const provider = enabledProviders.find((p) => p.id === storedSelection.providerId);
      if (provider) {
        // Check if model is in catalog models or user's favorite models
        const isInCatalog = provider.models.some((m) => m.id === storedSelection.modelId);
        const isInFavorites = provider.favoriteModels?.includes(storedSelection.modelId);
        if (isInCatalog || isInFavorites) {
          return { currentProviderId: provider.id, currentModelId: storedSelection.modelId };
        }
        // Provider exists but model doesn't - use provider's default model
        return { currentProviderId: provider.id, currentModelId: provider.defaultModel };
      }
    }

    // Fall back to default provider from settings
    if (settings?.defaultProvider) {
      const provider = enabledProviders.find((p) => p.id === settings.defaultProvider);
      if (provider) {
        const selectedModel = provider.selectedModel ?? provider.defaultModel;
        const model = provider.models.find((m) => m.id === selectedModel);
        return {
          currentProviderId: provider.id,
          currentModelId: model ? model.id : provider.defaultModel,
        };
      }
    }

    // Fall back to first enabled provider's default model
    const firstProvider = enabledProviders[0];
    if (firstProvider) {
      return {
        currentProviderId: firstProvider.id,
        currentModelId: firstProvider.selectedModel ?? firstProvider.defaultModel,
      };
    }

    return { currentProviderId: undefined, currentModelId: undefined };
  }, [enabledProviders, settings?.defaultProvider, storedSelection]);

  // Get current provider object
  const currentProvider = useMemo(() => {
    return enabledProviders.find((p) => p.id === currentProviderId);
  }, [enabledProviders, currentProviderId]);

  // Select a model
  const selectModel = useCallback(
    async (providerId: string, modelId: string) => {
      const provider = enabledProviders.find((p) => p.id === providerId);
      if (!provider) return;

      // Check if model is in catalog models or user's favorite models
      const isInCatalog = provider.models.some((m) => m.id === modelId);
      const isInFavorites = provider.favoriteModels?.includes(modelId);
      const selectedModel = isInCatalog || isInFavorites ? modelId : provider.defaultModel;
      setStoredSelection({ providerId, modelId: selectedModel });
    },
    [enabledProviders, setStoredSelection],
  );

  return {
    isLoading,
    settings,
    enabledProviders,
    currentProviderId,
    currentModelId,
    currentProvider,
    selectModel,
  };
}
