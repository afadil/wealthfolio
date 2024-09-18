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
        className: 'bg-[#cbd492] text-white border-none',
      });
    },
    onError: (e) => {
      console.error(e);
      queryClient.invalidateQueries();
      toast({
        title: errorTitle,
        description: 'Please try refreshing the page or relaunching the app.',
        className: 'bg-yellow-500 text-white border-none',
      });
    },
  });
}
