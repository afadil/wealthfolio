import { useState } from 'react';
import { EmptyPlaceholder } from '@/components/empty-placeholder';
import { Separator } from '@/components/ui/separator';
import { AccountItem } from './components/account-item';
import { AccountEditModal } from './components/account-edit-modal';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { Account } from '@/lib/types';
import { SettingsHeader } from '../header';
import { getAccounts } from '@/commands/account';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys } from '@/lib/query-keys';
import { useAccountMutations } from './components/useAccountMutations';

const SettingsAccountsPage = () => {
  const { data: accounts, isLoading } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  const handleAddAccount = () => {
    setSelectedAccount(null);
    setVisibleModal(true);
  };

  const { deleteAccountMutation } = useAccountMutations({});

  const handleEditAccount = (account: Account) => {
    setSelectedAccount(account);
    setVisibleModal(true);
  };

  const handleDeleteAccount = (account: Account) => {
    deleteAccountMutation.mutate(account.id);
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader heading="Accounts" text=" Manage your investment and saving accounts.">
          <Button onClick={() => handleAddAccount()}>
            <Icons.PlusCircle className="mr-2 h-4 w-4" />
            Add account
          </Button>
        </SettingsHeader>
        <Separator />
        <div className="mx-auto w-full pt-8">
          {accounts?.length ? (
            <div className="divide-y divide-border rounded-md border">
              {accounts.map((account: Account) => (
                <AccountItem
                  key={account.id}
                  account={account}
                  onEdit={handleEditAccount}
                  onDelete={handleDeleteAccount}
                />
              ))}
            </div>
          ) : (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="Wallet" />
              <EmptyPlaceholder.Title>No account added!</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                You don&apos;t have any account yet. Start adding your investment accounts.
              </EmptyPlaceholder.Description>
              <Button onClick={() => handleAddAccount()}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add an account
              </Button>
            </EmptyPlaceholder>
          )}
        </div>
      </div>
      <AccountEditModal
        account={selectedAccount}
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
      />
    </>
  );
};

export default SettingsAccountsPage;
