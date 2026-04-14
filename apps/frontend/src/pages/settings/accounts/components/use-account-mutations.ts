import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { createAccount, updateAccount, deleteAccount, logger } from "@/adapters";
import i18n from "@/i18n/i18n";
import { QueryKeys } from "@/lib/query-keys";
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

  const handleError = (actionLabel: string) => {
    toast({
      title: i18n.t("settings.accounts.toast_error_title", { action: actionLabel }),
      description: i18n.t("settings.accounts.toast_error_description"),
      variant: "destructive",
    });
  };

  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      handleSuccess(i18n.t("settings.accounts.toast_create_success"));
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error creating account: ${e}`);
      handleError(i18n.t("settings.accounts.toast_action_creating"));
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
      handleError(i18n.t("settings.accounts.toast_action_updating"));
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
      handleError(i18n.t("settings.accounts.toast_action_deleting"));
    },
  });

  return {
    createAccountMutation,
    updateAccountMutation,
    deleteAccountMutation,
  };
}
