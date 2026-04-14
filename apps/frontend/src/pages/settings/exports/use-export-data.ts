import {
  backupDatabase,
  backupDatabaseToPath,
  getAccounts,
  getActivities,
  getGoals,
  getHistoricalValuations,
  isWeb,
  logger,
  openFileSaveDialog,
  openFolderDialog,
} from "@/adapters";
import i18n from "@/i18n/i18n";
import { getPlatform as getRuntimePlatform } from "@/hooks/use-platform";
import { formatData } from "@/lib/export-utils";
import { QueryKeys } from "@/lib/query-keys";
import {
  Account,
  AccountValuation,
  ActivityDetails,
  ExportDataType,
  ExportedFileFormat,
  Goal,
} from "@/lib/types";
import { QueryObserverResult, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

interface ExportParams {
  format: ExportedFileFormat;
  data: ExportDataType;
}

interface SQLiteBackupResult {
  mode: "sqlite";
  target: "local" | "server";
  value: string;
}

type ExportMutationResult = SQLiteBackupResult | boolean | null;

export function useExportData() {
  const { refetch: fetchAccounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: () => getAccounts(),
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
    queryFn: () => getHistoricalValuations("TOTAL"),
    enabled: false,
  });

  const {
    mutateAsync: exportDataMutation,
    isPending: isExporting,
    variables: mutationVariables,
  } = useMutation<ExportMutationResult, Error, ExportParams>({
    mutationFn: async (params: ExportParams) => {
      const { format, data: desiredData } = params;
      if (format === "SQLite") {
        if (isWeb) {
          const { filename } = await backupDatabase();
          return { mode: "sqlite", target: "server" as const, value: filename };
        }

        const runtimePlatform = await getRuntimePlatform();
        if (runtimePlatform.is_desktop) {
          // Open folder dialog to let user choose backup location
          const selectedDir = await openFolderDialog();

          if (!selectedDir) {
            // User cancelled the dialog, return null to indicate cancellation
            return null;
          }

          // Create backup in selected directory
          const backupPath = await backupDatabaseToPath(selectedDir);
          return { mode: "sqlite", target: "local" as const, value: backupPath };
        }

        // Mobile: create backup and let user pick destination file.
        const { filename, data } = await backupDatabase();
        const saved = await openFileSaveDialog(data, filename);
        if (!saved) {
          return null;
        }
        return { mode: "sqlite", target: "local" as const, value: filename };
      } else {
        let exportedData: string | undefined;
        let fileName: string;
        let nothingExportKey: string | null = null;

        const currentDate = new Date().toISOString().split("T")[0];
        switch (desiredData) {
          case "accounts":
            exportedData = await fetchAndFormatData(fetchAccounts, format);
            fileName = `accounts_${currentDate}.${format.toLowerCase()}`;
            nothingExportKey = "settings.exports.toast.nothing_accounts";
            break;
          case "activities":
            exportedData = await fetchAndFormatData(fetchActivities, format);
            fileName = `activities_${currentDate}.${format.toLowerCase()}`;
            nothingExportKey = "settings.exports.toast.nothing_activities";
            break;
          case "goals":
            exportedData = await fetchAndFormatData(fetchGoals, format);
            fileName = `goals_${currentDate}.${format.toLowerCase()}`;
            nothingExportKey = "settings.exports.toast.nothing_goals";
            break;
          case "portfolio-history":
            exportedData = await fetchAndFormatData(fetchPortfolioHistory, format);
            fileName = `portfolio-history_${currentDate}.${format.toLowerCase()}`;
            nothingExportKey = "settings.exports.toast.nothing_portfolio_history";
            break;
        }

        if (exportedData) {
          return openFileSaveDialog(exportedData, fileName);
        }

        if (nothingExportKey) {
          toast({
            title: i18n.t("settings.exports.toast.nothing_title"),
            description: i18n.t(nothingExportKey),
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

      if (result && typeof result === "object" && "mode" in result && result.mode === "sqlite") {
        const description =
          result.target === "server"
            ? i18n.t("settings.exports.toast.backup_path_server", { path: result.value })
            : i18n.t("settings.exports.toast.backup_path_local", { path: result.value });

        toast({
          title: i18n.t("settings.exports.toast.database_backup_success_title"),
          description,
          variant: "success",
        });
      } else {
        // Regular export success
        toast({
          title: i18n.t("settings.exports.toast.export_file_success_title"),
          description: i18n.t("settings.exports.toast.export_file_success_description"),
          variant: "success",
        });
      }
    },
    onError: (e) => {
      logger.error(`Error while exporting: ${String(e)}`);
      toast({
        title: i18n.t("settings.exports.toast.export_failed_title"),
        variant: "destructive",
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
