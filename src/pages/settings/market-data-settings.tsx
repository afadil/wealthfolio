import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from './header';
import { Icons } from '@/components/ui/icons';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  useMarketDataProviderSettings,
  useUpdateMarketDataProviderSettings,
  useSetApiKey,
  useDeleteApiKey,
} from './use-market-data-settings';
import { MarketDataProviderSetting } from '@/commands/market-data';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { getSecret } from '@/commands/secrets';
import { QueryKeys } from '@/lib/query-keys';
import { useRecalculatePortfolioMutation, useUpdatePortfolioMutation } from '@/hooks/use-calculate-portfolio';
import { ActionConfirm } from '@wealthfolio/ui';

const useApiKeyStatus = (providerId: string) => {
  const queryClient = useQueryClient();
  const needsApiKey = providerId !== 'YAHOO' && providerId !== 'MANUAL';

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

  const [apiKeyValue, setApiKeyValue] = useState('');

  useEffect(() => {
    if (apiKey) {
      setApiKeyValue(apiKey);
    }
  }, [apiKey]);

  const handleSaveApiKey = () => {
    if (apiKeyValue && apiKeyValue.trim() !== '') {
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
        'transition-all duration-200',
        provider.enabled ? 'border-primary/20 bg-card shadow-sm' : 'border-muted bg-muted/50',
      )}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {provider.logoFilename && (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <img
                  src={`/market-data/${provider.logoFilename}`}
                  alt={`${provider.name} logo`}
                  className="h-10 w-10 rounded-md object-contain"
                />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg font-semibold">{provider.name}</CardTitle>
                {isConfigured ? (
                  <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                    Configured
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-orange-200 bg-orange-50 text-orange-700"
                  >
                    Not Configured
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1 text-xs">
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${provider.id}-enabled`} className="text-sm font-medium">
              Enable
            </Label>
            <Switch
              id={`${provider.id}-enabled`}
              checked={provider.enabled}
              onCheckedChange={(checked) => onUpdate({ enabled: checked })}
            />
          </div>
        </div>
      </CardHeader>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'h-auto w-full justify-between rounded-none border-t p-4',
              !provider.enabled && 'opacity-50',
            )}
            disabled={!provider.enabled}
          >
            <span className="text-sm font-medium">
              {provider.enabled ? 'Configure Settings' : 'Enable provider to configure'}
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
          <CardContent className="space-y-6 bg-muted/20 pb-6 pt-6">
            {needsApiKey && (
              <div className="space-y-2">
                <Label htmlFor={`apikey-${provider.id}`}>API Key</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id={`apikey-${provider.id}`}
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyValue ?? ''}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                    placeholder={isSecretSet && !apiKeyValue ? 'API Key is Set' : 'Enter API Key'}
                    className="flex-grow"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
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
                  <p className="text-xs text-muted-foreground">
                    An API key is set. Enter a new key to update, or leave blank and save to clear
                    the key.
                  </p>
                )}
                {!isSecretSet && !apiKeyValue && (
                  <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
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
  const { mutate: recalculatePortfolio, isPending: isRecalculating } = useRecalculatePortfolioMutation();

  const [priorityInputs, setPriorityInputs] = useState<{ [providerId: string]: number }>({});

  useEffect(() => {
    if (providers) {
      const initialPriorityInputs: { [key: string]: number } = {};
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
    <div className="space-y-6 text-foreground">
      <SettingsHeader heading="Market Data" text="Manage settings for your market data providers.">
        <div className="flex gap-2">
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
              <Button variant="outline" size="sm" disabled={isRecalculating}>
                {isRecalculating ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Clock className="mr-2 h-4 w-4" />
                )}
                Refetch all
              </Button>
            }
          />
          <Button size="sm" disabled={isUpdating} onClick={() => updatePortfolio()}>
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
              ?.sort((a, b) => a.priority - b.priority)
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
