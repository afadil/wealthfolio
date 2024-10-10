import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import { getAccounts } from '@/commands/account';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Account } from '@/lib/types';
import { Icons } from '@/components/icons';

interface AccountSelectionProps {
  limitId: string;
}

export function AccountSelection({ limitId }: AccountSelectionProps) {
  const { data: accounts, isLoading } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  useEffect(() => {
    // TODO: Fetch the currently selected accounts for this limit
    // and set them in the selectedAccounts state
  }, [limitId]);

  const handleAccountToggle = (accountId: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId],
    );
  };

  const handleSave = () => {
    // TODO: Implement the save functionality
    console.log('Saving selected accounts:', selectedAccounts);
    toast({
      title: 'Accounts updated',
      description: 'The selected accounts have been updated for this contribution limit.',
    });
  };

  if (isLoading) {
    return <div>Loading accounts...</div>;
  }

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
      <Button onClick={handleSave} className="mt-4">
        Save Selected Accounts
      </Button>
    </div>
  );
}
