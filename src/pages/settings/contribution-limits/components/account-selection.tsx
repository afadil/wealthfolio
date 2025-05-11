import { useState } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Account, ContributionLimit, DepositsCalculation } from '@/lib/types';
import { useContributionLimitMutations } from '../use-contribution-limit-mutations';
import { formatAmount } from '@/lib/utils';

interface AccountSelectionProps {
  limit: ContributionLimit;
  accounts: Account[];
  deposits: DepositsCalculation | undefined;
  isLoading: boolean;
}

export function AccountSelection({ limit, accounts, deposits, isLoading }: AccountSelectionProps) {
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    limit.accountIds ? limit.accountIds.split(',') : [],
  );
  const { updateContributionLimitMutation } = useContributionLimitMutations();

  const handleAccountToggle = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId],
    );
  };

  const handleSave = () => {
    updateContributionLimitMutation.mutate({
      id: limit.id,
      updatedLimit: {
        ...limit,
        accountIds: selectedAccounts.join(','),
      },
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Select Accounts</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {accounts
          ?.filter((account) => account.isActive)
          .map((account) => {
            const accountDeposit = deposits?.byAccount[account.id];
            return (
              <Toggle
                key={account.id}
                pressed={selectedAccounts.includes(account.id)}
                onPressedChange={() => handleAccountToggle(account.id)}
                variant="outline"
                className="w-full justify-start space-x-2 px-3 py-8"
              >
                <div className="flex w-full items-center">
                  <div className="mr-2">
                    {selectedAccounts.includes(account.id) ? (
                      <Icons.CheckCircle className="h-6 w-6 text-success" />
                    ) : (
                      <Icons.Circle className="h-6 w-6" />
                    )}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{account.name}</span>
                    {isLoading ? (
                      <span className="text-xs text-muted-foreground">Loading...</span>
                    ) : accountDeposit ? (
                      <span className="text-xs font-light text-muted-foreground">
                        {formatAmount(accountDeposit.convertedAmount, deposits.baseCurrency)}{' '}
                        Contributed
                      </span>
                    ) : null}
                  </div>
                </div>
              </Toggle>
            );
          })}
      </div>
      <Button
        onClick={handleSave}
        className="mt-4"
        disabled={updateContributionLimitMutation.isPending}
      >
        {updateContributionLimitMutation.isPending ? 'Saving...' : 'Save Selected Accounts'}
      </Button>
    </div>
  );
}
