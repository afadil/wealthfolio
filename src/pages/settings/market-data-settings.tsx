import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from './header';
import { Icons } from '@/components/icons';
import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

// Interface matching the backend struct
interface MarketDataProviderSetting {
  id: string;
  name: string;
  apiKeyVaultPath: string | null;
  priority: number;
  enabled: boolean;
  logoFilename: string | null;
}

export default function MarketDataSettingsPage() {
  const [providers, setProviders] = useState<MarketDataProviderSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKeysInput, setApiKeysInput] = useState<{ [providerId: string]: string }>({});
  const [showApiKey, setShowApiKey] = useState<{ [providerId: string]: boolean }>({});
  // For priority, we can use a temporary state if we want a "Save" button,
  // or directly use the provider's priority and update onBlur.
  // For simplicity, we'll use a controlled input that updates on blur.
  const [priorityInputs, setPriorityInputs] = useState<{ [providerId: string]: number }>({});


  const fetchProviderSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedProviders = await invoke<MarketDataProviderSetting[]>(
        'get_market_data_providers_settings',
      );
      setProviders(fetchedProviders);
      const initialApiKeysInput: { [key: string]: string } = {};
      const initialShowApiKey: { [key: string]: boolean } = {};
      const initialPriorityInputs: { [key: string]: number } = {};
      fetchedProviders.forEach((p) => {
        initialApiKeysInput[p.id] = '';
        initialShowApiKey[p.id] = false;
        initialPriorityInputs[p.id] = p.priority;
      });
      setApiKeysInput(initialApiKeysInput);
      setShowApiKey(initialShowApiKey);
      setPriorityInputs(initialPriorityInputs);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      toast.error(`Failed to load provider settings: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviderSettings();
  }, [fetchProviderSettings]);

  const handleUpdateSetting = async (
    providerId: string,
    settingsToUpdate: { apiKey?: string | null; priority?: number; enabled?: boolean },
  ) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    // Use current provider values as defaults if not specified in settingsToUpdate
    const payload = {
      providerId,
      apiKey: 'apiKey' in settingsToUpdate ? settingsToUpdate.apiKey : undefined, // Will be Some(value) or None if not present
      priority: settingsToUpdate.priority ?? provider.priority,
      enabled: settingsToUpdate.enabled ?? provider.enabled,
    };
    
    try {
      await invoke('update_market_data_provider_settings', payload);
      toast.success(`${provider.name} settings updated successfully.`);
      await fetchProviderSettings(); 
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to update ${provider.name} settings: ${errMsg}`);
    }
  };
  
  const handleApiKeyInputChange = (providerId: string, value: string) => {
    setApiKeysInput((prev) => ({ ...prev, [providerId]: value }));
  };

  const handleSaveApiKey = (providerId: string) => {
    const apiKeyToSave = apiKeysInput[providerId];
    // If apiKeyToSave is empty string, it means user wants to clear/remove the key.
    // The backend expects Option<String>, so sending `null` for empty string is appropriate.
    handleUpdateSetting(providerId, { apiKey: apiKeyToSave === '' ? null : apiKeyToSave });
    // Clear the input field after attempting to save, as the new state will be fetched
    setApiKeysInput((prev) => ({ ...prev, [providerId]: '' }));
  };

  const toggleShowApiKey = (providerId: string) => {
    setShowApiKey((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handlePriorityInputChange = (providerId: string, value: string) => {
    const numValue = parseInt(value, 10);
    setPriorityInputs((prev) => ({ ...prev, [providerId]: isNaN(numValue) ? 0 : numValue }));
  };

  const handlePrioritySave = (providerId: string) => {
    const newPriority = priorityInputs[providerId];
    const provider = providers.find(p => p.id === providerId);
    if (provider && newPriority !== provider.priority) {
        handleUpdateSetting(providerId, { priority: newPriority });
    }
  };


  if (isLoading) return <p>Loading provider settings...</p>;
  if (error) return <p className="text-destructive">Error loading settings: {error}</p>;

  return (
    <div className="space-y-6 text-foreground">
      <SettingsHeader
        heading="Market Data Providers"
        text="Manage settings for your market data providers."
      />
      <Separator />
      <div>
        {providers.length === 0 ? (
          <p>No market data providers configured. This might be an initialization issue.</p>
        ) : (
          <div className="mt-4 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            {providers.map((provider) => (
              <Card key={provider.id}>
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    {provider.logoFilename && (
                      <img
                        src={`/market-data/${provider.logoFilename}`}
                        alt={`${provider.name} logo`}
                        className="h-10 w-10 rounded-md object-contain"
                      />
                    )}
                    <CardTitle>{provider.name}</CardTitle>
                  </div>
                  <CardDescription>
                    Configure {provider.name} settings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between space-x-2">
                    <Label htmlFor={`enabled-${provider.id}`} className="flex flex-col space-y-1">
                      <span>Enable Provider</span>
                      <span className="text-xs font-normal leading-snug text-muted-foreground">
                        Allow fetching data from {provider.name}.
                      </span>
                    </Label>
                    <Switch
                      id={`enabled-${provider.id}`}
                      checked={provider.enabled}
                      onCheckedChange={(checked) =>
                        handleUpdateSetting(provider.id, { enabled: checked })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`apikey-${provider.id}`}>API Key</Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        id={`apikey-${provider.id}`}
                        type={showApiKey[provider.id] ? 'text' : 'password'}
                        value={apiKeysInput[provider.id] ?? ''}
                        onChange={(e) => handleApiKeyInputChange(provider.id, e.target.value)}
                        placeholder={provider.apiKeyVaultPath && !apiKeysInput[provider.id] ? 'API Key is Set' : 'Enter API Key'}
                        className="flex-grow"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => toggleShowApiKey(provider.id)}
                        aria-label={showApiKey[provider.id] ? 'Hide API key' : 'Show API key'}
                      >
                        {showApiKey[provider.id] ? (
                          <EyeOffIcon className="h-4 w-4" />
                        ) : (
                          <EyeIcon className="h-4 w-4" />
                        )}
                      </Button>
                      <Button onClick={() => handleSaveApiKey(provider.id)} size="sm">
                        <Icons.Save className="mr-2 h-4 w-4" /> Save Key
                      </Button>
                    </div>
                     {provider.apiKeyVaultPath && !apiKeysInput[provider.id] && (
                        <p className="text-xs text-muted-foreground">
                          An API key is set. Enter a new key to update, or leave blank and save to clear the key.
                        </p>
                      )}
                       {!provider.apiKeyVaultPath && !apiKeysInput[provider.id] && (
                        <p className="text-xs text-muted-foreground">
                          No API key set. Enter a key and save.
                        </p>
                      )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`priority-${provider.id}`}>Priority</Label>
                    <div className="flex items-center space-x-2">
                       <Input
                        id={`priority-${provider.id}`}
                        type="number"
                        value={priorityInputs[provider.id] ?? 0}
                        onChange={(e) => handlePriorityInputChange(provider.id, e.target.value)}
                        onBlur={() => handlePrioritySave(provider.id)}
                        placeholder="e.g., 1 or 2"
                        className="w-32" 
                      />
                    </div>
                     <p className="text-xs text-muted-foreground">
                        Lower number means higher priority (e.g., 1 is higher than 10).
                      </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}