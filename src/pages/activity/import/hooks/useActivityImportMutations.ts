import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/adapters';
import {
  checkActivitiesImport,
  createActivities,
  saveAccountImportMapping,
} from '@/commands/activity-import';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { toast } from '@/components/ui/use-toast';
import { QueryKeys } from '@/lib/query-keys';
import { ImportMappingData } from '@/lib/types';
import { syncHistoryQuotes } from '@/commands/market-data';

export function useActivityImportMutations({
  onSuccess,
  onError,
}: {
  onSuccess?: (activities: any[]) => void;
  onError?: (error: string) => void;
} = {}) {
  const queryClient = useQueryClient();

  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Activities imported successfully.',
  });

  const confirmImportMutation = useMutation({
    mutationFn: createActivities,
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });

      // First sync the quotes
      try {
        await syncHistoryQuotes();
      } catch (error) {
        logger.error(`Error syncing quotes: ${error}`);
        toast({
          title: 'Warning',
          description: 'Failed to sync market data. Portfolio values might be incomplete.',
          variant: 'destructive',
        });
      }

      // Then calculate history
      calculateHistoryMutation.mutate({
        accountIds: undefined,
        forceFullCalculation: true,
      });

      toast({
        title: 'Import successful',
        description: 'Activities have been imported successfully.',
      });
    },
    onError: (error) => {
      logger.error(`Error confirming import: ${error}`);
      toast({
        title: 'Uh oh! Something went wrong.',
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'destructive',
      });
    },
  });

  const saveAndCheckImportMutation = useMutation({
    mutationFn: async ({
      data,
      activitiesToImport,
    }: {
      data: ImportMappingData;
      activitiesToImport: any[];
    }) => {
      // Save the mapping
      await saveAccountImportMapping(data);

      // Then check the activities
      return await checkActivitiesImport({
        account_id: data.accountId,
        activities: activitiesToImport,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.IMPORT_MAPPING] });
      onSuccess?.(result);
    },
    onError: (error: any) => {
      logger.error(`Error saving and checking import: ${error}`);
      const errorMessage = `Import failed: ${error.message}`;
      onError?.(errorMessage);
      toast({
        title: 'Error importing activities',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    confirmImportMutation,
    saveAndCheckImportMutation,
  };
}
