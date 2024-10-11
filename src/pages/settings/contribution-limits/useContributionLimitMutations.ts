import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteContributionLimit,
  createContributionLimit,
  updateContributionLimit,
} from '@/commands/contribution-limits';
import { QueryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/use-toast';
import { ContributionLimit, NewContributionLimit } from '@/lib/types';

export const useContributionLimitMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, limit?: ContributionLimit) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.CONTRIBUTION_LIMITS] });
    queryClient.invalidateQueries({
      queryKey: [QueryKeys.CONTRIBUTION_LIMIT_PROGRESS, limit?.accountIds, limit?.contributionYear],
    });
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
    onSuccess: (limit) => handleSuccess('Contribution limit added successfully.', limit),
    onError: () => handleError('adding this contribution limit'),
  });

  const updateContributionLimitMutation = useMutation({
    mutationFn: (params: { id: string; updatedLimit: NewContributionLimit }) =>
      updateContributionLimit(params.id, params.updatedLimit),
    onSuccess: (limit) => handleSuccess('Contribution limit updated successfully.', limit),
    onError: () => handleError('updating this contribution limit'),
  });

  const deleteContributionLimitMutation = useMutation({
    mutationFn: deleteContributionLimit,
    onSuccess: () => handleSuccess('Contribution limit deleted successfully.', undefined),
    onError: () => handleError('deleting this contribution limit'),
  });

  return {
    deleteContributionLimitMutation,
    addContributionLimitMutation,
    updateContributionLimitMutation,
  };
};
