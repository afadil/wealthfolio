import { useCallback, useMemo } from "react";
import { logger } from "@/adapters";
import type { ActivityDetails } from "@/lib/types";
import type { AccountSelectOption } from "../components/forms/fields";
import type { NewActivityFormValues } from "../components/forms/schemas";
import {
  ACTIVITY_FORM_CONFIG,
  type ActivityFormValues,
  type PickerActivityType,
} from "../config/activity-form-config";
import { isPureCashActivity } from "../utils/activity-form-utils";
import { useActivityMutations } from "./use-activity-mutations";

export interface UseActivityFormParams {
  accounts: AccountSelectOption[];
  activity?: Partial<ActivityDetails>;
  selectedType: PickerActivityType | undefined;
  onSuccess?: () => void;
}

export interface UseActivityFormReturn {
  /** Default values for the selected form type */
  defaultValues: Partial<ActivityFormValues> | undefined;
  /** Whether we're editing an existing activity */
  isEditing: boolean;
  /** Whether a mutation is in progress */
  isLoading: boolean;
  /** Error from the last mutation */
  error: Error | string | null;
  /** Whether the last mutation resulted in an error */
  isError: boolean;
  /** Submit handler for the selected form type */
  handleSubmit: (data: ActivityFormValues) => Promise<void>;
}

/**
 * Hook that provides all form logic for activity forms.
 * Uses configuration-driven approach for optimal performance.
 */
export function useActivityForm({
  accounts,
  activity,
  selectedType,
  onSuccess,
}: UseActivityFormParams): UseActivityFormReturn {
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onSuccess);

  const isEditing = !!activity?.id;
  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;
  const error = addActivityMutation.error ?? updateActivityMutation.error;
  const isError = addActivityMutation.isError || updateActivityMutation.isError;

  // Get config for selected type (undefined if no type selected)
  const config = selectedType ? ACTIVITY_FORM_CONFIG[selectedType] : undefined;

  // Compute default values only for selected type (lazy evaluation)
  const defaultValues = useMemo(() => {
    if (!config) return undefined;
    return config.getDefaults(activity, accounts);
  }, [config, activity, accounts]);

  // Single submit handler that uses config transform
  const handleSubmit = useCallback(
    async (formData: ActivityFormValues) => {
      if (!config) return;

      try {
        // Transform form data to payload using config
        const basePayload = config.toPayload(formData);

        // Get account currency for pure cash activities
        const accountId = (formData as { accountId?: string }).accountId;
        const account = accounts.find((a) => a.value === accountId);

        const submitData: NewActivityFormValues = {
          ...basePayload,
          activityType: config.activityType as NewActivityFormValues["activityType"],
          // For pure cash activities, include account currency
          ...(isPureCashActivity(config.activityType) && account
            ? { currency: account.currency }
            : {}),
        } as NewActivityFormValues;

        if (isEditing && activity?.id) {
          await updateActivityMutation.mutateAsync({
            id: activity.id,
            ...submitData,
          });
        } else {
          await addActivityMutation.mutateAsync(submitData);
        }
      } catch (err) {
        logger.error(`Activity Form Submit Error: ${JSON.stringify({ error: err, formData })}`);
      }
    },
    [config, accounts, isEditing, activity?.id, addActivityMutation, updateActivityMutation],
  );

  return {
    defaultValues,
    isEditing,
    isLoading,
    error,
    isError,
    handleSubmit,
  };
}
