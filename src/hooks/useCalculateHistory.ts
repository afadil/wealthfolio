import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { calculateHistoricalData, recalculatePortfolio } from '@/commands/portfolio';
import { logger } from '@/adapters';

interface UseCalculateHistoryMutationOptions {
  successTitle?: string;
  errorTitle?: string;
}

export function useCalculateHistoryMutation({
  successTitle = 'Portfolio data updated successfully.',
  errorTitle = 'Failed to recalculate portfolio data.',
}: UseCalculateHistoryMutationOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: calculateHistoricalData,
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: successTitle,
        description:
          'Your portfolio data has been recalculated and updated with the latest information.',
        variant: 'success',
      });
    },
    onError: (error) => {
      queryClient.invalidateQueries();
      toast({
        title: errorTitle,
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
      logger.error(`Error calculating historical data: ${error}`);
    },
  });
}

export function useRecalculatePortfolioMutation({
  successTitle = 'Portfolio updated successfully.',
  errorTitle = 'Failed to recalculate portfolio.',
}: UseCalculateHistoryMutationOptions = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: recalculatePortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: successTitle,
        description: 'Your portfolio has been fully updated with the latest information.',
        variant: 'success',
      });
    },
    onError: (error) => {
      queryClient.invalidateQueries();
      toast({
        title: errorTitle,
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
      logger.error(`Error recalculating portfolio: ${error}`);
    },
  });
}
