import { useQuery } from "@tanstack/react-query";
import type { Account, AddonContext } from "@wealthfolio/addon-sdk";
import { QueryKeys } from "@wealthfolio/addon-sdk";

export function useAccounts(ctx: AddonContext): { accounts: Account[]; isLoading: boolean } {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: () => ctx.api.accounts.getAll(),
    staleTime: 5 * 60 * 1000,
  });

  return { accounts, isLoading };
}
