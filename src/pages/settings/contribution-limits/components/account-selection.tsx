import { useState } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Account, ContributionLimit } from '@/lib/types';
import { useContributionLimitMutations } from '../useContributionLimitMutations';

interface AccountSelectionProps {
  limit: ContributionLimit;
  accounts: Account[];
}

export function AccountSelection({ limit, accounts }: AccountSelectionProps) {
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
          .map((account) => (
            <Toggle
              key={account.id}
              pressed={selectedAccounts.includes(account.id)}
              onPressedChange={() => handleAccountToggle(account.id)}
              variant="outline"
              className="w-full justify-start space-x-2"
            >
              {selectedAccounts.includes(account.id) ? (
                <Icons.CheckCircle className="mr-2 h-6 w-6 text-success" />
              ) : (
                <Icons.Circle className="mr-2 h-6 w-6" />
              )}
              <span>{account.name}</span>
            </Toggle>
          ))}
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
