import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAccountStatus } from "../lib/adanos-client";
import {
  clearStoredAccountStatus,
  loadStoredAccountStatus,
  saveStoredAccountStatus,
} from "../lib/account-status-storage";

export function getAccountStatusQueryKey(apiKey: string | null) {
  return ["adanos-account-status", apiKey ? apiKey.slice(-6) : "missing"] as const;
}

export function useAdanosAccountStatus(apiKey: string | null) {
  const queryClient = useQueryClient();
  const queryKey = getAccountStatusQueryKey(apiKey);

  const query = useQuery({
    queryKey,
    queryFn: async () => loadStoredAccountStatus(apiKey),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (nextApiKey?: string | null) => {
      const effectiveApiKey = nextApiKey?.trim() || apiKey;

      if (!effectiveApiKey) {
        return null;
      }

      const status = await fetchAccountStatus(effectiveApiKey);
      saveStoredAccountStatus(effectiveApiKey, status);
      return status;
    },
  });

  const clearStatus = () => {
    clearStoredAccountStatus();
    queryClient.removeQueries({ queryKey: ["adanos-account-status"] });
  };

  const refreshStatus = async (nextApiKey?: string | null) => {
    const effectiveApiKey = nextApiKey?.trim() || apiKey;
    const status = await mutation.mutateAsync(nextApiKey);
    queryClient.setQueryData(getAccountStatusQueryKey(effectiveApiKey ?? null), status);
    return status;
  };

  return {
    accountStatus: query.data ?? null,
    isLoading: query.isLoading,
    isRefreshing: mutation.isPending,
    error: mutation.error as Error | null,
    refreshAccountStatus: refreshStatus,
    clearAccountStatus: clearStatus,
  };
}
