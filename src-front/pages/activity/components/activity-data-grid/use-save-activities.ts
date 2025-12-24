import { logger } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import type { ActivityBulkMutationRequest } from "@/lib/types";
import { useCallback } from "react";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import {
  buildSavePayload,
  validateTransactionsForSave,
  type ValidationResult,
} from "./activity-utils";
import type { CurrencyResolutionOptions, LocalTransaction } from "./types";

interface UseSaveActivitiesParams {
  localTransactions: LocalTransaction[];
  dirtyTransactionIds: Set<string>;
  pendingDeleteIds: Set<string>;
  resolveTransactionCurrency: (
    transaction: LocalTransaction,
    options?: CurrencyResolutionOptions,
  ) => string | undefined;
  dirtyCurrencyLookup: Map<string, string>;
  assetCurrencyLookup: Map<string, string>;
  fallbackCurrency: string;
  setLocalTransactions: React.Dispatch<React.SetStateAction<LocalTransaction[]>>;
  resetChangeState: () => void;
  resetRowSelection: () => void;
  onRefetch: () => Promise<unknown>;
}

interface SaveResult {
  success: boolean;
  validation?: ValidationResult;
}

/**
 * Hook for handling activity save operations with validation and error handling
 */
export function useSaveActivities({
  localTransactions,
  dirtyTransactionIds,
  pendingDeleteIds,
  resolveTransactionCurrency,
  dirtyCurrencyLookup,
  assetCurrencyLookup,
  fallbackCurrency,
  setLocalTransactions,
  resetChangeState,
  resetRowSelection,
  onRefetch,
}: UseSaveActivitiesParams) {
  const { saveActivitiesMutation } = useActivityMutations();

  const saveActivities = useCallback(async (): Promise<SaveResult> => {
    // Validate before save
    const validation = validateTransactionsForSave(localTransactions, dirtyTransactionIds);

    if (!validation.isValid) {
      logger.warn(`Validation failed for activities: ${JSON.stringify(validation.errors)}`);

      const errorMessages = validation.errors
        .slice(0, 3)
        .map((validationError) => `${validationError.field}: ${validationError.message}`)
        .join(", ");

      toast({
        title: "Validation failed",
        description: errorMessages + (validation.errors.length > 3 ? "..." : ""),
        variant: "destructive",
      });

      return { success: false, validation };
    }

    const payload = buildSavePayload(
      localTransactions,
      dirtyTransactionIds,
      pendingDeleteIds,
      resolveTransactionCurrency,
      dirtyCurrencyLookup,
      assetCurrencyLookup,
      fallbackCurrency,
    );

    const request: ActivityBulkMutationRequest = {
      creates: payload.creates,
      updates: payload.updates,
      deleteIds: payload.deleteIds,
    };

    try {
      logger.info(
        `Saving activities: creates=${request.creates?.length ?? 0}, updates=${request.updates?.length ?? 0}, deletes=${request.deleteIds?.length ?? 0}`,
      );

      const result = await saveActivitiesMutation.mutateAsync(request);

      // Map temporary IDs to persisted IDs
      const createdMappings = new Map(
        (result.createdMappings ?? [])
          .filter((mapping) => mapping.tempId && mapping.activityId)
          .map((mapping) => [mapping.tempId!, mapping.activityId]),
      );

      // Update local state with persisted IDs
      setLocalTransactions((prev) =>
        prev
          .filter((transaction) => !pendingDeleteIds.has(transaction.id))
          .map((transaction) => {
            if (transaction.isNew) {
              const mappedId = createdMappings.get(transaction.id);
              if (mappedId) {
                return { ...transaction, id: mappedId, isNew: false };
              }
            }
            return transaction;
          }),
      );

      resetChangeState();
      resetRowSelection();

      toast({
        title: "Activities saved",
        description: "Your pending changes are now saved.",
        variant: "success",
      });

      await onRefetch();

      logger.info("Activities saved successfully");
      return { success: true };
    } catch (error) {
      logger.error(`Failed to save activities: ${error instanceof Error ? error.message : String(error)}`);
      // Error toast is handled by the mutation hook
      return { success: false };
    }
  }, [
    assetCurrencyLookup,
    dirtyCurrencyLookup,
    dirtyTransactionIds,
    fallbackCurrency,
    localTransactions,
    onRefetch,
    pendingDeleteIds,
    resetChangeState,
    resetRowSelection,
    resolveTransactionCurrency,
    saveActivitiesMutation,
    setLocalTransactions,
  ]);

  return {
    saveActivities,
    isSaving: saveActivitiesMutation.isPending,
  };
}
