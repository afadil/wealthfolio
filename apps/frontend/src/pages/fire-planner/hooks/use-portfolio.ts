import { useQuery } from "@tanstack/react-query";
import { getAccounts, getLatestValuations, getHoldings, getActivities } from "@/adapters";
import type { FireSettings } from "../types";

const INVESTMENT_TYPES = new Set(["SECURITIES", "CRYPTOCURRENCY"]);

export function usePortfolioData(settings?: Pick<FireSettings, "includedAccountIds">) {
  const accountsQuery = useQuery({
    queryKey: ["fire-planner-accounts"],
    queryFn: () => getAccounts(),
    staleTime: 10 * 60 * 1000,
  });

  const accounts = accountsQuery.data ?? [];
  const activeAccounts = accounts.filter((a) => a.isActive && !a.isArchived);

  const activeAccountIds = (
    settings?.includedAccountIds && settings.includedAccountIds.length > 0
      ? activeAccounts.filter((a) => settings.includedAccountIds!.includes(a.id))
      : activeAccounts.filter((a) => INVESTMENT_TYPES.has(a.accountType))
  ).map((a) => a.id);

  const valuationsQuery = useQuery({
    queryKey: ["fire-planner-valuations", activeAccountIds],
    queryFn: () => getLatestValuations(activeAccountIds),
    enabled: activeAccountIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const holdingsQuery = useQuery({
    queryKey: ["fire-planner-holdings"],
    queryFn: () => getHoldings("TOTAL"),
    staleTime: 5 * 60 * 1000,
  });

  const activitiesQuery = useQuery({
    queryKey: ["fire-planner-activities"],
    queryFn: () => getActivities(),
    staleTime: 5 * 60 * 1000,
  });

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
