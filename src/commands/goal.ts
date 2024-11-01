import z from 'zod';
import { Goal, GoalAllocation } from '@/lib/types';
import { newGoalSchema } from '@/lib/schemas';
import { getRunEnv, RUN_ENV, invokeTauri } from '@/adapters';
import { error as logError } from '@tauri-apps/plugin-log';
type NewGoal = z.infer<typeof newGoalSchema>;

export const getGoals = async (): Promise<Goal[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('get_goals');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error fetching goals.');
    throw error;
  }
};

export const createGoal = async (goal: NewGoal): Promise<Goal> => {
  const newGoal = {
    ...goal,
    yearlyContribution: 0,
    goalType: 'NEEDS',
    isAchieved: false,
  };
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('create_goal', { goal: newGoal });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error creating goal.');
    throw error;
  }
};

export const updateGoal = async (goal: Goal): Promise<Goal> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('update_goal', { goal });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error updating goal.');
    throw error;
  }
};

export const deleteGoal = async (goalId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri('delete_goal', { goalId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error deleting goal.');
    throw error;
  }
};

export const updateGoalsAllocations = async (allocations: GoalAllocation[]): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri('update_goal_allocations', { allocations });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error saving goals allocations.');
    throw error;
  }
};

export const getGoalsAllocation = async (): Promise<GoalAllocation[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri('load_goals_allocations');
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logError('Error fetching goals allocations.');
    throw error;
  }
};
