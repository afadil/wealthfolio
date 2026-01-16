import { useState } from "react";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { MergedProvider } from "../types";

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
  isLast = false,
}: ProviderSettingsCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [hasLoadedKey, setHasLoadedKey] = useState(false);
  const [customUrlValue, setCustomUrlValue] = useState(provider.customUrl ?? "");

  // Check if provider supports custom base URL
  const supportsCustomUrl = provider.connectionFields?.some(
    (field) => field.key === "baseUrl" || field.key === "customUrl"
  );
  const customUrlField = provider.connectionFields?.find(
    (field) => field.key === "baseUrl" || field.key === "customUrl"
  );

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

  // Get provider icon (placeholder - will use actual provider icons)
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
            <div className="flex items-center gap-2">
              <span className="font-medium">{provider.name}</span>
              {provider.isDefault && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                  Default
                </Badge>
              )}
              {provider.enabled && !provider.hasApiKey && (
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
          <div className="bg-muted/30 border-t px-4 py-4">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Left column - Models */}
              <div className="space-y-4">
                <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Available Models
                </h4>
                <div className="space-y-2">
                  {provider.models.slice(0, 5).map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate">{model.id}</span>
                      <div className="flex gap-1">
                        {model.capabilities.tools && (
                          <Badge variant="outline" className="h-5 px-1 text-[10px]">
                            Tools
                          </Badge>
                        )}
                        {model.capabilities.vision && (
                          <Badge variant="outline" className="h-5 px-1 text-[10px]">
                            Vision
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                  {provider.models.length > 5 && (
                    <p className="text-muted-foreground text-xs">
                      +{provider.models.length - 5} more models
                    </p>
                  )}
                </div>
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
