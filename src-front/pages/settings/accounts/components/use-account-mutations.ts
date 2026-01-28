import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { createAccount, updateAccount, deleteAccount, switchTrackingMode, logger } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { TrackingMode } from "@/lib/types";
interface UseAccountMutationsProps {
  onSuccess?: () => void;
}

export function useAccountMutations({ onSuccess = () => undefined }: UseAccountMutationsProps) {
  const queryClient = useQueryClient();

  const handleSuccess = (message?: string) => {
    onSuccess();
    if (message) {
      toast({ title: message, variant: "success" });
    }
  };

  const handleError = (action: string) => {
    toast({
      title: `Uh oh! Something went wrong ${action} this account.`,
      description: "Please try again or report an issue if the problem persists.",
      variant: "destructive",
    });
  };

  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      handleSuccess("Account created successfully.");
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error creating account: ${e}`);
      handleError("creating");
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: updateAccount,
    onSuccess: () => {
      handleSuccess();
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error updating account: ${e}`);
      handleError("updating");
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      handleSuccess();
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error deleting account: ${e}`);
      handleError("deleting");
    },
  });

  const switchTrackingModeMutation = useMutation({
    mutationFn: ({ accountId, newMode }: { accountId: string; newMode: TrackingMode }) =>
      switchTrackingMode(accountId, newMode),
    onSuccess: () => {
      handleSuccess("Tracking mode switched successfully.");
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error switching tracking mode: ${e}`);
      handleError("switching tracking mode for");
    },
  });

  return {
    createAccountMutation,
    updateAccountMutation,
    deleteAccountMutation,
    switchTrackingModeMutation,
  };
}
