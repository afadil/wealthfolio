import { logger } from '@/adapters';
import { getAccounts } from '@/commands/account';
import { getActivities } from '@/commands/activity';
import { openFileSaveDialog, openFolderDialog } from '@/commands/file';
import { getGoals } from '@/commands/goal';
import { getHistoricalValuations } from '@/commands/portfolio';
import { backupDatabaseToPath } from '@/commands/settings';
import { toast } from '@/components/ui/use-toast';
import { formatData } from '@/lib/export-utils';
import { QueryKeys } from '@/lib/query-keys';
import {
  Account,
  AccountValuation,
  ActivityDetails,
  ExportDataType,
  ExportedFileFormat,
  Goal,
} from '@/lib/types';
import { QueryObserverResult, useMutation, useQuery } from '@tanstack/react-query';

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
    queryFn: () => getActivities(),
    enabled: false,
  });
  const { refetch: fetchGoals } = useQuery<Goal[], Error>({
    queryKey: [QueryKeys.GOALS],
    queryFn: getGoals,
    enabled: false,
  });
  const { refetch: fetchPortfolioHistory } = useQuery<AccountValuation[], Error>({
    queryKey: [QueryKeys.HISTORY_VALUATION],
    queryFn: () => getHistoricalValuations('TOTAL'),
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
        let datasetLabel: string | null = null;

        const currentDate = new Date().toISOString().split('T')[0];
        switch (desiredData) {
          case 'accounts':
            exportedData = await fetchAndFormatData(fetchAccounts, format);
            fileName = `accounts_${currentDate}.${format.toLowerCase()}`;
            datasetLabel = 'accounts';
            break;
          case 'activities':
            exportedData = await fetchAndFormatData(fetchActivities, format);
            fileName = `activities_${currentDate}.${format.toLowerCase()}`;
            datasetLabel = 'activities';
            break;
          case 'goals':
            exportedData = await fetchAndFormatData(fetchGoals, format);
            fileName = `goals_${currentDate}.${format.toLowerCase()}`;
            datasetLabel = 'goals';
            break;
          case 'portfolio-history':
            exportedData = await fetchAndFormatData(fetchPortfolioHistory, format);
            fileName = `portfolio-history_${currentDate}.${format.toLowerCase()}`;
            datasetLabel = 'portfolio history records';
            break;
        }

        if (exportedData) {
          return openFileSaveDialog(exportedData, fileName);
        }

        if (datasetLabel) {
          toast({
            title: 'Nothing to export.',
            description: `No ${datasetLabel} available to export right now.`,
          });
        }

        return null;
      }
    },
    onSuccess: (result) => {
      if (!result) {
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
          title: 'Export completed',
          description: 'File saved successfully. Check your download location.',
          variant: 'success',
        });
      }
    },
    onError: (e) => {
      logger.error(`Error while exporting: ${String(e)}`);
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
      logger.error(`Error while exporting: ${String(error)}`);
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
  queryFn: () => Promise<QueryObserverResult<unknown[], Error>>,
  format: ExportedFileFormat,
): Promise<string | undefined> {
  const response = await queryFn();

  // Handle empty data gracefully - export empty file instead of error
  const data = response.data ?? [];
  return formatData(data, format);
}
