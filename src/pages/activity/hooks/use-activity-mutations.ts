import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { createActivity, updateActivity, deleteActivity } from "@/commands/activity";
import { logger } from "@/adapters";
import { NewActivityFormValues } from "../components/forms/schemas";
import { ActivityDetails, Quote, ActivityCreate, ActivityUpdate } from "@/lib/types";
import { DataSource } from "@/lib/constants";
import { updateQuote } from "@/commands/market-data";
import { QueryKeys } from "@/lib/query-keys";

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

  return {
    addActivityMutation,
    updateActivityMutation,
    deleteActivityMutation,
    duplicateActivityMutation,
  };
}
