import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddonContext } from "@wealthfolio/addon-sdk";

const SECRET_KEY = "adanos-api-key";

export function useAdanosApiKey(ctx: AddonContext) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["adanos-api-key"],
    queryFn: async () => ctx.api.secrets.get(SECRET_KEY),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (apiKey: string | null) => {
      if (apiKey && apiKey.trim()) {
        await ctx.api.secrets.set(SECRET_KEY, apiKey.trim());
        return apiKey.trim();
      }

      await ctx.api.secrets.delete(SECRET_KEY);
      return null;
    },
    onSuccess: (apiKey) => {
      queryClient.setQueryData(["adanos-api-key"], apiKey);
      ctx.api.logger.debug("Adanos API key updated");
    },
    onError: (error) => {
      ctx.api.logger.error("Failed to store Adanos API key: " + (error as Error).message);
    },
  });

  return {
    apiKey: query.data ?? null,
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    saveApiKey: mutation.mutateAsync,
  };
}
