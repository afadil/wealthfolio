import { useState, useMemo, useEffect, useRef } from "react";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@wealthfolio/ui/components/ui/command";
import { cn } from "@/lib/utils";
import type { MergedProvider, MergedModel, FetchedModel, ModelCapabilityOverrides } from "../types";
import { ProviderIcon } from "./provider-icons";

interface ProviderSettingsCardProps {
  provider: MergedProvider;
  onToggleEnabled: (enabled: boolean) => void;
  onSetDefault: () => void;
  onSaveApiKey: (apiKey: string) => void;
  onDeleteApiKey: () => void;
  onRevealApiKey: () => Promise<string | null>;
  onCustomUrlChange?: (url: string) => void;
  /** @deprecated Use onSetFavoriteModels instead for multi-select */
  onSelectModel?: (modelId: string) => void;
  onSetFavoriteModels?: (modelIds: string[]) => void;
  onSetCapabilityOverride?: (modelId: string, overrides: ModelCapabilityOverrides | null) => void;
  onToolsAllowlistChange?: (tools: string[] | null) => void;
  isLast?: boolean;
  // Model fetching props (controlled by parent via React Query)
  modelComboboxOpen?: boolean;
  onModelComboboxOpenChange?: (open: boolean) => void;
  fetchedModels?: FetchedModel[];
  isFetchingModels?: boolean;
  fetchModelsError?: string | null;
  onRefreshModels?: () => void;
}

// Novice-friendly tool mapping for data access settings
const DATA_ACCESS_OPTIONS = [
  { toolId: "get_accounts", label: "Accounts", description: "Account names, types, and balances" },
  { toolId: "get_holdings", label: "Holdings", description: "Current positions and their values" },
  {
    toolId: "search_activities",
    label: "Transactions",
    description: "Past transactions and activities",
  },
  {
    toolId: "get_performance",
    label: "Performance",
    description: "Returns and performance metrics",
  },
  { toolId: "get_dividends", label: "Dividends", description: "Dividend income and history" },
  { toolId: "get_goals", label: "Goals", description: "Investment goals and progress" },
  {
    toolId: "get_asset_allocation",
    label: "Allocation",
    description: "Portfolio allocation breakdown",
  },
  { toolId: "get_valuation_history", label: "History", description: "Portfolio value over time" },
];

