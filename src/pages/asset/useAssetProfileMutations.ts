import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAssetProfile } from '@/commands/market-data';
import { toast } from '@/components/ui/use-toast';
import { QueryKeys } from '@/lib/query-keys';
import { logger } from '@/adapters';

export const useAssetProfileMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, assetId: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, assetId] });
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

  const updateAssetProfileMutation = useMutation({
    mutationFn: updateAssetProfile,
    onSuccess: (result) => {
      handleSuccess('Asset profile updated successfully.', result.id);
    },
    onError: (error) => {
      logger.error(`Error updating asset profile: ${error}`);
      handleError('updating the asset profile');
    },
  });

  return {
    updateAssetProfileMutation,
  };
};
