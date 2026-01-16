import { useState, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wealthfolio/ui/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  MergedProvider,
  MergedModel,
  FetchedModel,
  ModelCapabilityOverrides,
} from "../types";

interface ProviderSettingsCardProps {
  provider: MergedProvider;
  priorityValue: number;
  onToggleEnabled: (enabled: boolean) => void;
  onSetDefault: () => void;
  onSaveApiKey: (apiKey: string) => void;
  onDeleteApiKey: () => void;
  onRevealApiKey: () => Promise<string | null>;
  onPriorityChange: (value: number) => void;
  onCustomUrlChange?: (url: string) => void;
  onSelectModel?: (modelId: string) => void;
  onFetchModels?: () => Promise<FetchedModel[]>;
  onSetFavoriteModels?: (modelIds: string[]) => void;
  onSetCapabilityOverride?: (modelId: string, overrides: ModelCapabilityOverrides | null) => void;
  isLast?: boolean;
}

export function ProviderSettingsCard({
  provider,
  priorityValue,
  onToggleEnabled,
  onSetDefault,
  onSaveApiKey,
  onDeleteApiKey,
  onRevealApiKey,
  onPriorityChange,
  onCustomUrlChange,
  onSelectModel,
  onFetchModels,
  onSetFavoriteModels,
  onSetCapabilityOverride,
  isLast = false,
}: ProviderSettingsCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [hasLoadedKey, setHasLoadedKey] = useState(false);
  const [customUrlValue, setCustomUrlValue] = useState(provider.customUrl ?? "");
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editingCapabilities, setEditingCapabilities] = useState<string | null>(null);

  // Check if provider supports custom base URL
  const supportsCustomUrl = provider.connectionFields?.some(
    (field) => field.key === "baseUrl" || field.key === "customUrl"
  );
  const customUrlField = provider.connectionFields?.find(
    (field) => field.key === "baseUrl" || field.key === "customUrl"
  );

  // Combine catalog models with fetched models
  const allModels = useMemo(() => {
    const catalogModelIds = new Set(provider.models.map((m) => m.id));
    const combined: (MergedModel | (FetchedModel & { isFetched: true }))[] = [...provider.models];

    // Add fetched models that aren't in catalog
    for (const fetched of fetchedModels) {
      if (!catalogModelIds.has(fetched.id)) {
        combined.push({
          ...fetched,
          isFetched: true,
        } as FetchedModel & { isFetched: true });
      }
    }

    return combined;
  }, [provider.models, fetchedModels]);

  // Get current selected model info
  const selectedModel = provider.selectedModel ?? provider.defaultModel;
  const selectedModelInfo = allModels.find((m) => m.id === selectedModel);
  const isSelectedModelFromCatalog = selectedModelInfo && "isCatalog" in selectedModelInfo && selectedModelInfo.isCatalog;

  // Check if selected model has required capabilities (tools for AI assistant)
  const selectedModelCapabilities = selectedModelInfo && "capabilities" in selectedModelInfo
    ? selectedModelInfo.capabilities
    : provider.modelCapabilityOverrides[selectedModel] ?? null;

  const missingTools = selectedModelCapabilities && !selectedModelCapabilities.tools;

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
      setHasLoadedKey(true);
      setShowApiKey(true);
    } finally {
      setIsLoadingKey(false);
    }
  };

  const handleSaveApiKey = () => {
    if (apiKeyValue && apiKeyValue.trim() !== "") {
      onSaveApiKey(apiKeyValue);
    } else {
      onDeleteApiKey();
      setHasLoadedKey(false);
    }
  };

  const handleFetchModels = async () => {
    if (!onFetchModels) return;

    setIsFetchingModels(true);
    setFetchError(null);
    try {
      const models = await onFetchModels();
      setFetchedModels(models);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch models");
    } finally {
      setIsFetchingModels(false);
    }
  };

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
    capability: "tools" | "streaming" | "vision",
    value: boolean
  ) => {
    if (!onSetCapabilityOverride) return;

    const existingOverrides = provider.modelCapabilityOverrides[modelId] || {};
    const newOverrides: ModelCapabilityOverrides = {
      ...existingOverrides,
      [capability]: value,
    };
    onSetCapabilityOverride(modelId, newOverrides);
  };

  const handleClearCapabilityOverrides = (modelId: string) => {
    if (!onSetCapabilityOverride) return;
    onSetCapabilityOverride(modelId, null);
    setEditingCapabilities(null);
  };

  // Get provider icon
  const getProviderIcon = () => {
    switch (provider.type) {
      case "openai":
        return <Icons.Sparkles className="h-5 w-5" />;
      case "anthropic":
        return <Icons.Sparkles className="h-5 w-5" />;
      case "google":
        return <Icons.Google className="h-5 w-5" />;
      default:
        return <Icons.Globe className="h-5 w-5" />;
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("hover:bg-accent/30 transition-colors", !isLast && "border-b")}>
        {/* Main row */}
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Icon */}
          <div className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            {getProviderIcon()}
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
              {/* Capability warnings for selected model */}
              {provider.enabled && missingTools && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="border-destructive/20 bg-destructive/10 text-destructive shrink-0 text-xs"
                      >
                        <Icons.AlertTriangle className="mr-1 h-3 w-3" />
                        No Tools
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Selected model does not support tool calls.</p>
                      <p className="text-muted-foreground text-xs">AI assistant features may be limited.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
          <div className="bg-muted/30 border-t px-4 py-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left column - Models */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Models
                  </h4>
                  {provider.supportsModelListing && onFetchModels && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels || (!provider.hasApiKey && provider.type === "api")}
                    >
                      {isFetchingModels ? (
                        <>
                          <Icons.Spinner className="mr-1 h-3 w-3 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <Icons.RefreshCw className="mr-1 h-3 w-3" />
                          Fetch Models
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {fetchError && (
                  <p className="text-destructive text-xs">{fetchError}</p>
                )}

                {/* Model selector */}
                {onSelectModel && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Selected Model</Label>
                    <Select
                      value={selectedModel}
                      onValueChange={onSelectModel}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {allModels.map((model) => {
                          const isCatalog = "isCatalog" in model && model.isCatalog;
                          const displayName = model.name ?? model.id;
                          return (
                            <SelectItem key={model.id} value={model.id} className="text-xs">
                              <span className="flex items-center gap-2">
                                {displayName}
                                {!isCatalog && (
                                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                    Fetched
                                  </Badge>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {/* Warning for non-catalog models */}
                    {!isSelectedModelFromCatalog && selectedModel && (
                      <p className="text-muted-foreground text-xs">
                        <Icons.Info className="mr-1 inline h-3 w-3" />
                        Fetched model - set capabilities below if needed
                      </p>
                    )}
                  </div>
                )}

                {/* Model list with capabilities */}
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {allModels.slice(0, 10).map((model) => {
                    const isCatalog = "isCatalog" in model && model.isCatalog;
                    const capabilities = "capabilities" in model
                      ? model.capabilities
                      : provider.modelCapabilityOverrides[model.id];
                    const hasOverrides = provider.modelCapabilityOverrides[model.id] !== undefined;
                    const isFavorite = provider.favoriteModels?.includes(model.id);
                    const isEditing = editingCapabilities === model.id;

                    return (
                      <div
                        key={model.id}
                        className={cn(
                          "flex items-center justify-between rounded px-2 py-1.5 text-sm",
                          selectedModel === model.id && "bg-accent"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {onSetFavoriteModels && (
                            <button
                              onClick={() => handleToggleFavorite(model.id)}
                              className="text-muted-foreground hover:text-warning shrink-0"
                              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              {isFavorite ? (
                                <Icons.Star className="text-warning h-3.5 w-3.5 fill-current" />
                              ) : (
                                <Icons.Star className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <span className="truncate">{model.name ?? model.id}</span>
                          {!isCatalog && (
                            <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                              Fetched
                            </Badge>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {capabilities?.tools && (
                            <Badge variant="outline" className="h-5 px-1 text-[10px]">
                              Tools
                            </Badge>
                          )}
                          {capabilities?.vision && (
                            <Badge variant="outline" className="h-5 px-1 text-[10px]">
                              Vision
                            </Badge>
                          )}
                          {hasOverrides && (
                            <Badge variant="secondary" className="h-5 px-1 text-[10px]">
                              Custom
                            </Badge>
                          )}
                          {/* Edit capabilities for non-catalog models or any model with overrides */}
                          {(!isCatalog || hasOverrides) && onSetCapabilityOverride && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setEditingCapabilities(isEditing ? null : model.id)}
                            >
                              <Icons.Settings className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {allModels.length > 10 && (
                    <p className="text-muted-foreground px-2 text-xs">
                      +{allModels.length - 10} more models
                    </p>
                  )}
                </div>

                {/* Capability editor for selected model */}
                {editingCapabilities && onSetCapabilityOverride && (
                  <div className="bg-background space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">
                        Capabilities for {editingCapabilities}
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => handleClearCapabilityOverrides(editingCapabilities)}
                      >
                        Reset
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={provider.modelCapabilityOverrides[editingCapabilities]?.tools ?? false}
                          onCheckedChange={(checked) =>
                            handleCapabilityChange(editingCapabilities, "tools", checked === true)
                          }
                        />
                        Tools (function calling)
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={provider.modelCapabilityOverrides[editingCapabilities]?.streaming ?? true}
                          onCheckedChange={(checked) =>
                            handleCapabilityChange(editingCapabilities, "streaming", checked === true)
                          }
                        />
                        Streaming
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={provider.modelCapabilityOverrides[editingCapabilities]?.vision ?? false}
                          onCheckedChange={(checked) =>
                            handleCapabilityChange(editingCapabilities, "vision", checked === true)
                          }
                        />
                        Vision
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Right column - Settings */}
              <div className="space-y-4">
                <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Settings
                </h4>
                <div className="space-y-4">
                  {/* API Key */}
                  <div className="space-y-2">
                    <Label htmlFor={`apikey-${provider.id}`} className="text-xs font-medium">
                      API Key
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id={`apikey-${provider.id}`}
                        type={showApiKey ? "text" : "password"}
                        value={apiKeyValue}
                        onChange={(e) => setApiKeyValue(e.target.value)}
                        placeholder={hasLoadedKey ? "Enter API Key" : "Click eye to reveal"}
                        className="min-w-0 flex-1 font-mono text-xs"
                        disabled={!hasLoadedKey && !showApiKey}
                      />
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={handleRevealApiKey}
                          disabled={isLoadingKey}
                          aria-label={showApiKey ? "Hide API key" : "Show API key"}
                        >
                          {isLoadingKey ? (
                            <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
                          ) : showApiKey ? (
                            <Icons.EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Icons.Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button onClick={handleSaveApiKey} size="sm" className="h-8" disabled={!hasLoadedKey}>
                          Save
                        </Button>
                      </div>
                    </div>
                    {provider.documentationUrl && (
                      <a
                        href={provider.documentationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        Get API key
                        <Icons.ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {/* Base URL (for providers that support custom endpoints) */}
                  {supportsCustomUrl && customUrlField && (
                    <div className="space-y-2">
                      <Label htmlFor={`baseurl-${provider.id}`} className="text-xs font-medium">
                        {customUrlField.label}
                      </Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          id={`baseurl-${provider.id}`}
                          type="url"
                          value={customUrlValue}
                          onChange={(e) => setCustomUrlValue(e.target.value)}
                          placeholder={customUrlField.placeholder}
                          className="min-w-0 flex-1 font-mono text-xs"
                        />
                        <Button
                          onClick={() => onCustomUrlChange?.(customUrlValue)}
                          size="sm"
                          className="h-8 shrink-0"
                        >
                          Save
                        </Button>
                      </div>
                      {customUrlField.helpUrl && (
                        <a
                          href={customUrlField.helpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                        >
                          Learn more
                          <Icons.ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Priority */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Label className="text-xs font-medium">Priority</Label>
                    <div className="flex items-center">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-r-none"
                        onClick={() => onPriorityChange(Math.max(1, priorityValue - 1))}
                      >
                        <Icons.MinusCircle className="h-3 w-3" />
                      </Button>
                      <div className="bg-muted flex h-7 w-10 items-center justify-center border-y text-xs font-medium">
                        {priorityValue}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-l-none"
                        onClick={() => onPriorityChange(priorityValue + 1)}
                      >
                        <Icons.PlusCircle className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-muted-foreground text-[10px]">
                      Lower = higher priority
                    </span>
                  </div>

                  {/* Set as Default */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Label className="text-xs font-medium">Default Provider</Label>
                      <p className="text-muted-foreground text-xs">
                        Use this provider for new conversations
                      </p>
                    </div>
                    <Button
                      variant={provider.isDefault ? "secondary" : "outline"}
                      size="sm"
                      onClick={onSetDefault}
                      disabled={provider.isDefault || !provider.enabled}
                      className="shrink-0"
                    >
                      {provider.isDefault ? "Default" : "Set Default"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
