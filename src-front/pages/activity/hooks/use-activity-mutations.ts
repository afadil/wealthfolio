import { logger } from "@/adapters";
import {
  createActivity,
  deleteActivity,
  saveActivities,
  updateActivity,
} from "@/commands/activity";
import { updateQuote } from "@/commands/market-data";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { isCashActivity } from "@/lib/activity-utils";
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
    if (
      "assetDataSource" in data &&
      data.assetDataSource === DataSource.MANUAL &&
      data.assetId &&
      "unitPrice" in data &&
      data.unitPrice &&
      "quantity" in data &&
      data.quantity
    ) {
      const quote: Omit<Quote, "id" | "createdAt"> & { id?: string; createdAt?: string } = {
        symbol: data.assetId,
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
      const { ...rest } = data;
      const activity = await createActivity(rest);
      await createQuoteFromActivity(data);
      return activity;
    },
    ...createMutationOptions("adding"),
  });

  const updateActivityMutation = useMutation({
    mutationFn: async (data: NewActivityFormValues & { id: string }) => {
      const activity = await updateActivity(data);
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
      ...restOfActivityData
    } = activityToDuplicate;

    const newActivityData: NewActivityFormValues = {
      ...restOfActivityData,
      activityDate: date,
      comment: "Duplicated",
    } as NewActivityFormValues;

    return await createActivity(newActivityData);
  };

  const duplicateActivityMutation = useMutation({
    mutationFn: duplicateActivity,
    ...createMutationOptions("duplicating"),
  });

  const saveActivitiesMutation = useMutation({
    mutationFn: async (request: ActivityBulkMutationRequest) => {
      const normalizeActivity = <T extends ActivityCreate | ActivityUpdate>(activity: T): T => {
        if (!activity.assetId && isCashActivity(activity.activityType)) {
          const currency = (activity.currency ?? "").toUpperCase().trim();
          if (currency.length > 0) {
            return {
              ...activity,
              assetId: `$CASH-${currency}`,
            };
          }
        }
        return activity;
      };

      const normalizedRequest: ActivityBulkMutationRequest = {
        creates: (request.creates ?? []).map((activity) => normalizeActivity(activity)),
        updates: (request.updates ?? []).map((activity) => normalizeActivity(activity)),
        deleteIds: request.deleteIds ?? [],
      };

      const result = await saveActivities(normalizedRequest);

      const quoteCandidates: (ActivityCreate | ActivityUpdate)[] = [
        ...(normalizedRequest.creates ?? []),
        ...(normalizedRequest.updates ?? []),
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
