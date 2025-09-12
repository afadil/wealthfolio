import { useQuery } from "@tanstack/react-query";
import { Account } from "@/lib/types";
import { getAccounts } from "@/commands/account";
import { QueryKeys } from "@/lib/query-keys";

export function useAccounts(filterActive: boolean = true) {
  const {
    data: fetchedAccounts = [],
    isLoading,
    isError,
    error,
  } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS, filterActive],
    queryFn: getAccounts,
  });

  // Apply active filter if requested
  const filteredAccounts = filterActive
    ? fetchedAccounts.filter((account) => account.isActive)
    : fetchedAccounts;

  return { accounts: filteredAccounts, isLoading, isError, error };
}
