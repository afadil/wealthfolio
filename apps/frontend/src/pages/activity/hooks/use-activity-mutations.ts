import { logger, createActivity, deleteActivity, saveActivities, updateActivity } from "@/adapters";
import { generateId } from "@/lib/id";
import {
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivityUpdate,
} from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NewActivityFormValues } from "../components/forms/schemas";

export function useActivityMutations(
  onSuccess?: (activity: { accountId?: string | null }) => void,
) {
  const queryClient = useQueryClient();
  const normalizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  };

  const buildSymbolInput = ({
    assetId,
    exchangeMic,
    quoteMode,
    assetKind,
    assetMetadata,
    symbolQuoteCcy,
    symbolInstrumentType,
    includeId,
  }: {
    assetId?: string;
    exchangeMic?: string;
    quoteMode?: string;
    assetKind?: string;
    assetMetadata?: { name?: string; kind?: string; exchangeMic?: string };
    symbolQuoteCcy?: string;
    symbolInstrumentType?: string;
    includeId: boolean;
  }): ActivityCreate["symbol"] | ActivityUpdate["symbol"] => {
    const normalizedAssetId = normalizeOptionalString(assetId);
    const symbol = {
      id: includeId ? normalizedAssetId : undefined,
      symbol: normalizedAssetId,
      exchangeMic: normalizeOptionalString(exchangeMic),
      kind: normalizeOptionalString(assetKind) ?? normalizeOptionalString(assetMetadata?.kind),
      name: normalizeOptionalString(assetMetadata?.name),
      quoteMode: normalizeOptionalString(quoteMode) as ActivityCreate["symbol"] extends {
        quoteMode?: infer P;
      }
        ? P
        : never,
      quoteCcy: normalizeOptionalString(symbolQuoteCcy),
      instrumentType: normalizeOptionalString(symbolInstrumentType),
    };

    const hasAnyField = Object.values(symbol).some((v) => v !== undefined);
    return hasAnyField ? symbol : undefined;
  };

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
      toast.error(`Failed ${action} activity`, {
        description: String(error),
      });
    },
  });

  const addActivityMutation = useMutation({
    mutationFn: async (data: NewActivityFormValues) => {
      // Extract asset-related fields from form data
      const {
        assetId,
        exchangeMic,
        metadata,
        assetMetadata,
        quoteMode,
        assetKind,
        symbolQuoteCcy,
        symbolInstrumentType,
        ...rest
      } = data as NewActivityFormValues & {
        assetId?: string;
        exchangeMic?: string;
        metadata?: Record<string, unknown>;
        assetMetadata?: { name?: string; kind?: string; exchangeMic?: string };
        quoteMode?: string;
        assetKind?: string;
        symbolQuoteCcy?: string;
        symbolInstrumentType?: string;
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
        symbol: buildSymbolInput({
          assetId,
          exchangeMic,
          quoteMode,
          assetKind,
          assetMetadata,
          symbolQuoteCcy,
          symbolInstrumentType,
          includeId: false,
        }),
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
      const {
        assetId,
        exchangeMic,
        metadata,
        assetMetadata,
        quoteMode,
        assetKind,
        symbolQuoteCcy,
        symbolInstrumentType,
        ...rest
      } = data as NewActivityFormValues & {
        id: string;
        assetId?: string;
        exchangeMic?: string;
        metadata?: Record<string, unknown>;
        assetMetadata?: { name?: string; kind?: string; exchangeMic?: string };
        quoteMode?: string;
        assetKind?: string;
        symbolQuoteCcy?: string;
        symbolInstrumentType?: string;
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
        symbol: buildSymbolInput({
          assetId,
          exchangeMic,
          quoteMode,
          assetKind,
          assetMetadata,
          symbolQuoteCcy,
          symbolInstrumentType,
          includeId: true,
        }),
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
      assetQuoteMode,
      ...restOfActivityData
    } = activityToDuplicate;

    // For duplicating, use nested asset object
    const createPayload: ActivityCreate = {
      idempotencyKey: generateId("manual-duplicate"),
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
      // Use nested symbol object
      symbol: {
        symbol: assetSymbol,
        exchangeMic,
        quoteMode: assetQuoteMode,
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
      toast.error("Failed to save activities", {
        description: String(error),
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
