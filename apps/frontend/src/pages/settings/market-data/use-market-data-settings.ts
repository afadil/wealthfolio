import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  setSecret,
  deleteSecret,
  getMarketDataProviderSettings,
  updateMarketDataProviderSettings,
  type MarketDataProviderSetting,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

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
      await queryClient.cancelQueries({ queryKey: [QueryKeys.CUSTOM_PROVIDERS] });

      // Snapshot the previous values
      const previousProviders = queryClient.getQueryData<MarketDataProviderSetting[]>([
        QueryKeys.MARKET_DATA_PROVIDER_SETTINGS,
      ]);
      const previousCustom = queryClient.getQueryData([QueryKeys.CUSTOM_PROVIDERS]);

      // Optimistically update the provider settings cache
      queryClient.setQueryData<MarketDataProviderSetting[]>(
        [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS],
        (old) => {
          if (!old) return old;
          return old.map((provider) =>
            provider.id === variables.providerId
              ? { ...provider, priority: variables.priority, enabled: variables.enabled }
              : provider,
          );
        },
      );

      // Optimistically update the custom providers cache
      queryClient.setQueryData<{ id: string; enabled: boolean }[]>(
        [QueryKeys.CUSTOM_PROVIDERS],
        (old) => {
          if (!old) return old;
          return old.map((cp) =>
            cp.id === variables.providerId ? { ...cp, enabled: variables.enabled } : cp,
          );
        },
      );

      return { previousProviders, previousCustom };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });
    },
    onError: (error, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousProviders) {
        queryClient.setQueryData(
          [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS],
          context.previousProviders,
        );
      }
      if (context?.previousCustom) {
        queryClient.setQueryData([QueryKeys.CUSTOM_PROVIDERS], context.previousCustom);
      }
      toast({
        title: `Failed to update settings for provider ${variables.providerId}`,
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: [QueryKeys.MARKET_DATA_PROVIDER_SETTINGS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.CUSTOM_PROVIDERS] });
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
    },
    onError: (error) => {
      toast({
        title: "Failed to save API key",
        description: error.message,
        variant: "destructive",
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
    },
    onError: (error) => {
      toast({
        title: "Failed to delete API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
