import { useMutation } from "@tanstack/react-query";
import { logger, importActivities } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

export function useActivityImportMutations({
  onSuccess,
  onError,
}: {
  onSuccess?: (activities: unknown[]) => void;
  onError?: (error: string) => void;
} = {}) {
  const confirmImportMutation = useMutation({
    mutationFn: importActivities,
    onSuccess: async (result: unknown) => {
      // Call the provided onSuccess callback if it exists
      if (onSuccess) {
        // Ensure we pass an array of activities to the callback
        const activities = Array.isArray(result) ? result : [result];
        onSuccess(activities);
        toast({
          title: "Import successful",
          description: "Activities have been imported successfully.",
        });
      }
    },
    onError: (error: unknown) => {
      logger.error(`Error confirming import: ${String(error)}`);

      // Call the provided onError callback if it exists
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
