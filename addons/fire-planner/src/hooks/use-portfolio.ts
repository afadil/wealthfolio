import { useQuery } from "@tanstack/react-query";
import type { AddonContext, Holding, ActivityDetails, Account } from "@wealthfolio/addon-sdk";
import type { FireSettings } from "../types";

// CASH accounts are bank/current accounts — excluded from the FIRE portfolio by default.
const INVESTMENT_TYPES = new Set(["SECURITIES", "CRYPTOCURRENCY"]);

export function usePortfolioData(
  ctx: AddonContext,
  settings?: Pick<FireSettings, "includedAccountIds">,
) {
  const accountsQuery = useQuery({
    queryKey: ["fire-planner-accounts"],
    queryFn: async (): Promise<Account[]> => {
      const data = await ctx.api.accounts.getAll();
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const accounts = accountsQuery.data ?? [];
  const activeAccounts = accounts.filter((a) => a.isActive && !a.isArchived);

  // If user has explicitly chosen accounts, use those; otherwise default to non-CASH accounts.
  const activeAccountIds = (
    settings?.includedAccountIds && settings.includedAccountIds.length > 0
      ? activeAccounts.filter((a) => settings.includedAccountIds!.includes(a.id))
      : activeAccounts.filter((a) => INVESTMENT_TYPES.has(a.accountType))
  ).map((a) => a.id);

  const valuationsQuery = useQuery({
    queryKey: ["fire-planner-valuations", activeAccountIds],
    queryFn: async () => {
      const data = await ctx.api.portfolio.getLatestValuations(activeAccountIds);
      return data ?? [];
    },
    enabled: activeAccountIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
  });

  const holdingsQuery = useQuery({
    queryKey: ["fire-planner-holdings"],
    queryFn: async (): Promise<Holding[]> => {
      const data = await ctx.api.portfolio.getHoldings("TOTAL");
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
  });

  const activitiesQuery = useQuery({
    queryKey: ["fire-planner-activities"],
    queryFn: async (): Promise<ActivityDetails[]> => {
      const data = await ctx.api.activities.getAll();
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Sum totalValue * fxRateToBase across all accounts for the authoritative base-currency total
  const totalValue = (valuationsQuery.data ?? []).reduce(
    (sum, v) => sum + v.totalValue * v.fxRateToBase,
    0,
  );

  return {
    holdings: holdingsQuery.data ?? [],
    activities: activitiesQuery.data ?? [],
    accounts,
    totalValue,
    isLoading:
      accountsQuery.isLoading ||
      valuationsQuery.isLoading ||
      holdingsQuery.isLoading ||
      activitiesQuery.isLoading,
    error: valuationsQuery.error || holdingsQuery.error || activitiesQuery.error,
  };
}
