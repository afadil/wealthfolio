import z from "zod";
import {
  Goal,
  GoalWithContributions,
  AccountFreeCash,
  GoalContributionWithStatus,
  NewGoalContribution,
} from "@/lib/types";
import { newGoalSchema } from "@/lib/schemas";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

type NewGoal = z.infer<typeof newGoalSchema>;

export const getGoals = async (): Promise<Goal[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_goals");
      case RUN_ENV.WEB:
        return invokeWeb("get_goals");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching goals.");
    throw error;
  }
};

export const getGoalsWithContributions = async (): Promise<GoalWithContributions[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_goals_with_contributions");
      case RUN_ENV.WEB:
        return invokeWeb("get_goals_with_contributions");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching goals with contributions.");
    throw error;
  }
};

export const createGoal = async (goal: NewGoal): Promise<Goal> => {
  const newGoal = {
    ...goal,
    yearlyContribution: 0,
    goalType: "NEEDS",
    isAchieved: false,
  };
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_goal", { goal: newGoal });
      case RUN_ENV.WEB:
        return invokeWeb("create_goal", { goal: newGoal });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating goal.");
    throw error;
  }
};

export const updateGoal = async (goal: Goal): Promise<Goal> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_goal", { goal });
      case RUN_ENV.WEB:
        return invokeWeb("update_goal", { goal });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating goal.");
    throw error;
  }
};

export const deleteGoal = async (goalId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_goal", { goalId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_goal", { goalId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting goal.");
    throw error;
  }
};

export const getAccountFreeCash = async (accountIds: string[]): Promise<AccountFreeCash[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_account_free_cash", { accountIds });
      case RUN_ENV.WEB:
        return invokeWeb("get_account_free_cash", { accountIds });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching account free cash.");
    throw error;
  }
};

export const addGoalContribution = async (
  contribution: NewGoalContribution,
): Promise<GoalContributionWithStatus> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("add_goal_contribution", { contribution });
      case RUN_ENV.WEB:
        return invokeWeb("add_goal_contribution", { contribution });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error adding goal contribution.");
    throw error;
  }
};

export const removeGoalContribution = async (contributionId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("remove_goal_contribution", { contributionId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("remove_goal_contribution", { contributionId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error removing goal contribution.");
    throw error;
  }
};
