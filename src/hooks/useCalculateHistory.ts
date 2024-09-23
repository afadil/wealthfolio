import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { calculate_historical_data } from '@/commands/portfolio';

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
    mutationFn: calculate_historical_data,
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
      console.error(error);
      toast({
        title: errorTitle,
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
    },
  });
}
