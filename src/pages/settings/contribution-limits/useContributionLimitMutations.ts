import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteContributionLimit,
  createContributionLimit,
  updateContributionLimit,
} from '@/commands/contribution-limits';
import { QueryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/use-toast';
import { NewContributionLimits } from '@/lib/types';

export const useContributionLimitMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, invalidateKeys: string[]) => {
    invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    toast({
      title: message,
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
      handleSuccess('Contribution limit added successfully.', [QueryKeys.CONTRIBUTION_LIMITS]),
    onError: () => handleError('adding this contribution limit'),
  });

  const updateContributionLimitMutation = useMutation({
    mutationFn: (params: { id: string; updatedLimit: NewContributionLimits }) =>
      updateContributionLimit(params.id, params.updatedLimit),
    onSuccess: () =>
      handleSuccess('Contribution limit updated successfully.', [QueryKeys.CONTRIBUTION_LIMITS]),
    onError: () => handleError('updating this contribution limit'),
  });

  const deleteContributionLimitMutation = useMutation({
    mutationFn: deleteContributionLimit,
    onSuccess: () =>
      handleSuccess('Contribution limit deleted successfully.', [QueryKeys.CONTRIBUTION_LIMITS]),
    onError: () => handleError('deleting this contribution limit'),
  });

  return {
    deleteContributionLimitMutation,
    addContributionLimitMutation,
    updateContributionLimitMutation,
  };
};
