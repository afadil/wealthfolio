import { useMutation } from '@tanstack/react-query';
import { checkActivitiesImport, createActivities } from '@/commands/activity';
import { ActivityImport } from '@/lib/types';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { toast } from '@/components/ui/use-toast';

export function useActivityImportMutations(
  onSuccess?: (activities: ActivityImport[]) => void,
  onError?: (error: string) => void,
) {
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Account updated successfully.',
  });

  const checkImportMutation = useMutation({
    mutationFn: checkActivitiesImport,
    onSuccess,
    onError,
  });

  const confirmImportMutation = useMutation({
    mutationFn: createActivities,
    onSuccess: () => {
      toast({
        title: 'Activities imported successfully',
        variant: 'success',
      });
      calculateHistoryMutation.mutate({
        accountIds: undefined,
        forceFullCalculation: true,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Uh oh! Something went wrong.',
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
      return error;
    },
  });

  return {
    checkImportMutation,
    confirmImportMutation,
  };
}
