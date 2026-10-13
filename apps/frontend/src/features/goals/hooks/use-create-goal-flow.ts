import { createGoal, saveGoalPlan } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import type { Goal, GoalPlan, NewGoal, SaveGoalPlan } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface CreateGoalFlowInput {
  goal: NewGoal;
  initialPlan?: Omit<SaveGoalPlan, "goalId">;
}

interface CreateGoalFlowResult {
  goal: Goal;
  plan?: GoalPlan;
}

export function useCreateGoalFlow() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<CreateGoalFlowResult, Error, CreateGoalFlowInput>({
    mutationFn: async ({ goal, initialPlan }) => {
      const createdGoal = await createGoal(goal);
      const plan = initialPlan
        ? await saveGoalPlan({
            ...initialPlan,
            goalId: createdGoal.id,
          })
        : undefined;

      return { goal: createdGoal, plan };
    },
    onSuccess: ({ goal }) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.GOALS] });
      queryClient.invalidateQueries({ queryKey: QueryKeys.goal(goal.id) });
      queryClient.invalidateQueries({ queryKey: QueryKeys.goalPlan(goal.id) });
      toast.success(t("goals:goal_saved"));
    },
    onError: (error) => {
      toast.error(error.message || t("goals:goal_error"));
    },
  });
}
