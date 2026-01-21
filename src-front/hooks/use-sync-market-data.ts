import { useMutation } from "@tanstack/react-query";
import { syncMarketData } from "@/adapters";
import { useToast } from "@wealthfolio/ui/components/ui/use-toast";

export function useSyncMarketDataMutation(refetchAll = false, refetchRecentDays?: number) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (assetIds: string[]) => {
      await syncMarketData(assetIds, refetchAll, refetchRecentDays);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to sync market data",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
