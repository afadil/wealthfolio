import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import {
  getMarketDataProviderSettings,
  updateMarketDataProviderSettings,
} from '@/commands/market-data';
import { setApiKey, deleteApiKey } from '@/commands/secrets';
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });
      toast({
        title: `${data.name} settings updated successfully.`,
        variant: 'success',
      });
    },
    onError: (error, variables) => {
      toast({
        title: `Failed to update settings for provider ${variables.providerId}`,
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useSetApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variables: { providerId: string; apiKey: string }) =>
      setApiKey(variables.providerId, variables.apiKey),
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
    mutationFn: async (variables: { providerId: string }) => deleteApiKey(variables.providerId),
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