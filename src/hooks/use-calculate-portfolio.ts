import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { updatePortfolio, recalculatePortfolio } from '@/commands/portfolio';
import { logger } from '@/adapters';


export function useUpdatePortfolioMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePortfolio,
    onError: (error) => {
      queryClient.invalidateQueries();
      toast({
        title: 'Failed to update portfolio data.',
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
      logger.error(`Error calculating historical data: ${error}`);
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
        title: 'Failed to recalculate portfolio.',
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
      console.log('Error recalculating portfolio:', error);
      logger.error(`Error recalculating portfolio: ${error}`);
    },
  });
}
