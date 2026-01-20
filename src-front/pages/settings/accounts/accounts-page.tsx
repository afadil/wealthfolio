import { getAccounts } from "@/adapters";
import { getPlatforms } from "@/features/wealthfolio-connect";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, Platform } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyPlaceholder, Icons, Separator, Skeleton } from "@wealthfolio/ui";
import { useMemo, useState } from "react";
import { SettingsHeader } from "../settings-header";
import { AccountEditModal } from "./components/account-edit-modal";
import { AccountItem } from "./components/account-item";
import { useAccountMutations } from "./components/use-account-mutations";

const SettingsAccountsPage = () => {
  const { data: accounts, isLoading } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  const { data: platforms } = useQuery<Platform[], Error>({
    queryKey: [QueryKeys.PLATFORMS],
    queryFn: getPlatforms,
  });

  // Create a map of platform ID to platform for quick lookup
  const platformMap = useMemo(() => {
    if (!platforms) return new Map<string, Platform>();
    return new Map(platforms.map((p) => [p.id, p]));
  }, [platforms]);

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

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
          {/* Mobile: icon button; Desktop: full button */}
          <>
            <Button
              size="icon"
              className="sm:hidden"
              onClick={() => handleAddAccount()}
              aria-label="Add account"
            >
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => handleAddAccount()}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add account
            </Button>
          </>
        </SettingsHeader>
        <Separator />
        <div className="w-full pt-8">
          {accounts?.length ? (
            <div className="divide-border bg-card divide-y rounded-md border">
              {accounts.map((account: Account) => (
                <AccountItem
                  key={account.id}
                  account={account}
                  platform={account.platformId ? platformMap.get(account.platformId) : undefined}
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
        account={selectedAccount || undefined}
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
      />
    </>
  );
};

export default SettingsAccountsPage;
