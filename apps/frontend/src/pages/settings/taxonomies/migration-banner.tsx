import { Alert, AlertDescription, AlertTitle, Button, Icons } from "@wealthfolio/ui";
import { useMigrationStatus, useMigrateLegacyClassifications } from "@/hooks/use-taxonomies";
import { toast } from "sonner";

export function MigrationBanner() {
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
        `Migration complete! ${result.sectorsMigrated} sectors and ${result.countriesMigrated} countries migrated.`,
      );
      if (result.errors.length > 0) {
        toast.warning(`${result.errors.length} items could not be matched and were skipped.`);
      }
    } catch (_error) {
      toast.error("Migration failed. Please try again.");
    }
  };

  return (
    <Alert className="mb-6">
      <Icons.Info className="h-4 w-4" />
      <AlertTitle>Migrate Legacy Classifications</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          {status.assetsWithLegacyData} assets have legacy sector/country data that can be migrated
          to the new taxonomy system for better organization and analytics.
        </p>
        <Button onClick={handleMigrate} disabled={migrateMutation.isPending} size="sm">
          {migrateMutation.isPending ? (
            <>
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              Migrating...
            </>
          ) : (
            "Start Migration"
          )}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