export function ProviderSettingsCard({
  provider,
  onToggleEnabled,
  onSetDefault: _onSetDefault,
  onSaveApiKey,
  onDeleteApiKey,
  onRevealApiKey,
  onCustomUrlChange,
  onSelectModel: _onSelectModel,
  onSetFavoriteModels,
  onSetCapabilityOverride,
  onToolsAllowlistChange,
  isLast = false,
  // Model fetching props
  modelComboboxOpen: controlledComboboxOpen,
  onModelComboboxOpenChange,
  fetchedModels: externalFetchedModels,
  isFetchingModels: externalIsFetchingModels,
  fetchModelsError: externalFetchModelsError,
  onRefreshModels,
}: ProviderSettingsCardProps) {
  // Suppress unused variable warnings for deprecated/unused props
  void _onSelectModel;
  void _onSetDefault;
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [hasLoadedKey, setHasLoadedKey] = useState(false);
  const [customUrlValue, setCustomUrlValue] = useState(provider.customUrl ?? "");
  const [selectedModelForConfig, setSelectedModelForConfig] = useState<string | null>(null);
  const hasAutoSelectedRef = useRef(false);

  // Support both controlled and uncontrolled combobox state
  const [internalComboboxOpen, setInternalComboboxOpen] = useState(false);
  const modelComboboxOpen = controlledComboboxOpen ?? internalComboboxOpen;
  const setModelComboboxOpen = onModelComboboxOpenChange ?? setInternalComboboxOpen;

  // Use external fetched models if provided
  const fetchedModels = externalFetchedModels ?? [];
  const isFetchingModels = externalIsFetchingModels ?? false;
  const fetchError = externalFetchModelsError ?? null;

  // Check if provider supports custom base URL
  const supportsCustomUrl = provider.connectionFields?.some(
    (field) => field.key === "baseUrl" || field.key === "customUrl",
  );
  const customUrlField = provider.connectionFields?.find(
    (field) => field.key === "baseUrl" || field.key === "customUrl",
  );

  // Combine catalog models with fetched models and saved favorites
  const allModels = useMemo(() => {
    const seenIds = new Set<string>();
    const combined: (MergedModel | (FetchedModel & { isFetched: true }))[] = [];

    // First add catalog models
    for (const model of provider.models) {
      combined.push(model);
      seenIds.add(model.id);
    }

    // Add fetched models that aren't in catalog
    for (const fetched of fetchedModels) {
      if (!seenIds.has(fetched.id)) {
        combined.push({
          ...fetched,
          isFetched: true,
        } as FetchedModel & { isFetched: true });
        seenIds.add(fetched.id);
      }
    }

    // Add any saved favorite models that aren't already in the list
    // (these are models that were fetched in a previous session)
    for (const favoriteId of provider.favoriteModels || []) {
      if (!seenIds.has(favoriteId)) {
        combined.push({
          id: favoriteId,
          name: favoriteId, // Use ID as name since we don't have the full model info
          isFetched: true,
        } as FetchedModel & { isFetched: true });
        seenIds.add(favoriteId);
      }
    }

    return combined;
  }, [provider.models, fetchedModels, provider.favoriteModels]);

  // Get enabled models (favorites) with full model info
  const enabledModels = useMemo(() => {
    const favoriteIds = provider.favoriteModels || [];
    return allModels.filter((m) => favoriteIds.includes(m.id));
  }, [provider.favoriteModels, allModels]);

  const handleRevealApiKey = async () => {
    if (hasLoadedKey) {
      setShowApiKey(!showApiKey);
      return;
    }

    setIsLoadingKey(true);
    try {
      const key = await onRevealApiKey();
      if (key) {
        setApiKeyValue(key);
      }
    } finally {
      setIsLoadingKey(false);
      setHasLoadedKey(true);
      setShowApiKey(true);
    }
  };

  const handleSaveApiKey = () => {
    if (apiKeyValue && apiKeyValue.trim() !== "") {
      onSaveApiKey(apiKeyValue);
    } else {
      onDeleteApiKey();
    }
  };

  // Auto-select recommended models on initial mount if no models are selected
  // This only runs once when the card first expands, not on subsequent updates
  useEffect(() => {
    if (isOpen && !hasAutoSelectedRef.current && onSetFavoriteModels && provider.enabled) {
      hasAutoSelectedRef.current = true; // Mark as run immediately to prevent re-runs

      // Only auto-select if truly empty
      if (!provider.favoriteModels || provider.favoriteModels.length === 0) {
        const recommendedModelIds = provider.models.filter((m) => m.isCatalog).map((m) => m.id);
        if (recommendedModelIds.length > 0) {
          onSetFavoriteModels(recommendedModelIds);
        }
      }
    }
  }, [isOpen, provider.enabled, provider.favoriteModels, provider.models, onSetFavoriteModels]);

  const handleToggleFavorite = (modelId: string) => {
    if (!onSetFavoriteModels) return;

    const currentFavorites = provider.favoriteModels || [];
    const newFavorites = currentFavorites.includes(modelId)
      ? currentFavorites.filter((id) => id !== modelId)
      : [...currentFavorites, modelId];
    onSetFavoriteModels(newFavorites);
  };

  const handleCapabilityChange = (
    modelId: string,
    capability: "tools" | "thinking" | "vision",
    value: boolean,
  ) => {
    if (!onSetCapabilityOverride) return;

    const existingOverrides = provider.modelCapabilityOverrides[modelId] || {};
    const newOverrides: ModelCapabilityOverrides = {
      ...existingOverrides,
      [capability]: value,
    };
    onSetCapabilityOverride(modelId, newOverrides);
  };

  // Handle tool allowlist toggle
  const handleToolToggle = (toolId: string, enabled: boolean) => {
    if (!onToolsAllowlistChange) return;

    const currentAllowlist = provider.toolsAllowlist;
    const allToolIds = DATA_ACCESS_OPTIONS.map((opt) => opt.toolId);

    if (currentAllowlist === null || currentAllowlist === undefined) {
      // Currently all tools enabled (null = all). If disabling one, create allowlist with all except this one.
      if (!enabled) {
        const newAllowlist = allToolIds.filter((id) => id !== toolId);
        onToolsAllowlistChange(newAllowlist);
      }
      // If enabling when already all enabled, no action needed
    } else {
      // We have an explicit allowlist
      if (enabled) {
        // Add tool to allowlist
        const newAllowlist = [...currentAllowlist, toolId];
        // Always send the list - don't use null to avoid serialization issues
        onToolsAllowlistChange(newAllowlist);
      } else {
        // Remove tool from allowlist
        const newAllowlist = currentAllowlist.filter((id) => id !== toolId);
        onToolsAllowlistChange(newAllowlist);
      }
    }
  };

  // Check if a tool is enabled
  const isToolEnabled = (toolId: string): boolean => {
    const allowlist = provider.toolsAllowlist;
    // null/undefined means all tools are enabled
    if (allowlist === null || allowlist === undefined) return true;
    return allowlist.includes(toolId);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("hover:bg-accent/30 transition-colors", !isLast && "border-b")}>
        {/* Main row */}
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Icon */}
          <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <ProviderIcon name={provider.icon} size={20} className="text-muted-foreground" />
          </div>

          {/* Name and description */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{provider.name}</span>
              {provider.isDefault && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                  Default
                </Badge>
              )}
              {provider.enabled && !provider.hasApiKey && provider.type === "api" && (
                <Badge
                  variant="outline"
                  className="border-warning/20 bg-warning/10 text-warning shrink-0 text-xs"
                >
                  <Icons.AlertTriangle className="mr-1 h-3 w-3" />
                  API Key Required
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">{provider.description}</p>
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground h-8 w-8"
              >
                <Icons.Settings className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <Switch
              id={`${provider.id}-enabled`}
              checked={provider.enabled}
              onCheckedChange={onToggleEnabled}
              className="data-[state=checked]:bg-success"
            />
          </div>
        </div>

        {/* Expandable settings */}
        <CollapsibleContent>
          <div className="border-t px-4 py-5">
            <div className="space-y-5">
              {/* API Key Section */}
              <div className="bg-muted/40 rounded-lg p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`apikey-${provider.id}`} className="text-sm font-medium">
                      API Key
                    </Label>
                    {provider.documentationUrl && (
                      <a
                        href={provider.documentationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
                      >
                        Get API key
                        <Icons.ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        id={`apikey-${provider.id}`}
                        type={showApiKey ? "text" : "password"}
                        value={
                          hasLoadedKey
                            ? apiKeyValue
                            : provider.hasApiKey
                              ? "••••••••••••••••••••••••"
                              : ""
                        }
                        onChange={(e) => setApiKeyValue(e.target.value)}
                        placeholder={provider.hasApiKey ? "" : "Enter API key"}
                        className="bg-background pr-9 font-mono text-sm"
                        readOnly={!hasLoadedKey && provider.hasApiKey}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full w-9 hover:bg-transparent"
                        onClick={handleRevealApiKey}
                        disabled={isLoadingKey}
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                      >
                        {isLoadingKey ? (
                          <Icons.Spinner className="h-4 w-4 animate-spin" />
                        ) : showApiKey ? (
                          <Icons.EyeOff className="h-4 w-4" />
                        ) : (
                          <Icons.Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button onClick={handleSaveApiKey} size="default" className="shrink-0">
                      Save
                    </Button>
                  </div>
                </div>
              </div>

              {/* Model Selection Section */}
              {onSetFavoriteModels && (
                <div className="bg-muted/40 rounded-lg p-4">
                  <div className="space-y-3">
                    {/* Header with Add button */}
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Models</Label>
                      <div className="flex items-center gap-2">
                        {provider.supportsModelListing && onRefreshModels && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
                            onClick={onRefreshModels}
                            disabled={
                              isFetchingModels || (!provider.hasApiKey && provider.type === "api")
                            }
                          >
                            {isFetchingModels ? (
                              <Icons.Spinner className="h-3 w-3 animate-spin" />
                            ) : (
                              <Icons.RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                        <Popover open={modelComboboxOpen} onOpenChange={setModelComboboxOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                              <Icons.Plus className="h-3 w-3" />
                              Add
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-0" align="end">
                            <Command>
                              <CommandInput placeholder="Search models..." className="h-9" />
                              <CommandList>
                                <CommandEmpty>
                                  {isFetchingModels ? (
                                    <div className="flex items-center justify-center gap-2 py-2">
                                      <Icons.Spinner className="h-4 w-4 animate-spin" />
                                      <span>Loading...</span>
                                    </div>
                                  ) : (
                                    "No models found."
                                  )}
                                </CommandEmpty>
                                {/* Recommended models */}
                                <CommandGroup heading="Recommended">
                                  {allModels
                                    .filter((m) => "isCatalog" in m && m.isCatalog)
                                    .map((model) => {
                                      const isEnabled = provider.favoriteModels?.includes(model.id);
                                      const capabilities =
                                        "capabilities" in model ? model.capabilities : null;
                                      return (
                                        <CommandItem
                                          key={model.id}
                                          value={`${model.id} ${model.name ?? ""}`}
                                          onSelect={() => {
                                            handleToggleFavorite(model.id);
                                          }}
                                          className="flex items-center justify-between"
                                        >
                                          <span className="truncate">{model.name ?? model.id}</span>
                                          <div className="flex items-center gap-1">
                                            {capabilities?.tools && (
                                              <Badge
                                                variant="secondary"
                                                className="h-4 px-1 text-[9px]"
                                              >
                                                T
                                              </Badge>
                                            )}
                                            {capabilities?.vision && (
                                              <Badge
                                                variant="secondary"
                                                className="h-4 px-1 text-[9px]"
                                              >
                                                V
                                              </Badge>
                                            )}
                                            {isEnabled && <Icons.Check className="h-4 w-4" />}
                                          </div>
                                        </CommandItem>
                                      );
                                    })}
                                </CommandGroup>
                                {/* Other available models */}
                                {allModels.filter((m) => !("isCatalog" in m && m.isCatalog))
                                  .length > 0 && (
                                  <CommandGroup heading="Other Available">
                                    {allModels
                                      .filter((m) => !("isCatalog" in m && m.isCatalog))
                                      .map((model) => {
                                        const isEnabled = provider.favoriteModels?.includes(
                                          model.id,
                                        );
                                        return (
                                          <CommandItem
                                            key={model.id}
                                            value={`${model.id} ${model.name ?? ""}`}
                                            onSelect={() => {
                                              handleToggleFavorite(model.id);
                                            }}
                                            className="flex items-center justify-between"
                                          >
                                            <span className="truncate">
                                              {model.name ?? model.id}
                                            </span>
                                            {isEnabled && <Icons.Check className="h-4 w-4" />}
                                          </CommandItem>
                                        );
                                      })}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Model list */}
                    <div className="bg-background rounded-md border">
                      {enabledModels.length === 0 ? (
                        <div className="text-muted-foreground flex items-center justify-center py-6 text-sm">
                          No models selected. Click &quot;Add&quot; to add models.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {enabledModels.map((model) => {
                            const capabilities =
                              "capabilities" in model
                                ? model.capabilities
                                : provider.modelCapabilityOverrides[model.id];
                            const isRecommended = "isCatalog" in model && model.isCatalog;
                            const needsConfig = !isRecommended && !capabilities;
                            const isSelected = selectedModelForConfig === model.id;

                            return (
                              <div
                                key={model.id}
                                className={cn(
                                  "flex cursor-pointer items-center justify-between px-3 py-2 transition-colors",
                                  isSelected ? "bg-accent" : "hover:bg-muted/50",
                                )}
                                onClick={() =>
                                  setSelectedModelForConfig(isSelected ? null : model.id)
                                }
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-sm">{model.name ?? model.id}</span>
                                  {isRecommended && (
                                    <Icons.Star className="text-warning h-3.5 w-3.5 shrink-0 fill-current" />
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {/* Capability badges */}
                                  {capabilities?.tools && (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                      Tools
                                    </Badge>
                                  )}
                                  {capabilities?.vision && (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                      Vision
                                    </Badge>
                                  )}
                                  {capabilities?.thinking && (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                      Thinking
                                    </Badge>
                                  )}
                                  {needsConfig && (
                                    <Badge
                                      variant="outline"
                                      className="border-warning/50 text-warning h-5 px-1.5 text-[10px]"
                                    >
                                      <Icons.AlertTriangle className="mr-1 h-3 w-3" />
                                      Config
                                    </Badge>
                                  )}
                                  {/* Remove button */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive h-6 w-6"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleFavorite(model.id);
                                      if (isSelected) setSelectedModelForConfig(null);
                                    }}
                                  >
                                    <Icons.X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Capability config for selected model */}
                    {selectedModelForConfig &&
                      onSetCapabilityOverride &&
                      (() => {
                        const model = enabledModels.find((m) => m.id === selectedModelForConfig);
                        if (!model) return null;
                        const isRecommended = "isCatalog" in model && model.isCatalog;
                        const capabilities =
                          isRecommended && "capabilities" in model
                            ? model.capabilities
                            : provider.modelCapabilityOverrides[model.id] || {};

                        return (
                          <div className="bg-background rounded-md border p-3">
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-sm font-medium">{model.name ?? model.id}</p>
                              {isRecommended && (
                                <Badge variant="secondary" className="text-xs">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-4">
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={capabilities.tools ?? false}
                                  onCheckedChange={(checked) =>
                                    handleCapabilityChange(model.id, "tools", checked === true)
                                  }
                                  disabled={isRecommended}
                                />
                                Tools
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={capabilities.vision ?? false}
                                  onCheckedChange={(checked) =>
                                    handleCapabilityChange(model.id, "vision", checked === true)
                                  }
                                  disabled={isRecommended}
                                />
                                Vision
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={capabilities.thinking ?? false}
                                  onCheckedChange={(checked) =>
                                    handleCapabilityChange(model.id, "thinking", checked === true)
                                  }
                                  disabled={isRecommended}
                                />
                                Thinking
                              </label>
                            </div>
                            {isRecommended && (
                              <p className="text-muted-foreground mt-2 text-xs">
                                Capabilities are preset for recommended models.
                              </p>
                            )}
                          </div>
                        );
                      })()}

                    {/* Fetch error */}
                    {fetchError && <p className="text-destructive text-xs">{fetchError}</p>}
                  </div>
                </div>
              )}

              {/* Custom Base URL Section */}
              {supportsCustomUrl && customUrlField && (
                <div className="bg-muted/40 rounded-lg p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`baseurl-${provider.id}`} className="text-sm font-medium">
                        {customUrlField.label}
                      </Label>
                      {customUrlField.helpUrl && (
                        <a
                          href={customUrlField.helpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
                        >
                          Learn more
                          <Icons.ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`baseurl-${provider.id}`}
                        type="url"
                        value={customUrlValue}
                        onChange={(e) => setCustomUrlValue(e.target.value)}
                        placeholder={customUrlField.placeholder}
                        className="bg-background flex-1 font-mono text-sm"
                      />
                      <Button
                        onClick={() => onCustomUrlChange?.(customUrlValue)}
                        size="default"
                        className="shrink-0"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Access Section */}
              {onToolsAllowlistChange && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Data Access</Label>
                    <span className="text-muted-foreground text-xs">
                      What data the AI can access
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {DATA_ACCESS_OPTIONS.map((option) => {
                      const isEnabled = isToolEnabled(option.toolId);
                      return (
                        <button
                          key={option.toolId}
                          type="button"
                          onClick={() => handleToolToggle(option.toolId, !isEnabled)}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all",
                            isEnabled
                              ? "border-primary/30 bg-primary/5"
                              : "bg-muted/40 hover:bg-muted/60 border-transparent",
                          )}
                        >
                          <div
                            className={cn(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
                              isEnabled
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isEnabled && <Icons.Check className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium">{option.label}</span>
                            <p className="text-muted-foreground mt-0.5 text-xs leading-tight">
                              {option.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
