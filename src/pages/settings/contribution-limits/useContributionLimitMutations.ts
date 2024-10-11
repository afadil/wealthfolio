import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteContributionLimit,
  createContributionLimit,
  updateContributionLimit,
} from '@/commands/contribution-limits';
import { QueryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/use-toast';
import { NewContributionLimit } from '@/lib/types';

export const useContributionLimitMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, invalidateKeys: string[]) => {
    invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    toast({
      description: message,
      variant: 'success',
    });
  };

  const handleError = (action: string) => {
    toast({
      title: 'Uh oh! Something went wrong.',
      description: `There was a problem ${action}.`,
      variant: 'destructive',
    });
  };

  const addContributionLimitMutation = useMutation({
    mutationFn: createContributionLimit,
    onSuccess: () =>
      handleSuccess('Contribution limit added successfully.', [
        QueryKeys.CONTRIBUTION_LIMITS,
        QueryKeys.CONTRIBUTION_LIMIT_PROGRESS,
      ]),
    onError: () => handleError('adding this contribution limit'),
  });

  const updateContributionLimitMutation = useMutation({
    mutationFn: (params: { id: string; updatedLimit: NewContributionLimit }) =>
      updateContributionLimit(params.id, params.updatedLimit),
    onSuccess: () =>
      handleSuccess('Contribution limit updated successfully.', [
        QueryKeys.CONTRIBUTION_LIMITS,
        QueryKeys.CONTRIBUTION_LIMIT_PROGRESS,
      ]),
    onError: () => handleError('updating this contribution limit'),
  });

  const deleteContributionLimitMutation = useMutation({
    mutationFn: deleteContributionLimit,
    onSuccess: () =>
      handleSuccess('Contribution limit deleted successfully.', [
        QueryKeys.CONTRIBUTION_LIMITS,
        QueryKeys.CONTRIBUTION_LIMIT_PROGRESS,
      ]),
    onError: () => handleError('deleting this contribution limit'),
  });

  return {
    deleteContributionLimitMutation,
    addContributionLimitMutation,
    updateContributionLimitMutation,
  };
};
