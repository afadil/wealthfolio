import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateAssetProfile } from '@/commands/market-data';
import { toast } from '@/components/ui/use-toast';

export const useAssetProfileMutations = () => {
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

  const updateAssetProfileMutation = useMutation({
    mutationFn: updateAssetProfile,
    onSuccess: () => handleSuccess('Asset profile updated successfully.', ['asset_data']),
    onError: () => handleError('updating the asset profile'),
  });

  return {
    updateAssetProfileMutation,
  };
};
