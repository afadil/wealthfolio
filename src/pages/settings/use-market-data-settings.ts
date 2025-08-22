import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import {
  getMarketDataProviderSettings,
  updateMarketDataProviderSettings,
  MarketDataProviderSetting,
} from '@/commands/market-data';
import { setSecret, deleteSecret } from '@/commands/secrets';
import { toast } from '@/components/ui/use-toast';

export function useMarketDataProviderSettings() {
  return useQuery({
    queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS],
    queryFn: getMarketDataProviderSettings,
  });
}

export function useUpdateMarketDataProviderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: { providerId: string; priority: number; enabled: boolean }) =>
      updateMarketDataProviderSettings(variables),
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });

      // Snapshot the previous value
      const previousProviders = queryClient.getQueryData<MarketDataProviderSetting[]>([QueryKeys.MARKET_DATA_PROVIDER_SETTINGS]);

      // Optimistically update the cache
      queryClient.setQueryData<MarketDataProviderSetting[]>([QueryKeys.MARKET_DATA_PROVIDER_SETTINGS], (old) => {
        if (!old) return old;
        return old.map((provider) =>
          provider.id === variables.providerId
            ? { ...provider, priority: variables.priority, enabled: variables.enabled }
            : provider
        );
      });

      // Return a context object with the snapshotted value
      return { previousProviders };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });
      toast({
        title: `${data.name} settings updated successfully.`,
        variant: 'success',
      });
    },
    onError: (error, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousProviders) {
        queryClient.setQueryData([QueryKeys.MARKET_DATA_PROVIDER_SETTINGS], context.previousProviders);
      }
      toast({
        title: `Failed to update settings for provider ${variables.providerId}`,
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });
    },
  });
}

export function useSetApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: { providerId: string; apiKey: string }) =>
      setSecret(variables.providerId, variables.apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });
      toast({
        title: 'API Key saved successfully.',
        variant: 'success',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to save API key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: { providerId: string }) => deleteSecret(variables.providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });
      toast({
        title: 'API Key deleted successfully.',
        variant: 'success',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to delete API key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
} 