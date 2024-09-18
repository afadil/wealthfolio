import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { createActivity, updateActivity, deleteActivity } from '@/commands/activity';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { newActivitySchema } from '@/lib/schemas';
import * as z from 'zod';

type ActivityFormValues = z.infer<typeof newActivitySchema>;

export function useActivityMutations() {
  const queryClient = useQueryClient();
  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Activity updated successfully.',
  });

  const createMutationOptions = (action: string) => ({
    onSuccess: (activity: { accountId?: string | null }) => {
      queryClient.invalidateQueries();
      calculateHistoryMutation.mutate({
        accountIds: activity.accountId ? [activity.accountId] : undefined,
        forceFullCalculation: true,
      });
    },
    onError: () => {
      toast({
        title: 'Uh oh! Something went wrong.',
        description: `There was a problem ${action} this activity.`,
        className: 'bg-red-500 text-white border-none',
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
