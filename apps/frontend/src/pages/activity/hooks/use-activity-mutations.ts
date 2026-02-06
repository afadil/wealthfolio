import { logger, createActivity, deleteActivity, saveActivities, updateActivity } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import {
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
} from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NewActivityFormValues } from "../components/forms/schemas";

export function useActivityMutations(
  onSuccess?: (activity: { accountId?: string | null }) => void,
) {
  const queryClient = useQueryClient();
  const toDecimalPayload = (value: unknown): string | null | undefined => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    const str = (typeof value === "string" ? value : `${value as number}`).trim();
    return str === "" ? undefined : str;
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
      // Extract asset-related fields from form data
      const { assetId, exchangeMic, metadata, assetMetadata, pricingMode, assetKind, ...rest } =
        data as NewActivityFormValues & {
          assetId?: string;
          exchangeMic?: string;
          metadata?: Record<string, unknown>;
          assetMetadata?: { name?: string; kind?: string; exchangeMic?: string };
          pricingMode?: string;
          assetKind?: string;
        };
      const quantity = "quantity" in rest ? rest.quantity : undefined;
      const unitPrice = "unitPrice" in rest ? rest.unitPrice : undefined;
      const amount = "amount" in rest ? rest.amount : undefined;
      const fee = "fee" in rest ? rest.fee : undefined;
      const fxRate = "fxRate" in rest ? rest.fxRate : undefined;

      // Build nested asset object
      const createPayload: ActivityCreate = {
        ...rest,
        quantity: toDecimalPayload(quantity),
        unitPrice: toDecimalPayload(unitPrice),
        amount: toDecimalPayload(amount),
        fee: toDecimalPayload(fee),
        fxRate: toDecimalPayload(fxRate),
        // Use nested asset object (preferred over flat fields)
        asset: {
          symbol: assetId,
          exchangeMic,
          kind: assetKind || assetMetadata?.kind,
          name: assetMetadata?.name,
          pricingMode: pricingMode as ActivityCreate["asset"] extends { pricingMode?: infer P }
            ? P
            : never,
        },
        // Serialize metadata object to JSON string for backend
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      };
      // Backend handles quote creation for MANUAL pricing mode
      return await createActivity(createPayload);
    },
    ...createMutationOptions("adding"),
  });

  const updateActivityMutation = useMutation({
    mutationFn: async (data: NewActivityFormValues & { id: string }) => {
      // Extract asset-related fields from form data
      const { assetId, exchangeMic, metadata, assetMetadata, pricingMode, assetKind, ...rest } =
        data as NewActivityFormValues & {
          id: string;
          assetId?: string;
          exchangeMic?: string;
          metadata?: Record<string, unknown>;
          assetMetadata?: { name?: string; kind?: string; exchangeMic?: string };
          pricingMode?: string;
          assetKind?: string;
        };
      const quantity = "quantity" in rest ? rest.quantity : undefined;
      const unitPrice = "unitPrice" in rest ? rest.unitPrice : undefined;
      const amount = "amount" in rest ? rest.amount : undefined;
      const fee = "fee" in rest ? rest.fee : undefined;
      const fxRate = "fxRate" in rest ? rest.fxRate : undefined;

      // Build nested asset object
      const updatePayload: ActivityUpdate = {
        ...rest,
        quantity: toDecimalPayload(quantity),
        unitPrice: toDecimalPayload(unitPrice),
        amount: toDecimalPayload(amount),
        fee: toDecimalPayload(fee),
        fxRate: toDecimalPayload(fxRate),
        // Use nested asset object (preferred over flat fields)
        asset: {
          id: assetId, // For updates, assetId may be the canonical ID
          symbol: assetId,
          exchangeMic,
          kind: assetKind || assetMetadata?.kind,
          name: assetMetadata?.name,
          pricingMode: pricingMode as ActivityUpdate["asset"] extends { pricingMode?: infer P }
            ? P
            : never,
        },
        // Serialize metadata object to JSON string for backend
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      };
      // Backend handles quote creation for MANUAL pricing mode
      return await updateActivity(updatePayload);
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
      exchangeMic,
      assetPricingMode,
      ...restOfActivityData
    } = activityToDuplicate;

    // For duplicating, use nested asset object
    const createPayload: ActivityCreate = {
      accountId: restOfActivityData.accountId,
      activityType: restOfActivityData.activityType,
      subtype: restOfActivityData.subtype,
      currency: restOfActivityData.currency,
      quantity: restOfActivityData.quantity,
      unitPrice: restOfActivityData.unitPrice,
      amount: restOfActivityData.amount,
      fee: restOfActivityData.fee,
      fxRate: restOfActivityData.fxRate ?? undefined,
      activityDate: date,
      comment: "Duplicated",
      // Use nested asset object
      asset: {
        symbol: assetSymbol,
        exchangeMic,
        pricingMode: assetPricingMode,
      },
    };

    return await createActivity(createPayload);
  };

  const duplicateActivityMutation = useMutation({
    mutationFn: duplicateActivity,
    ...createMutationOptions("duplicating"),
  });

  const saveActivitiesMutation = useMutation({
    mutationFn: async (request: ActivityBulkMutationRequest) => {
      // NOTE: No longer normalizing cash activities to CASH:{currency} here.
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

      // Backend handles quote creation for MANUAL pricing mode
      return await saveActivities(normalizedRequest);
    },
    onSuccess: (result: ActivityBulkMutationResult) => {
      queryClient.invalidateQueries();
      // Call onSuccess with first created activity for sheet close callback
      if (onSuccess && result.created.length > 0) {
        onSuccess({ accountId: result.created[0].accountId });
      }
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
