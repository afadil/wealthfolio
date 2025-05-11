import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  deleteContributionLimit,
  createContributionLimit,
  updateContributionLimit,
  calculateDepositsForLimit,
} from '@/commands/contribution-limits';
import { QueryKeys } from '@/lib/query-keys';
import { toast } from '@/components/ui/use-toast';
import { ContributionLimit, NewContributionLimit, DepositsCalculation } from '@/lib/types';
import { logger } from '@/adapters';

export const useContributionLimitProgress = (limitId: string) => {
  return useQuery<DepositsCalculation>({
    queryKey: [QueryKeys.CONTRIBUTION_LIMIT_PROGRESS, limitId],
    queryFn: async () => {
      try {
        return await calculateDepositsForLimit(limitId);
      } catch (e) {
        logger.error(`Error calculating deposits for limit: ${e}`);
        toast({
          title: 'Error calculating deposits',
          description: 'There was a problem calculating the deposits for this limit.',
          variant: 'destructive',
        });
        throw e;
      }
    },
  });
};

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
    onError: (e) => {
      logger.error(`Error adding contribution limit: ${e}`);
      handleError('adding this contribution limit');
    },
  });

  const updateContributionLimitMutation = useMutation({
    mutationFn: (params: { id: string; updatedLimit: NewContributionLimit }) =>
      updateContributionLimit(params.id, params.updatedLimit),
    onSuccess: (limit) => handleSuccess('Contribution limit updated successfully.', limit),
    onError: (e) => {
      logger.error(`Error updating contribution limit: ${e}`);
      handleError('updating this contribution limit');
    },
  });

  const deleteContributionLimitMutation = useMutation({
    mutationFn: deleteContributionLimit,
    onSuccess: () => handleSuccess('Contribution limit deleted successfully.', undefined),
    onError: (e) => {
      logger.error(`Error deleting contribution limit: ${e}`);
      handleError('deleting this contribution limit');
    },
  });

  return {
    deleteContributionLimitMutation,
    addContributionLimitMutation,
    updateContributionLimitMutation,
  };
};
