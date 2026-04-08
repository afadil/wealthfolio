import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getAiProviders } from "@/adapters";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { QueryKeys } from "@/lib/query-keys";
import type { AiProvidersResponse, MergedProvider, MergedModel } from "@/lib/types";

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
  currentModel: MergedModel | undefined;
  selectModel: (providerId: string, modelId: string) => Promise<void>;
  /** Whether the current model supports thinking */
  supportsThinking: boolean;
  /** Whether thinking is enabled for this session (can be toggled by user) */
  thinkingEnabled: boolean;
  /** Toggle thinking on/off */
  toggleThinking: () => void;
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
    return (
      settings?.providers.filter((p) => {
        if (!p.enabled) return false;
        // Local providers don't need API keys
        if (p.type === "local") return true;
        // Subscription providers (e.g. Claude via Claude Code) authenticate
        // through the host environment, not an API key.
        if (p.type === "subscription") return true;
        // API providers require an API key
        return p.hasApiKey;
      }) ?? []
    );
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

  // Ensure resolved model is accessible in the provider's favorites.
  // ModelPicker filters by favorites — if the resolved model isn't among them,
  // the picker shows "No model" while the hook sends a different model to the backend.
  const adjustedModelId = useMemo(() => {
    if (!currentModelId) return currentModelId;
    if (!currentProvider?.favoriteModels?.length) return currentModelId;
    if (currentProvider.favoriteModels.includes(currentModelId)) return currentModelId;
    return currentProvider.favoriteModels[0];
  }, [currentProvider, currentModelId]);

  // Get current model object
  const currentModel = useMemo(() => {
    if (!currentProvider || !adjustedModelId) return undefined;
    return currentProvider.models.find((m) => m.id === adjustedModelId);
  }, [currentProvider, adjustedModelId]);

  // Check if current model supports thinking
  const supportsThinking = useMemo(() => {
    return currentModel?.capabilities?.thinking ?? false;
  }, [currentModel]);

  // Thinking enabled state - defaults to model's capability, but can be toggled
  // Reset to model default when model changes
  const [thinkingEnabled, setThinkingEnabled] = useState(supportsThinking);

  // Sync thinking state when model changes
  useEffect(() => {
    setThinkingEnabled(supportsThinking);
  }, [supportsThinking]);

  const toggleThinking = useCallback(() => {
    if (supportsThinking) {
      setThinkingEnabled((prev) => !prev);
    }
  }, [supportsThinking]);

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
    currentModelId: adjustedModelId,
    currentProvider,
    currentModel,
    selectModel,
    supportsThinking,
    thinkingEnabled,
    toggleThinking,
  };
}
