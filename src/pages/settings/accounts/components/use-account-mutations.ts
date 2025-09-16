import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";
import { createAccount, updateAccount, deleteAccount } from "@/commands/account";
import { QueryKeys } from "@/lib/query-keys";
import { logger } from "@/adapters";
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

  return { createAccountMutation, updateAccountMutation, deleteAccountMutation };
}
