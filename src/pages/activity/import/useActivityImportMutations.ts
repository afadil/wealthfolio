import { useMutation, useQueryClient } from '@tanstack/react-query';
import { checkActivitiesImport, createActivities } from '@/commands/activity-import';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { toast } from '@/components/ui/use-toast';
import { QueryKeys } from '@/lib/query-keys';

export function useActivityImportMutations() {
  const queryClient = useQueryClient();

  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Activities imported successfully.',
  });

  const checkImportMutation = useMutation({
    mutationFn: checkActivitiesImport,
    onError: (error: any) => {
      toast({
        title: 'Error checking import',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const confirmImportMutation = useMutation({
    mutationFn: createActivities,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
      calculateHistoryMutation.mutate({
        accountIds: undefined,
        forceFullCalculation: true,
      });
      toast({
        title: 'Import successful',
        description: 'Activities have been imported successfully.',
      });
    },
    onError: (error: any) => {
      console.log('error', error);
      toast({
        title: 'Uh oh! Something went wrong.',
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
    },
  });

  return {
    checkImportMutation,
    confirmImportMutation,
  };
}
