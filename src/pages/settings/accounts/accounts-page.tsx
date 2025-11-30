import { getAccounts } from "@/commands/account";
import { QueryKeys } from "@/lib/query-keys";
import type { Account } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyPlaceholder, Icons, Separator, Skeleton } from "@wealthvn/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";
import { AccountEditModal } from "./components/account-edit-modal";
import { AccountItem } from "./components/account-item";
import { useAccountMutations } from "./components/use-account-mutations";

const SettingsAccountsPage = () => {
  const { t } = useTranslation("settings");
  const { data: accounts, isLoading } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

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
        <SettingsHeader heading={t("accounts.title")} text={t("accounts.description")}>
          {/* Mobile: icon button; Desktop: full button */}
          <>
            <Button
              size="icon"
              className="sm:hidden"
              onClick={() => handleAddAccount()}
              aria-label={t("accounts.addButton")}
            >
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => handleAddAccount()}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              {t("accounts.addButton")}
            </Button>
          </>
        </SettingsHeader>
        <Separator />
        <div className="w-full pt-8">
          {accounts?.length ? (
            <div className="divide-border divide-y rounded-md border">
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
              <EmptyPlaceholder.Title>{t("accounts.empty.title")}</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                {t("accounts.empty.description")}
              </EmptyPlaceholder.Description>
              <Button onClick={() => handleAddAccount()}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                {t("accounts.addAccountButton")}
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
