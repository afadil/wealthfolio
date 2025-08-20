import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ExportDataType,
  ExportedFileFormat,
  Account,
  ActivityDetails,
  Goal,
  AccountValuation,
} from '@/lib/types';
import { logger } from '@/adapters';
import { toast } from '@/components/ui/use-toast';
import { openFileSaveDialog, openFolderDialog } from '@/commands/file';
import { formatData } from '@/lib/export-utils';
import { QueryKeys } from '@/lib/query-keys';
import { getAccounts } from '@/commands/account';
import { getActivities } from '@/commands/activity';
import { getGoals } from '@/commands/goal';
import { getHistoricalValuations } from '@/commands/portfolio';
import { backupDatabaseToPath } from '@/commands/settings';

interface ExportParams {
  format: ExportedFileFormat;
  data: ExportDataType;
}

export function useExportData() {
  const { refetch: fetchAccounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
    enabled: false,
  });
  const { refetch: fetchActivities } = useQuery<ActivityDetails[], Error>({
    queryKey: [QueryKeys.ACTIVITIES],
    queryFn: getActivities,
    enabled: false,
  });
  const { refetch: fetchGoals } = useQuery<Goal[], Error>({
    queryKey: [QueryKeys.GOALS],
    queryFn: getGoals,
    enabled: false,
  });
  const { refetch: fetchPortfolioHistory } = useQuery<AccountValuation[], Error>({
    queryKey: [QueryKeys.HISTORY_VALUATION],
    queryFn: () => getHistoricalValuations(),
    enabled: false,
  });

  const {
    mutateAsync: exportDataMutation,
    isPending: isExporting,
    variables: mutationVariables,
  } = useMutation({
    mutationFn: async (params: ExportParams) => {
      const { format, data: desiredData } = params;
      if (format === 'SQLite') {
        // Open folder dialog to let user choose backup location
        const selectedDir = await openFolderDialog();
        
        if (!selectedDir) {
          // User cancelled the dialog, return null to indicate cancellation
          return null;
        }

        // Create backup in selected directory
        const backupPath = await backupDatabaseToPath(selectedDir);
        return { success: true, path: backupPath };
      } else {
        let exportedData: string | undefined;
        let fileName: string;

        const currentDate = new Date().toISOString().split('T')[0];
        switch (desiredData) {
          case 'accounts':
            exportedData = await fetchAndFormatData(fetchAccounts, format);
            fileName = `accounts_${currentDate}.${format.toLowerCase()}`;
            break;
          case 'activities':
            exportedData = await fetchAndFormatData(fetchActivities, format);
            fileName = `activities_${currentDate}.${format.toLowerCase()}`;
            break;
          case 'goals':
            exportedData = await fetchAndFormatData(fetchGoals, format);
            fileName = `goals_${currentDate}.${format.toLowerCase()}`;
            break;
          case 'portfolio-history':
            exportedData = await fetchAndFormatData(fetchPortfolioHistory, format);
            fileName = `portfolio-history_${currentDate}.${format.toLowerCase()}`;
            break;
        }

        if (exportedData) {
          return openFileSaveDialog(exportedData, fileName);
        }
      }
    },
    onSuccess: (result) => {
      if (result === null) {
        // User cancelled the operation, don't show any message
        return;
      }
      
      if (result && typeof result === 'object' && 'path' in result) {
        // SQLite backup success
        toast({
          title: 'Database backup completed successfully.',
          description: `Backup saved to: ${result.path}`,
          variant: 'success',
        });
      } else {
        // Regular export success
        toast({
          title: 'File saved successfully.',
          variant: 'success',
        });
      }
    },
    onError: (e) => {
      logger.error(`Error while exporting: ${e}`);
      toast({
        title: 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const exportData = async (params: ExportParams) => {
    try {
      await exportDataMutation(params);
    } catch (error) {
      logger.error(`Error while exporting: ${error}`);
    }
  };

  return {
    exportData,
    isExporting,
    exportingFormat: isExporting ? mutationVariables?.format : null,
    exportingData: isExporting ? mutationVariables?.data : null,
  };
}

async function fetchAndFormatData(
  queryFn: () => Promise<any>,
  format: ExportedFileFormat,
): Promise<string | undefined> {
  const response = await queryFn();
  return formatData(response.data, format);
}
