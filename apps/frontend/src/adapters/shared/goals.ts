// Goal Commands
import type { Goal, GoalAllocation } from "@/lib/types";
import type { newGoalSchema } from "@/lib/schemas";
import type z from "zod";

import { invoke, logger } from "./platform";

type NewGoal = z.infer<typeof newGoalSchema>;

export const getGoals = async (): Promise<Goal[]> => {
  try {
    return await invoke<Goal[]>("get_goals");
  } catch (error) {
    logger.error("Error fetching goals.");
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
    return await invoke<Goal>("create_goal", { goal: newGoal });
  } catch (error) {
    logger.error("Error creating goal.");
    throw error;
  }
};

export const updateGoal = async (goal: Goal): Promise<Goal> => {
  try {
    return await invoke<Goal>("update_goal", { goal });
  } catch (error) {
    logger.error("Error updating goal.");
    throw error;
  }
};

export const deleteGoal = async (goalId: string): Promise<void> => {
  try {
    await invoke<void>("delete_goal", { goalId });
  } catch (error) {
    logger.error("Error deleting goal.");
    throw error;
  }
};

export const updateGoalsAllocations = async (allocations: GoalAllocation[]): Promise<void> => {
  try {
    await invoke<void>("update_goal_allocations", { allocations });
  } catch (error) {
    logger.error("Error saving goals allocations.");
    throw error;
  }
};

export const getGoalsAllocation = async (): Promise<GoalAllocation[]> => {
  try {
    return await invoke<GoalAllocation[]>("load_goals_allocations");
  } catch (error) {
    logger.error("Error fetching goals allocations.");
    throw error;
  }
};
