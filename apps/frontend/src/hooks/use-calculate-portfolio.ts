import i18n from "@/i18n/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { updatePortfolio, recalculatePortfolio } from "@/adapters";
import { logger } from "@/adapters";

export function useUpdatePortfolioMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePortfolio,
    onError: (error) => {
      queryClient.invalidateQueries();
      toast({
        title: i18n.t("toast.portfolio.update_failed_title"),
        description: i18n.t("toast.portfolio.update_failed_description"),
        variant: "destructive",
      });
      logger.error(`Error calculating historical data: ${String(error)}`);
    },
  });
}

export function useRecalculatePortfolioMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recalculatePortfolio,
    onError: (error) => {
      queryClient.invalidateQueries();
      toast({
        title: i18n.t("toast.portfolio.recalculate_failed_title"),
        description: i18n.t("toast.portfolio.update_failed_description"),
        variant: "destructive",
      });
      console.warn("Error recalculating portfolio:", error);
      logger.error(`Error recalculating portfolio: ${String(error)}`);
    },
  });
}
