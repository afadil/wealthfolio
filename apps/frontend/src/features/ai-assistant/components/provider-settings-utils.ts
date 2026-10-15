import type { FetchedModel, MergedProvider, ModelCapabilityOverrideUpdate } from "../types";

// Providers whose model lists say what each model supports, while chat
// requests carry only the model ID.
const PROVIDERS_WITH_LISTED_CAPABILITIES = new Set(["openrouter", "ollama"]);

/**
 * Overrides to save when the user adds a model from the provider's list:
 * what the list reported, for a model the catalog doesn't cover and the user
 * hasn't configured yet.
 */
export function listedCapabilityOverride(
  provider: Pick<MergedProvider, "id" | "models" | "modelCapabilityOverrides">,
  fetchedModels: FetchedModel[],
  modelId: string,
): ModelCapabilityOverrideUpdate | undefined {
  const reported = fetchedModels.find((m) => m.id === modelId)?.capabilities;
  const isCatalog = provider.models.some((m) => m.id === modelId && m.isCatalog);
  if (
    !reported ||
    !PROVIDERS_WITH_LISTED_CAPABILITIES.has(provider.id) ||
    isCatalog ||
    provider.modelCapabilityOverrides[modelId]
  ) {
    return undefined;
  }
  return {
    modelId,
    overrides: { tools: reported.tools, thinking: reported.thinking, vision: reported.vision },
  };
}
