import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { SettingsHeader } from "../settings-header";

import { MarketDataProviderSetting } from "@/commands/market-data";
import { getSecret } from "@/commands/secrets";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  useRecalculatePortfolioMutation,
  useUpdatePortfolioMutation,
} from "@/hooks/use-calculate-portfolio";
import { QueryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { ActionConfirm } from "@wealthfolio/ui";
import {
  useDeleteApiKey,
  useMarketDataProviderSettings,
  useSetApiKey,
  useUpdateMarketDataProviderSettings,
} from "./use-market-data-settings";

const useApiKeyStatus = (providerId: string) => {
  const queryClient = useQueryClient();
  const needsApiKey = providerId !== "YAHOO" && providerId !== "MANUAL";

  const { data: apiKey, isLoading } = useQuery({
    queryKey: QueryKeys.secrets.apiKey(providerId),
    queryFn: () => getSecret(providerId),
    enabled: needsApiKey,
    staleTime: Infinity,
  });

  const isSecretSet = !!apiKey;

  const invalidateApiKeyStatus = () => {
    queryClient.invalidateQueries({ queryKey: QueryKeys.secrets.apiKey(providerId) });
  };

  return { apiKey, isSecretSet, isLoading, needsApiKey, invalidateApiKeyStatus };
};

interface ProviderSettingsProps {
  provider: MarketDataProviderSetting;
  priorityValue: number;
  onUpdate: (settings: { priority?: number; enabled?: boolean }) => void;
  onPriorityChange: (value: string) => void;
  onPrioritySave: () => void;
}

function ProviderSettings({
  provider,
  priorityValue,
  onUpdate,
  onPriorityChange,
  onPrioritySave,
}: ProviderSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const { apiKey, isSecretSet, needsApiKey, invalidateApiKeyStatus } = useApiKeyStatus(provider.id);
  const { mutate: setApiKey } = useSetApiKey();
  const { mutate: deleteApiKey } = useDeleteApiKey();

  const [apiKeyValue, setApiKeyValue] = useState("");

  useEffect(() => {
    if (apiKey) {
      setApiKeyValue(apiKey);
    }
  }, [apiKey]);

  const handleSaveApiKey = () => {
    if (apiKeyValue && apiKeyValue.trim() !== "") {
      setApiKey(
        { providerId: provider.id, apiKey: apiKeyValue },
        {
          onSuccess: () => invalidateApiKeyStatus(),
        },
      );
    } else {
      deleteApiKey(
        { providerId: provider.id },
        {
          onSuccess: () => invalidateApiKeyStatus(),
        },
      );
    }
  };

  const isConfigured = !needsApiKey || isSecretSet;

  return (
    <Card
      key={provider.id}
      className={cn(
        "group rounded-lg border transition-all duration-200",
        provider.enabled
          ? "bg-card hover:bg-accent/30 hover:shadow-md"
          : "bg-muted/30 border-dashed opacity-75 hover:opacity-90",
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            {/* Header section with name and logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {provider.logoFilename && (
                  <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-xl">
                    <img
                      src={`/market-data/${provider.logoFilename}`}
                      alt={`${provider.name} logo`}
                      className="h-10 w-10 rounded-md object-contain"
                    />
                  </div>
                )}
                <CardTitle
                  className={`truncate text-lg font-semibold ${
                    provider.enabled ? "" : "text-muted-foreground"
                  }`}
                >
                  {provider.name}
                </CardTitle>
              </div>
              {!provider.enabled && (
                <Badge
                  variant="secondary"
                  className="border-warning/20 bg-warning/10 text-warning shrink-0 text-xs"
                >
                  <Icons.AlertCircle className="mr-1 h-3 w-3" />
                  Disabled
                </Badge>
              )}
              {!isConfigured && provider.enabled && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full text-amber-500 hover:bg-amber-50 hover:text-amber-600"
                    >
                      <Icons.AlertTriangle className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <h4 className="flex items-center gap-2 font-medium">
                          <Icons.AlertTriangle className="h-4 w-4 text-amber-500" />
                          Configuration Required
                        </h4>
                        <p className="text-muted-foreground text-sm">
                          This provider requires an API key to function properly. Configure the API
                          key in the settings below to start fetching market data.
                        </p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Description */}
            {provider.description && (
              <CardDescription
                className={`text-sm leading-relaxed ${
                  provider.enabled ? "text-muted-foreground" : "text-muted-foreground/70"
                }`}
              >
                {provider.description}
                {provider.url && (
                  <div className="mt-1">
                    <a
                      href={provider.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {provider.url}
                    </a>
                  </div>
                )}
              </CardDescription>
            )}
          </div>

          {/* Controls section */}
          <div className="ml-6 flex items-center gap-2">
            <div className="mr-2 flex items-center gap-3">
              <Switch
                id={`${provider.id}-enabled`}
                checked={provider.enabled}
                onCheckedChange={(checked) => onUpdate({ enabled: checked })}
                className="data-[state=checked]:bg-green-600"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-auto w-full justify-between rounded-none border-t p-4",
              !provider.enabled && "opacity-50",
            )}
            disabled={!provider.enabled}
          >
            <span className="text-sm font-medium">
              {provider.enabled ? "Configure Settings" : "Enable provider to configure"}
            </span>
            {provider.enabled &&
              (isOpen ? (
                <Icons.ChevronUp className="h-4 w-4" />
              ) : (
                <Icons.ChevronDown className="h-4 w-4" />
              ))}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="bg-muted/20 space-y-6 pt-6 pb-6">
            {needsApiKey && (
              <div className="space-y-2">
                <Label htmlFor={`apikey-${provider.id}`}>API Key</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id={`apikey-${provider.id}`}
                    type={showApiKey ? "text" : "password"}
                    value={apiKeyValue ?? ""}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                    placeholder={isSecretSet && !apiKeyValue ? "API Key is Set" : "Enter API Key"}
                    className="grow"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? (
                      <Icons.EyeOff className="h-4 w-4" />
                    ) : (
                      <Icons.Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button onClick={handleSaveApiKey} size="sm">
                    <Icons.Save className="mr-2 h-4 w-4" /> Save Key
                  </Button>
                </div>
                {isSecretSet && !apiKeyValue && (
                  <p className="text-muted-foreground text-xs">
                    An API key is set. Enter a new key to update, or leave blank and save to clear
                    the key.
                  </p>
                )}
                {!isSecretSet && !apiKeyValue && (
                  <p className="text-muted-foreground text-xs">
                    No API key set. Enter a key and save.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`priority-${provider.id}`}>Priority</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id={`priority-${provider.id}`}
                  type="number"
                  value={priorityValue ?? 0}
                  onChange={(e) => onPriorityChange(e.target.value)}
                  onBlur={onPrioritySave}
                  placeholder="e.g., 1 or 2"
                  className="w-32"
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Lower number means higher priority (e.g., 1 is higher than 10).
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function MarketDataSettingsPage() {
  const { data: providers, isLoading, error } = useMarketDataProviderSettings();
  const { mutate: updateSettings } = useUpdateMarketDataProviderSettings();
  const { mutate: updatePortfolio, isPending: isUpdating } = useUpdatePortfolioMutation();
  const { mutate: recalculatePortfolio, isPending: isRecalculating } =
    useRecalculatePortfolioMutation();

  const [priorityInputs, setPriorityInputs] = useState<Record<string, number>>({});

  useEffect(() => {
    if (providers) {
      const initialPriorityInputs: Record<string, number> = {};
      providers.forEach((p: MarketDataProviderSetting) => {
        initialPriorityInputs[p.id] = p.priority;
      });
      setPriorityInputs(initialPriorityInputs);
    }
  }, [providers]);

  const handleUpdateSetting = (
    providerId: string,
    settingsToUpdate: { priority?: number; enabled?: boolean },
  ) => {
    const provider = providers?.find((p) => p.id === providerId);
    if (!provider) return;

    updateSettings({
      providerId,
      priority: settingsToUpdate.priority ?? provider.priority,
      enabled: settingsToUpdate.enabled ?? provider.enabled,
    });
  };

  const handlePriorityInputChange = (providerId: string, value: string) => {
    const numValue = parseInt(value, 10);
    setPriorityInputs((prev) => ({ ...prev, [providerId]: isNaN(numValue) ? 0 : numValue }));
  };

  const handlePrioritySave = (providerId: string) => {
    const newPriority = priorityInputs[providerId];
    const provider = providers?.find((p) => p.id === providerId);
    if (provider && newPriority !== provider.priority) {
      handleUpdateSetting(providerId, { priority: newPriority });
    }
  };

  if (isLoading) return <p>Loading provider settings...</p>;
  if (error) return <p className="text-destructive">Error loading settings: {error.message}</p>;

  return (
    <div className="text-foreground space-y-6">
      <SettingsHeader heading="Market Data" text="Manage settings for your market data providers.">
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="sm:hidden"
            aria-label="Import quotes"
          >
            <Link to="/settings/market-data/import">
              <Icons.Import className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            aria-label="Import historical quotes"
          >
            <Link to="/settings/market-data/import">
              <Icons.Import className="mr-2 h-4 w-4" />
              Import
            </Link>
          </Button>
          {/* Mobile icon-only actions */}
          <ActionConfirm
            handleConfirm={() => recalculatePortfolio()}
            isPending={isRecalculating}
            confirmTitle="Are you sure?"
            confirmMessage="This will refetch all market data history and recalculate the portfolio."
            confirmButtonText="Refetch"
            pendingText="Refetching..."
            cancelButtonText="Cancel"
            confirmButtonVariant="destructive"
            button={
              <Button
                variant="outline"
                size="icon"
                className="sm:hidden"
                disabled={isRecalculating}
                aria-label="Refetch all"
              >
                {isRecalculating ? (
                  <Icons.Spinner className="h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Clock className="h-4 w-4" />
                )}
              </Button>
            }
          />
          <Button
            size="icon"
            className="sm:hidden"
            disabled={isUpdating}
            onClick={() => updatePortfolio()}
            aria-label="Update"
          >
            {isUpdating ? (
              <Icons.Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <Icons.Refresh className="h-4 w-4" />
            )}
          </Button>

          {/* Desktop buttons with labels */}
          <ActionConfirm
            handleConfirm={() => recalculatePortfolio()}
            isPending={isRecalculating}
            confirmTitle="Are you sure?"
            confirmMessage="This will refetch all market data history and recalculate the portfolio."
            confirmButtonText="Refetch"
            pendingText="Refetching..."
            cancelButtonText="Cancel"
            confirmButtonVariant="destructive"
            button={
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                disabled={isRecalculating}
              >
                {isRecalculating ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Clock className="mr-2 h-4 w-4" />
                )}
                Refetch all
              </Button>
            }
          />
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            disabled={isUpdating}
            onClick={() => updatePortfolio()}
          >
            {isUpdating ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Refresh className="mr-2 h-4 w-4" />
            )}
            Update
          </Button>
        </div>
      </SettingsHeader>
      <Separator />
      <div>
        {providers?.length === 0 ? (
          <p>No market data providers configured. This might be an initialization issue.</p>
        ) : (
          <div className="space-y-6">
            {providers
              ?.slice()
              .sort((a, b) => {
                // Enabled providers first, then by priority ascending
                if (a.enabled === b.enabled) {
                  return a.priority - b.priority;
                }
                return a.enabled ? -1 : 1;
              })
              .map((provider) => (
                <ProviderSettings
                  key={provider.id}
                  provider={provider}
                  priorityValue={priorityInputs[provider.id]}
                  onUpdate={(settings) => handleUpdateSetting(provider.id, settings)}
                  onPriorityChange={(value) => handlePriorityInputChange(provider.id, value)}
                  onPrioritySave={() => handlePrioritySave(provider.id)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
