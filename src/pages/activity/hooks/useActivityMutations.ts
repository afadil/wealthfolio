import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { createActivity, updateActivity, deleteActivity } from '@/commands/activity';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { newActivitySchema } from '@/lib/schemas';
import * as z from 'zod';
import { QueryKeys } from '@/lib/query-keys';

type ActivityFormValues = z.infer<typeof newActivitySchema>;

export function useActivityMutations(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Activity updated successfully.',
  });

  const createMutationOptions = (action: string) => ({
    onSuccess: (activity: { accountId?: string | null }) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
      calculateHistoryMutation.mutate({
        accountIds: activity.accountId ? [activity.accountId] : undefined,
        forceFullCalculation: true,
      });
      if (onSuccess) onSuccess();
    },
    onError: (error: string) => {
      toast({
        title: `Uh oh! Something went wrong ${action} this activity.`,
        description: `Please try again or report an issue if the problem persists. Error: ${error}`,
        variant: 'destructive',
      });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: createActivity,
    ...createMutationOptions('adding'),
  });

  const updateActivityMutation = useMutation({
    mutationFn: updateActivity,
    ...createMutationOptions('updating'),
  });

  const deleteActivityMutation = useMutation({
    mutationFn: deleteActivity,
    ...createMutationOptions('deleting'),
  });

  const submitActivity = async (data: ActivityFormValues) => {
    const { id, ...rest } = data;
    if (id) {
      return await updateActivityMutation.mutateAsync({ id, ...rest });
    }
    return await addActivityMutation.mutateAsync(rest);
  };

  return {
    addActivityMutation,
    updateActivityMutation,
    deleteActivityMutation,
    submitActivity,
  };
}
