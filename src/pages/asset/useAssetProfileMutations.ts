import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAssetProfile, updateAssetDataSource } from '@/commands/market-data';
import { toast } from '@/components/ui/use-toast';
import { QueryKeys } from '@/lib/query-keys';
import { logger } from '@/adapters';

export const useAssetProfileMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string, assetId: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, assetId] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
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

  const updateAssetDataSourceMutation = useMutation({
    mutationFn: ({ symbol, dataSource }: { symbol: string; dataSource: string }) =>
      updateAssetDataSource(symbol, dataSource),
    onSuccess: (result) => {
      handleSuccess('Asset data source updated successfully.', result.id);
    },
    onError: (error) => {
      logger.error(`Error updating asset data source: ${error}`);
      handleError('updating the asset data source');
    },
  });

  return {
    updateAssetProfileMutation,
    updateAssetDataSourceMutation,
  };
};
