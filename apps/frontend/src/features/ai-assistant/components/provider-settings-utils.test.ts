import { describe, expect, it } from "vitest";
import type { FetchedModel, MergedProvider } from "../types";
import { listedCapabilityOverride } from "./provider-settings-utils";

const reported: FetchedModel = {
  id: "qwen3.5:27b",
  capabilities: { tools: true, thinking: true, vision: false, streaming: true },
};

function provider(
  id: string,
  overrides: MergedProvider["modelCapabilityOverrides"] = {},
): Pick<MergedProvider, "id" | "models" | "modelCapabilityOverrides"> {
  return {
    id,
    models: [
      {
        id: "gemma4:e4b",
        capabilities: { tools: true, thinking: false, vision: true, streaming: true },
        isCatalog: true,
        isFavorite: true,
        hasCapabilityOverrides: false,
      },
    ],
    modelCapabilityOverrides: overrides,
  };
}

describe("listedCapabilityOverride", () => {
  it("saves every capability the list reported, thinking included", () => {
    expect(listedCapabilityOverride(provider("ollama"), [reported], reported.id)).toEqual({
      modelId: reported.id,
      overrides: { tools: true, thinking: true, vision: false },
    });
  });

  it("leaves models the user configured, catalog models and other providers alone", () => {
    const configured = provider("ollama", { [reported.id]: { tools: false } });
    expect(listedCapabilityOverride(configured, [reported], reported.id)).toBeUndefined();

    const catalog = { ...reported, id: "gemma4:e4b" };
    expect(listedCapabilityOverride(provider("ollama"), [catalog], catalog.id)).toBeUndefined();

    expect(
      listedCapabilityOverride(provider("anthropic"), [reported], reported.id),
    ).toBeUndefined();
    expect(listedCapabilityOverride(provider("openrouter"), [], reported.id)).toBeUndefined();
  });
});
