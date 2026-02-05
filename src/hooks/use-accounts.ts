import { getAccounts } from "@/commands/account";
import { QueryKeys } from "@/lib/query-keys";
import { Account } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

export function useAccounts(filterActive = true, includeCombinedPortfolios = false) {
  const {
    data: fetchedAccounts = [],
    isLoading,
    isError,
    error,
  } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS, filterActive],
    queryFn: getAccounts,
  });

  // Apply filters
  let filteredAccounts = fetchedAccounts;

  // Filter by active status if requested
  if (filterActive) {
    filteredAccounts = filteredAccounts.filter((account) => account.isActive);
  }

  // Filter out combined portfolios unless explicitly requested
  // Combined portfolios are internal accounts for strategy storage, not user-selectable
  if (!includeCombinedPortfolios) {
    filteredAccounts = filteredAccounts.filter((account) => !account.isCombinedPortfolio);
  }

  return { accounts: filteredAccounts, isLoading, isError, error };
}
