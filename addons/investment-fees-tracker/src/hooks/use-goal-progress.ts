import { useMemo } from "react";
import { useGoals } from "./use-goals";
import { useGoalAllocations } from "./use-goal-allocations";
import { useAccounts } from "./use-accounts";
import { useLatestValuations } from "./use-latest-valuations";
import { calculateGoalProgress } from "../lib/goal-progress";
import { type AddonContext } from "@wealthfolio/addon-sdk";

interface UseGoalProgressOptions {
  ctx: AddonContext;
}

export function useGoalProgress({ ctx }: UseGoalProgressOptions) {
  const { data: goals = [], isLoading: isLoadingGoals, error: goalsError } = useGoals({ ctx });
  const {
    data: allocations = [],
    isLoading: isLoadingAllocations,
    error: allocationsError,
  } = useGoalAllocations({ ctx });
  const {
    data: accounts = [],
    isLoading: isLoadingAccounts,
    error: accountsError,
  } = useAccounts({ ctx });

  const accountIds = useMemo(() => accounts?.map((acc) => acc.id) ?? [], [accounts]);

  const {
    data: latestValuations = [],
    isLoading: isLoadingValuations,
    error: valuationsError,
  } = useLatestValuations({ accountIds, ctx });

  const goalsProgress = useMemo(() => {
    if (!latestValuations || !goals || !allocations) {
      return undefined;
    }
    return calculateGoalProgress(latestValuations, goals, allocations);
  }, [latestValuations, goals, allocations]);

  const isLoading =
    isLoadingAccounts || isLoadingValuations || isLoadingGoals || isLoadingAllocations;
  const error = accountsError || valuationsError || goalsError || allocationsError;

  return {
    goals,
    goalsProgress,
    isLoading,
    error,
  };
}
