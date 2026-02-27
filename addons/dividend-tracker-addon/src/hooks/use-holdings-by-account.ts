import { useQueries } from "@tanstack/react-query";
import type { Account, AddonContext, Holding } from "@wealthfolio/addon-sdk";
import { QueryKeys } from "@wealthfolio/addon-sdk";
import { useMemo } from "react";

export function useHoldingsByAccount(
  ctx: AddonContext,
  accounts: Account[],
): { holdings: Holding[]; isLoading: boolean } {
  const queries = useQueries({
    queries: useMemo(
      () =>
        accounts.map((account) => ({
          queryKey: [QueryKeys.HOLDINGS, account.id],
          queryFn: () => ctx.api.portfolio.getHoldings(account.id),
        })),
      [accounts, ctx.api.portfolio],
    ),
  });

  const isLoading = accounts.length > 0 && queries.some((q) => q.isLoading);
  const holdings = useMemo(() => queries.flatMap((q) => q.data ?? []), [queries]);

  return { holdings, isLoading };
}
