import { logger } from "@/adapters";
import {
  createActivity,
  deleteActivity,
  saveActivities,
  updateActivity,
} from "@/commands/activity";
import { updateQuote } from "@/commands/market-data";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { DataSource } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import {
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
  Quote,
} from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NewActivityFormValues } from "../components/forms/schemas";

export function useActivityMutations(
  onSuccess?: (activity: { accountId?: string | null }) => void,
) {
  const queryClient = useQueryClient();

  const createQuoteFromActivity = async (data: ActivityCreate | ActivityUpdate) => {
    // Get symbol from either symbol (creates) or assetId (updates)
    const symbolOrAssetId = ("symbol" in data && data.symbol) || ("assetId" in data && data.assetId);
    if (
      "assetDataSource" in data &&
      data.assetDataSource === DataSource.MANUAL &&
      symbolOrAssetId &&
      "unitPrice" in data &&
      data.unitPrice &&
      "quantity" in data &&
      data.quantity
    ) {
      const quote: Omit<Quote, "id" | "createdAt"> & { id?: string; createdAt?: string } = {
        symbol: symbolOrAssetId,
        timestamp: new Date(data.activityDate).toISOString(),
        open: data.unitPrice,
        high: data.unitPrice,
        low: data.unitPrice,
        close: data.unitPrice,
        adjclose: data.unitPrice,
        volume: data.quantity,
        currency: data.currency || "",
        dataSource: DataSource.MANUAL,
      };

      const datePart = new Date(quote.timestamp).toISOString().slice(0, 10).replace(/-/g, "");
      const fullQuote: Quote = {
        ...quote,
        id: `${datePart}_${quote.symbol.toUpperCase()}`,
        createdAt: new Date().toISOString(),
      };

      try {
        await updateQuote(fullQuote.symbol, fullQuote);
        queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, fullQuote.symbol] });
        toast({
          title: "Quote added successfully.",
          variant: "success",
        });
      } catch (error) {
        logger.error(`Error saving quote from activity: ${String(error)}`);
        toast({
          title: "Uh oh! Something went wrong.",
          description: `There was a problem saving the quote from the activity.`,
          variant: "destructive",
        });
      }
    }
  };

  const createMutationOptions = (action: string) => ({
    onSuccess: (activity: { accountId?: string | null }) => {
      queryClient.invalidateQueries();
      if (onSuccess) onSuccess(activity);
    },
    onError: (error: string) => {
      logger.error(`Error ${action} activity: ${String(error)}`);
      toast({
        title: `Uh oh! Something went wrong ${action} this activity.`,
        description: `Please try again or report an issue if the problem persists. Error: ${String(
          error,
        )}`,
        variant: "destructive",
      });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: async (data: NewActivityFormValues) => {
      // Convert form's assetId to symbol for new activities
      // Backend generates canonical asset ID from symbol + exchangeMic
      const { assetId, exchangeMic, metadata, ...rest } = data as NewActivityFormValues & {
        assetId?: string;
        exchangeMic?: string;
        metadata?: Record<string, unknown>;
      };
      const createPayload: ActivityCreate = {
        ...rest,
        // Use symbol instead of assetId for creates
        symbol: assetId,
        // Pass exchangeMic for canonical ID generation (e.g., "XNAS", "XTSE")
        exchangeMic,
        // Serialize metadata object to JSON string for backend
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      };
      const activity = await createActivity(createPayload);
      await createQuoteFromActivity(data);
      return activity;
    },
    ...createMutationOptions("adding"),
  });

  const updateActivityMutation = useMutation({
    mutationFn: async (data: NewActivityFormValues & { id: string }) => {
      // Extract metadata to serialize it
      const { metadata, ...rest } = data as NewActivityFormValues & {
        id: string;
        metadata?: Record<string, unknown>;
      };
      const updatePayload: ActivityUpdate = {
        ...rest,
        // Serialize metadata object to JSON string for backend
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      };
      const activity = await updateActivity(updatePayload);
      await createQuoteFromActivity(data);
      return activity;
    },
    ...createMutationOptions("updating"),
  });

  const deleteActivityMutation = useMutation({
    mutationFn: deleteActivity,
    ...createMutationOptions("deleting"),
  });

  const duplicateActivity = async (activityToDuplicate: ActivityDetails) => {
    const {
      id: _id,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      comment: _comment,
      date,
      assetId: _assetId,
      assetSymbol,
      ...restOfActivityData
    } = activityToDuplicate;

    // For duplicating, use symbol instead of assetId - backend generates canonical ID
    const createPayload: ActivityCreate = {
      ...restOfActivityData,
      activityDate: date,
      comment: "Duplicated",
      // Use symbol for creates, not assetId
      symbol: assetSymbol,
    };

    return await createActivity(createPayload);
  };

  const duplicateActivityMutation = useMutation({
    mutationFn: duplicateActivity,
    ...createMutationOptions("duplicating"),
  });

  const saveActivitiesMutation = useMutation({
    mutationFn: async (request: ActivityBulkMutationRequest) => {
      // NOTE: No longer normalizing cash activities to $CASH-{currency} here.
      // Backend is now responsible for generating canonical asset IDs:
      // - For cash activities: backend generates CASH:{currency}
      // - For market activities: backend generates SEC:{symbol}:{mic} from symbol + exchangeMic

      // Serialize metadata objects to JSON strings for backend
      const serializeMetadata = (
        item: ActivityCreate | ActivityUpdate,
      ): ActivityCreate | ActivityUpdate => {
        if (item.metadata && typeof item.metadata !== "string") {
          return { ...item, metadata: JSON.stringify(item.metadata) };
        }
        return item;
      };

      const normalizedRequest: ActivityBulkMutationRequest = {
        creates: request.creates?.map(serializeMetadata) as ActivityCreate[],
        updates: request.updates?.map(serializeMetadata) as ActivityUpdate[],
        deleteIds: request.deleteIds,
      };

      const result = await saveActivities(normalizedRequest);

      const quoteCandidates: (ActivityCreate | ActivityUpdate)[] = [
        ...(request.creates ?? []),
        ...(request.updates ?? []),
      ];
      for (const candidate of quoteCandidates) {
        await createQuoteFromActivity(candidate);
      }
      return result;
    },
    onSuccess: (_result: ActivityBulkMutationResult) => {
      queryClient.invalidateQueries();
    },
    onError: (error: string) => {
      logger.error(`Error saving activities: ${String(error)}`);
      toast({
        title: "Uh oh! Something went wrong saving activities.",
        description:
          "Please make sure every activity has a symbol or cash currency, date, and account, then try again. If the problem persists, please report the issue.",
        variant: "destructive",
      });
    },
  });

  return {
    addActivityMutation,
    updateActivityMutation,
    deleteActivityMutation,
    duplicateActivityMutation,
    saveActivitiesMutation,
  };
}
