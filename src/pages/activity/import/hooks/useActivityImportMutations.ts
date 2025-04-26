import { useMutation } from '@tanstack/react-query';
import { logger } from '@/adapters';
import { importActivities } from '@/commands/activity-import';
import { toast } from '@/components/ui/use-toast';

export function useActivityImportMutations({
  onSuccess,
  onError,
}: {
  onSuccess?: (activities: any[]) => void;
  onError?: (error: string) => void;
} = {}) {

  const confirmImportMutation = useMutation({
    mutationFn: importActivities,
    onSuccess: async (result: any) => {
      // Call the provided onSuccess callback if it exists
      if (onSuccess) {
        // Ensure we pass an array of activities to the callback
        const activities = Array.isArray(result) ? result : [result];
        onSuccess(activities);
        toast({
          title: 'Import successful',
          description: 'Activities have been imported successfully.',
        });
      }
    },
    onError: (error: any) => {
      logger.error(`Error confirming import: ${error}`);

      // Call the provided onError callback if it exists
      if (onError) {
        onError(error.message || 'An error occurred during import');
      } else {
        toast({
          title: 'Uh oh! Something went wrong.',
          description: 'Please try again or report an issue if the problem persists.',
          variant: 'destructive',
        });
      }
    },
  });

  return {
    confirmImportMutation,
  };
}
