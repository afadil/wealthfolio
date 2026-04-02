import {
  getGoal,
  getGoalFunding,
  getGoalPlan,
  getRetirementOverview,
  getSaveUpOverview,
  saveGoalFunding,
  saveGoalPlan,
  refreshGoalSummary,
} from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type {
  Goal,
  GoalFundingRule,
  GoalFundingRuleInput,
  GoalPlan,
  RetirementOverview,
  SaveGoalPlan,
  SaveUpOverviewDTO,
} from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useGoalDetail(goalId: string | undefined) {
  const goal = useQuery<Goal, Error>({
    queryKey: QueryKeys.goal(goalId ?? ""),
    queryFn: () => getGoal(goalId!),
    enabled: !!goalId,
  });

  const plan = useQuery<GoalPlan | null, Error>({
    queryKey: QueryKeys.goalPlan(goalId ?? ""),
    queryFn: () => getGoalPlan(goalId!),
    enabled: !!goalId,
  });

  const funding = useQuery<GoalFundingRule[], Error>({
    queryKey: QueryKeys.goalFunding(goalId ?? ""),
    queryFn: () => getGoalFunding(goalId!),
    enabled: !!goalId,
  });

  return {
    goal: goal.data,
    plan: plan.data,
    fundingRules: funding.data ?? [],
    isLoading: goal.isLoading || plan.isLoading,
    error: goal.error || plan.error,
  };
}

export function useGoalPlanMutations(goalId: string) {
  const queryClient = useQueryClient();

  const invalidateGoal = () => {
    queryClient.invalidateQueries({ queryKey: QueryKeys.goalPlan(goalId) });
    queryClient.invalidateQueries({ queryKey: QueryKeys.goal(goalId) });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.GOALS] });
    queryClient.invalidateQueries({ queryKey: QueryKeys.saveUpOverview(goalId) });
    queryClient.invalidateQueries({ queryKey: QueryKeys.retirementOverview(goalId) });
  };

  const savePlanMutation = useMutation({
    mutationFn: (plan: SaveGoalPlan) => saveGoalPlan(plan),
    onSuccess: () => {
      invalidateGoal();
      toast.success("Plan saved successfully.");
    },
    onError: () => toast.error("Failed to save plan."),
  });

  const saveFundingMutation = useMutation({
    mutationFn: (rules: GoalFundingRuleInput[]) => saveGoalFunding(goalId, rules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QueryKeys.goalFunding(goalId) });
      invalidateGoal();
      toast.success("Funding saved successfully.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save funding."),
  });

  const refreshSummaryMutation = useMutation({
    mutationFn: () => refreshGoalSummary(goalId),
    onSuccess: () => {
      invalidateGoal();
    },
  });

  return { savePlanMutation, saveFundingMutation, refreshSummaryMutation };
}

export function useRetirementOverview(goalId: string | undefined) {
  return useQuery<RetirementOverview, Error>({
    queryKey: QueryKeys.retirementOverview(goalId ?? ""),
    queryFn: () => getRetirementOverview(goalId!),
    enabled: !!goalId,
  });
}

export function useSaveUpOverview(goalId: string | undefined) {
  return useQuery<SaveUpOverviewDTO, Error>({
    queryKey: QueryKeys.saveUpOverview(goalId ?? ""),
    queryFn: () => getSaveUpOverview(goalId!),
    enabled: !!goalId,
  });
}
