import { Alert, AlertDescription, AlertTitle, Button, Icons } from "@wealthfolio/ui";
import { useMigrationStatus, useMigrateLegacyClassifications } from "@/hooks/use-taxonomies";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function MigrationBanner() {
  const { t } = useTranslation("common");
  const { data: status, isLoading } = useMigrationStatus();
  const migrateMutation = useMigrateLegacyClassifications();

  // Don't show if loading, not needed, or no legacy data
  if (isLoading || !status?.needed || status.assetsWithLegacyData === 0) {
    return null;
  }

  const handleMigrate = async () => {
    try {
      const result = await migrateMutation.mutateAsync();
      toast.success(
        t("settings.taxonomies.migration.toast_success", {
          sectors: result.sectorsMigrated,
          countries: result.countriesMigrated,
        }),
      );
      if (result.errors.length > 0) {
        toast.warning(
          t("settings.taxonomies.migration.toast_warning_unmatched", {
            count: result.errors.length,
          }),
        );
      }
    } catch (_error) {
      toast.error(t("settings.taxonomies.migration.toast_error"));
    }
  };

  return (
    <Alert className="mb-6">
      <Icons.Info className="h-4 w-4" />
      <AlertTitle>{t("settings.taxonomies.migration.title")}</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          {t("settings.taxonomies.migration.description", {
            count: status.assetsWithLegacyData,
          })}
        </p>
        <Button onClick={handleMigrate} disabled={migrateMutation.isPending} size="sm">
          {migrateMutation.isPending ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              {t("settings.taxonomies.migration.migrating")}
            </>
          ) : (
            t("settings.taxonomies.migration.start")
          )}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
