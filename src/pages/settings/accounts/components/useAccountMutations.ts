import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/use-toast';
import { createAccount, updateAccount } from '@/commands/account';
import { useCalculateHistoryMutation } from '@/hooks/useCalculateHistory';

interface UseAccountMutationsProps {
  onSuccess?: () => void;
}

export function useAccountMutations({ onSuccess = () => {} }: UseAccountMutationsProps) {
  const queryClient = useQueryClient();

  const calculateHistoryMutation = useCalculateHistoryMutation({
    successTitle: 'Account updated successfully.',
  });

  const createMutationOptions = (action: string) => ({
    onSuccess: (account: { id: string }) => {
      queryClient.invalidateQueries();
      calculateHistoryMutation.mutate({
        accountIds: [account.id],
        forceFullCalculation: true,
      });
      onSuccess();
    },
    onError: () => {
      toast({
        title: `Uh oh! Something went wrong ${action} this account.`,
        description: 'Please try again or report an issue if the problem persists.',
        variant: 'success',
      });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    ...createMutationOptions('creating'),
  });

  const updateAccountMutation = useMutation({
    mutationFn: updateAccount,
    ...createMutationOptions('updating'),
  });

  return { createAccountMutation, updateAccountMutation };
}
