import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { createActivity, updateActivity, deleteActivity } from '@/commands/activity';
import { logger } from '@/adapters';
import { NewActivityFormValues } from '../components/forms/schemas';
import { QueryKeys } from '@/lib/query-keys';

export function useActivityMutations(onSuccess?: (activity: { accountId?: string | null }) => void) {
  const queryClient = useQueryClient();
  const createMutationOptions = (action: string) => ({
    onSuccess: (activity: { accountId?: string | null }) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITIES] });
      if (onSuccess) onSuccess(activity);
    },
    onError: (error: string) => {
      logger.error(`Error ${action} activity: ${error}`);
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

  const submitActivity = async (data: NewActivityFormValues) => {
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
