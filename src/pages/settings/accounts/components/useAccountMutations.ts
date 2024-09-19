import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { createAccount, updateAccount, deleteAccount } from '@/commands/account';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';
import { QueryKeys } from '@/lib/query-keys';
interface UseAccountMutationsProps {
  onSuccess?: () => void;
}

export function useAccountMutations({ onSuccess = () => {} }: UseAccountMutationsProps) {
  const queryClient = useQueryClient();

  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Account updated successfully.',
  });

  const handleSuccess = (message?: string) => {
    onSuccess();
    if (message) {
      toast({ title: message, variant: 'success' });
    }
  };

  const handleError = (action: string) => {
    toast({
      title: `Uh oh! Something went wrong ${action} this account.`,
      description: 'Please try again or report an issue if the problem persists.',
      variant: 'destructive',
    });
  };

  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      handleSuccess('Account created successfully.');
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: () => handleError('creating'),
  });

  const updateAccountMutation = useMutation({
    mutationFn: updateAccount,
    onSuccess: (updatedAccount) => {
      handleSuccess();
      calculateHistoryMutation.mutate({
        accountIds: [updatedAccount.id],
        forceFullCalculation: true,
      });
    },
    onError: () => handleError('updating'),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      handleSuccess();
      calculateHistoryMutation.mutate({
        accountIds: undefined,
        forceFullCalculation: true,
      });
    },
    onError: () => handleError('deleting'),
  });

  return { createAccountMutation, updateAccountMutation, deleteAccountMutation };
}
