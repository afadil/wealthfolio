import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Account } from "@/lib/types";
import { getAccounts } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";

export function useAccounts(options?: { filterActive?: boolean; includeArchived?: boolean }) {
  const { filterActive = true, includeArchived = false } = options ?? {};

  const {
    data: fetchedAccounts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS, includeArchived],
    queryFn: () => getAccounts(includeArchived),
  });

  const filteredAccounts = useMemo(() => {
    let accounts = fetchedAccounts;

    // Filter inactive if requested
    if (filterActive) {
      accounts = accounts.filter((a) => a.isActive);
    }

    return accounts;
  }, [fetchedAccounts, filterActive]);

  return { accounts: filteredAccounts, isLoading, isError, error, refetch };
}
