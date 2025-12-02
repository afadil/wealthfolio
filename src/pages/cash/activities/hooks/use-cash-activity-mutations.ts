import { logger } from "@/adapters";
import {
  createCashActivity,
  updateCashActivity,
  deleteCashActivity,
  createTransfer,
  NewTransfer,
} from "@/commands/cash-activity";
import { toast } from "@/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import { ActivityCreate, ActivityDetails, ActivityUpdate } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCashActivityMutations(onSuccess?: (activity: { accountId?: string | null }) => void) {
  const queryClient = useQueryClient();

  const createMutationOptions = (action: string) => ({
    onSuccess: (activity: { accountId?: string | null }) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.CASH_ACTIVITIES] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
      if (onSuccess) onSuccess(activity);
    },
    onError: (error: string) => {
      logger.error(`Error ${action} cash activity: ${String(error)}`);
      toast({
        title: `Uh oh! Something went wrong ${action} this activity.`,
        description: `Please try again or report an issue if the problem persists. Error: ${String(error)}`,
        variant: "destructive",
      });
    },
  });

  const addCashActivityMutation = useMutation({
    mutationFn: async (data: ActivityCreate) => {
      return createCashActivity(data);
    },
    ...createMutationOptions("adding"),
  });

  const updateCashActivityMutation = useMutation({
    mutationFn: async (data: ActivityUpdate) => {
      return updateCashActivity(data);
    },
    ...createMutationOptions("updating"),
  });

  const deleteCashActivityMutation = useMutation({
    mutationFn: deleteCashActivity,
    ...createMutationOptions("deleting"),
  });

  const createTransferMutation = useMutation({
    mutationFn: async (data: NewTransfer) => {
      return createTransfer(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.CASH_ACTIVITIES] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
      toast({
        title: "Transfer created successfully",
        variant: "success",
      });
      if (onSuccess) onSuccess({});
    },
    onError: (error: string) => {
      logger.error(`Error creating transfer: ${String(error)}`);
      toast({
        title: "Uh oh! Something went wrong creating the transfer.",
        description: `Please try again or report an issue if the problem persists. Error: ${String(error)}`,
        variant: "destructive",
      });
    },
  });

  const duplicateCashActivity = async (activityToDuplicate: ActivityDetails) => {
    const newActivityData: ActivityCreate = {
      accountId: activityToDuplicate.accountId,
      activityType: activityToDuplicate.activityType,
      activityDate: new Date(activityToDuplicate.date).toISOString(),
      assetId: activityToDuplicate.assetId,
      amount: activityToDuplicate.amount,
      quantity: activityToDuplicate.quantity,
      unitPrice: activityToDuplicate.unitPrice,
      currency: activityToDuplicate.currency,
      fee: activityToDuplicate.fee,
      isDraft: activityToDuplicate.isDraft,
      comment: "Duplicated",
      name: activityToDuplicate.name,
      categoryId: activityToDuplicate.categoryId,
      subCategoryId: activityToDuplicate.subCategoryId,
      eventId: activityToDuplicate.eventId,
    };

    return await createCashActivity(newActivityData);
  };

  const duplicateCashActivityMutation = useMutation({
    mutationFn: duplicateCashActivity,
    ...createMutationOptions("duplicating"),
  });

  return {
    addCashActivityMutation,
    updateCashActivityMutation,
    deleteCashActivityMutation,
    createTransferMutation,
    duplicateCashActivityMutation,
  };
}
