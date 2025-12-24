import { useMutation } from "@tanstack/react-query";
import { syncMarketData } from "@/commands/market-data";
import { useToast } from "@wealthfolio/ui/components/ui/use-toast";

export function useSyncMarketDataMutation(refetchAll = true) {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (symbols: string[]) => {
      await syncMarketData(symbols, refetchAll);
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
