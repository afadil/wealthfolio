import z from "zod";
import { Goal, GoalAllocation } from "@/lib/types";
import { newGoalSchema } from "@/lib/schemas";
import { invoke, logger } from "@/adapters";

type NewGoal = z.infer<typeof newGoalSchema>;

export const getGoals = async (): Promise<Goal[]> => {
  try {
    return await invoke("get_goals");
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
    return await invoke("create_goal", { goal: newGoal });
  } catch (error) {
    logger.error("Error creating goal.");
    throw error;
  }
};

export const updateGoal = async (goal: Goal): Promise<Goal> => {
  try {
    return await invoke("update_goal", { goal });
  } catch (error) {
    logger.error("Error updating goal.");
    throw error;
  }
};

export const deleteGoal = async (goalId: string): Promise<void> => {
  try {
    await invoke("delete_goal", { goalId });
  } catch (error) {
    logger.error("Error deleting goal.");
    throw error;
  }
};

export const updateGoalsAllocations = async (allocations: GoalAllocation[]): Promise<void> => {
  try {
    await invoke("update_goal_allocations", { allocations });
  } catch (error) {
    logger.error("Error saving goals allocations.");
    throw error;
  }
};

export const getGoalsAllocation = async (): Promise<GoalAllocation[]> => {
  try {
    return await invoke("load_goals_allocations");
  } catch (error) {
    logger.error("Error fetching goals allocations.");
    throw error;
  }
};
