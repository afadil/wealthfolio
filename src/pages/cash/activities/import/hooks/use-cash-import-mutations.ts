import { useMutation } from "@tanstack/react-query";
import { logger } from "@/adapters";
import { importActivities } from "@/commands/activity-import";
import { toast } from "@/components/ui/use-toast";

export function useCashImportMutations({
  onSuccess,
  onError,
}: {
  onSuccess?: (activities: unknown[]) => void;
  onError?: (error: string) => void;
} = {}) {
  const confirmImportMutation = useMutation({
    mutationFn: importActivities,
    onSuccess: async (result: unknown) => {
      if (onSuccess) {
        const activities = Array.isArray(result) ? result : [result];
        onSuccess(activities);
        toast({
          title: "Import successful",
          description: "Cash activities have been imported successfully.",
        });
      }
    },
    onError: (error: unknown) => {
      logger.error(`Error confirming cash import: ${String(error)}`);

      if (onError) {
        const errMsg =
          error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message)
            : "An error occurred during import";
        onError(errMsg);
      } else {
        toast({
          title: "Uh oh! Something went wrong.",
          description: "Please try again or report an issue if the problem persists.",
          variant: "destructive",
        });
      }
    },
  });

  return {
    confirmImportMutation,
  };
}
