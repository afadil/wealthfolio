import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ExportDataType,
  ExportedFileFormat,
  Account,
  ActivityDetails,
  Goal,
  PortfolioHistory,
} from '@/lib/types';
import { toast } from '@/components/ui/use-toast';
import { backupDatabase } from '@/commands/settings';
import { openFileSaveDialog } from '@/commands/file';
import { formatData } from '@/lib/export-utils';
import { QueryKeys } from '@/lib/query-keys';
import { getAccounts } from '@/commands/account';
import { getActivities } from '@/commands/activity';
import { getGoals } from '@/commands/goal';
import { getHistory } from '@/commands/portfolio';

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
  const { refetch: fetchPortfolioHistory } = useQuery<PortfolioHistory[], Error>({
    queryKey: [QueryKeys.HISTORY],
    queryFn: () => getHistory(),
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
        const sqliteFile = await backupDatabase();
        return openFileSaveDialog(sqliteFile.data, sqliteFile.filename);
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
    onSuccess: () => {
      toast({
        title: 'File saved successfully.',
        variant: 'success',
      });
    },
    onError: () => {
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
      console.error('Error while exporting', error);
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
