import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { getAiProviders } from "@/adapters";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { QueryKeys } from "@/lib/query-keys";
import type { MergedProvider } from "@/lib/types";
import { CHAT_MODEL_STORAGE_KEY, type StoredModelSelection } from "./use-chat-model";

export interface UseProviderPickerResult {
  isLoading: boolean;
  activeProviders: MergedProvider[];
  currentProviderId: string | undefined;
  currentProvider: MergedProvider | undefined;
  selectProvider: (providerId: string) => Promise<void>;
}

export function useProviderPicker(): UseProviderPickerResult {
  const { data: settings, isLoading } = useQuery({
    queryKey: [QueryKeys.AI_PROVIDERS],
    queryFn: getAiProviders,
  });

  const [storedSelection, setStoredSelection] = usePersistentState<StoredModelSelection | null>(
    CHAT_MODEL_STORAGE_KEY,
    null,
  );

  // Get only enabled/active providers
  // Local providers (like Ollama) don't require API keys
  // API providers require hasApiKey to be true
  const activeProviders = useMemo(() => {
    return settings?.providers.filter((p) => {
      if (!p.enabled) return false;
      // Local providers don't need API keys
      if (p.type === "local") return true;
      // API providers require an API key
      return p.hasApiKey;
    }) ?? [];
  }, [settings?.providers]);

  // Determine current provider
  const currentProviderId = useMemo(() => {
    // First check localStorage for user's selection
    if (storedSelection) {
      const provider = activeProviders.find((p) => p.id === storedSelection.providerId);
      if (provider) {
        return storedSelection.providerId;
      }
    }

    // Fall back to default provider from settings
    if (settings?.defaultProvider) {
      const provider = activeProviders.find((p) => p.id === settings.defaultProvider);
      if (provider) {
        return settings.defaultProvider;
      }
    }

    // Fall back to first active provider
    return activeProviders[0]?.id;
  }, [activeProviders, settings?.defaultProvider, storedSelection]);

  const currentProvider = useMemo(() => {
    return activeProviders.find((p) => p.id === currentProviderId);
  }, [activeProviders, currentProviderId]);

  const selectProvider = useCallback(
    async (providerId: string) => {
      const provider = activeProviders.find((p) => p.id === providerId);
      if (!provider) return;

      const modelId = provider.selectedModel ?? provider.defaultModel;

      // Store locally
      setStoredSelection({ providerId, modelId });
    },
    [activeProviders, setStoredSelection],
  );

  return {
    isLoading,
    activeProviders,
    currentProviderId,
    currentProvider,
    selectProvider,
  };
}
